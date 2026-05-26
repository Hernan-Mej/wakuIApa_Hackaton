"""MCP server (Model Context Protocol) exposing WakuAIpa's energy intelligence
as tools consumable by any MCP client — Claude, OpenAI Agents, IDEs, etc.

Transport: SSE (Server-Sent Events). The Starlette routes are mounted by
``app.main`` so a client connecting to ``GET /sse`` opens the event stream and
posts JSON-RPC messages to ``POST /mcp/messages/``.

Tools intentionally avoid auth so external agents can use them out of the box.
They take the company profile inline rather than reading it from the DB so the
calling agent can keep state itself.
"""
import logging
from typing import Any, Optional

from mcp.server.fastmcp import FastMCP
from mcp.server.sse import SseServerTransport

from app.api.chat import _build_system_prompt, _call_lmstudio, _fallback_reply
from app.api.investment import InvestmentRequest, compute_investment_pure
from app.api.netmetering import compute_net_metering_pure
from app.api.routes import _fetch_nasa_climatology, _fetch_nasa_daily
from app.api.weather import weather_forecast
from app.api.geocode import geocode_reverse, geocode_forward
from app.core.config import settings
from app.models import BatteryType, ChatKind, GeneratorFuel, Profile, Sector, UserType

logger = logging.getLogger(__name__)

TARIFA_DEFAULT_COP_KWH = 943
SOLAR_EFFICIENCY_DEFAULT = 0.8
WEATHER_MULTIPLIERS = {
    "sunny": 1.0,
    "cloudy": 0.6,
    "rain": 0.3,
    "storm": 0.15,
}

mcp = FastMCP(
    name="WakuAIpa Energy Agent",
    instructions=(
        "Tools de inteligencia energética para empresas en Riohacha, La Guajira "
        "(Colombia). Datos satelitales NASA POWER, cálculo de generación solar, "
        "ahorros y planes de triaje ante apagones. Tarifa regional default: "
        f"{TARIFA_DEFAULT_COP_KWH} COP/kWh."
    ),
)


# ─── Read-only NASA POWER tools ─────────────────────────────────────────────


@mcp.tool()
async def get_solar_climatology(
    lat: float = 11.5449,
    lon: float = -72.9069,
) -> dict[str, Any]:
    """Promedios mensuales (climatología 2010-2020) de radiación solar global
    horizontal (ALLSKY_SFC_SW_DWN, kWh/m²/día) según NASA POWER.

    Args:
        lat: Latitud decimal (default: 11.5449 = Riohacha).
        lon: Longitud decimal (default: -72.9069 = Riohacha).

    Returns:
        monthly[12], annual, source ('nasa' | 'fallback'), cached.
    """
    res = await _fetch_nasa_climatology(lat, lon)
    return res.model_dump()


@mcp.tool()
async def get_solar_daily(
    year: int,
    month: int,
    lat: float = 11.5449,
    lon: float = -72.9069,
) -> dict[str, Any]:
    """Radiación solar diaria (kWh/m²/día) para un mes y año específicos.
    Útil para reconstruir la variabilidad real vs. la media histórica.

    Args:
        year: Año calendario (1981-2030).
        month: Mes 1..12.
        lat: Latitud decimal (default: Riohacha).
        lon: Longitud decimal (default: Riohacha).
    """
    res = await _fetch_nasa_daily(lat, lon, year, month)
    return res.model_dump()


# ─── Pure-calculation tools ─────────────────────────────────────────────────


@mcp.tool()
def compute_solar_projection(
    monthly_consumption_kwh: float,
    solar_capacity_kwp: float,
    average_daily_radiation_kwh_m2: float,
    performance_ratio: float = SOLAR_EFFICIENCY_DEFAULT,
    weather: str = "sunny",
    tariff_cop_per_kwh: float = TARIFA_DEFAULT_COP_KWH,
) -> dict[str, Any]:
    """Calcula generación, cobertura solar y ahorros mensuales bajo una
    condición climática dada. Sin estado: el agente proporciona los inputs.

    Args:
        monthly_consumption_kwh: Consumo eléctrico mensual.
        solar_capacity_kwp: Capacidad PV instalada.
        average_daily_radiation_kwh_m2: Radiación promedio diaria de NASA POWER.
        performance_ratio: Eficiencia del sistema 0.3..1.0 (default 0.8).
        weather: 'sunny' | 'cloudy' | 'rain' | 'storm' (default 'sunny').
        tariff_cop_per_kwh: Tarifa eléctrica local (default 943 COP/kWh).
    """
    multiplier = WEATHER_MULTIPLIERS.get(weather, 1.0)
    effective_radiation = average_daily_radiation_kwh_m2 * multiplier

    daily_gen = solar_capacity_kwp * effective_radiation * performance_ratio
    monthly_gen = daily_gen * 30
    coverage_pct = (
        min(100, (monthly_gen / monthly_consumption_kwh) * 100)
        if monthly_consumption_kwh > 0 else 0.0
    )
    savings_ceiling = round(monthly_gen * tariff_cop_per_kwh)
    actual_savings = round(min(monthly_gen, monthly_consumption_kwh) * tariff_cop_per_kwh)
    required_rad = (
        (monthly_consumption_kwh / 30) / (solar_capacity_kwp * performance_ratio)
        if solar_capacity_kwp > 0 and performance_ratio > 0 else 0.0
    )

    return {
        "weather": weather,
        "weather_multiplier": multiplier,
        "effective_radiation_kwh_m2": round(effective_radiation, 3),
        "daily_generation_kwh": round(daily_gen, 2),
        "monthly_generation_kwh": round(monthly_gen, 2),
        "coverage_pct": round(coverage_pct, 1),
        "monthly_savings_ceiling_cop": savings_ceiling,
        "monthly_actual_savings_cop": actual_savings,
        "required_daily_radiation_kwh_m2": round(required_rad, 2),
        "tariff_cop_per_kwh": tariff_cop_per_kwh,
    }


# ─── LLM-backed tools (local LM Studio) ─────────────────────────────────────


def _profile_from_inputs(
    display_name: str,
    user_type: str,
    monthly_grid_consumption_kwh: float,
    solar_capacity_kwp: float = 0,
    battery_capacity_kwh: float = 0,
    generator_capacity_kw: float = 0,
    wind_capacity_kw: float = 0,
    sector: Optional[str] = None,
    operating_hours: str = "24/7",
    critical_loads_count: int = 0,
    flexible_loads_count: int = 0,
    latitude: float = 11.5449,
    longitude: float = -72.9069,
    address: str = "",
    extra_data: Optional[dict] = None,
) -> tuple[Profile, UserType]:
    """Build an in-memory Profile + UserType for prompt construction (no DB write).

    The agent passes already-totaled capacities (kWp, kWh) — internally we
    synthesise the structured fields so the prompt builder works unchanged.
    """
    try:
        utype = UserType(user_type.lower())
    except ValueError:
        utype = UserType.PERSON

    sector_enum: Optional[Sector] = None
    if sector:
        try:
            sector_enum = Sector(sector.lower())
        except ValueError:
            sector_enum = Sector.OTRO

    # Synthesise "one big panel / battery" so the totals match exactly
    solar_panels_count = 1 if solar_capacity_kwp > 0 else 0
    solar_panel_watts = solar_capacity_kwp * 1000 if solar_capacity_kwp > 0 else 0
    battery_count = 1 if battery_capacity_kwh > 0 else 0
    wind_turbine_count = 1 if wind_capacity_kw > 0 else 0

    profile = Profile(
        user_id=0,
        display_name=display_name,
        latitude=latitude, longitude=longitude, address=address,
        monthly_grid_consumption_kwh=monthly_grid_consumption_kwh,
        solar_panels_count=solar_panels_count,
        solar_panel_watts=solar_panel_watts,
        battery_count=battery_count,
        battery_kwh_each=battery_capacity_kwh,
        battery_type=BatteryType.LITHIUM if battery_capacity_kwh > 0 else BatteryType.NONE,
        wind_turbine_count=wind_turbine_count,
        wind_turbine_kw_each=wind_capacity_kw,
        generator_capacity_kw=generator_capacity_kw,
        generator_fuel=GeneratorFuel.DIESEL if generator_capacity_kw > 0 else GeneratorFuel.NONE,
        sector=sector_enum,
        operating_hours=operating_hours,
        critical_loads_count=critical_loads_count,
        flexible_loads_count=flexible_loads_count,
        extra_data=extra_data or {},
    )
    return profile, utype


@mcp.tool()
async def recommend_energy_action(
    display_name: str,
    user_type: str,
    monthly_grid_consumption_kwh: float,
    solar_capacity_kwp: float = 0,
    battery_capacity_kwh: float = 0,
    wind_capacity_kw: float = 0,
    generator_capacity_kw: float = 0,
    sector: Optional[str] = None,
    critical_loads_count: int = 0,
    flexible_loads_count: int = 0,
    operating_hours: str = "24/7",
    latitude: float = 11.5449,
    longitude: float = -72.9069,
    weather: str = "sunny",
    extra_data: Optional[dict] = None,
    user_question: str = "Dame una recomendación de ahorro energético para hoy.",
) -> dict[str, Any]:
    """Recomendación personalizada del agente solar local (LM Studio).
    El cliente pasa el perfil inline — no se persiste.

    Args:
        display_name: Nombre de la persona / comunidad / empresa.
        user_type: 'person' | 'community' | 'business' — cambia el tono del LLM.
        sector: Sólo para empresas: hotel | industrial | retail | hospital |
                oficina | educacion | restaurante | otro.
        weather: 'sunny' | 'cloudy' | 'rain' | 'storm'.
        extra_data: campos específicos (rooms_standard, household_size, etc.)
    """
    profile, utype = _profile_from_inputs(
        display_name=display_name, user_type=user_type,
        monthly_grid_consumption_kwh=monthly_grid_consumption_kwh,
        solar_capacity_kwp=solar_capacity_kwp,
        battery_capacity_kwh=battery_capacity_kwh,
        wind_capacity_kw=wind_capacity_kw,
        generator_capacity_kw=generator_capacity_kw,
        sector=sector,
        critical_loads_count=critical_loads_count,
        flexible_loads_count=flexible_loads_count,
        operating_hours=operating_hours,
        latitude=latitude, longitude=longitude,
        extra_data=extra_data,
    )
    system_prompt = _build_system_prompt(profile, ChatKind.PREDICTION, utype)
    if weather != "sunny":
        system_prompt += (
            f"\n\nCondición climática actual: {weather.upper()} "
            f"(radiación efectiva ~{WEATHER_MULTIPLIERS.get(weather, 1.0) * 100:.0f}% "
            "de la radiación NASA normal). Ajustá las recomendaciones a esta condición."
        )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_question},
    ]
    try:
        reply = await _call_lmstudio(messages)
        if not reply:
            reply = _fallback_reply(user_question, profile)
            source = "fallback"
        else:
            source = "lmstudio"
    except Exception as exc:
        logger.warning("MCP recommend_energy_action LLM failed: %r", exc)
        reply = _fallback_reply(user_question, profile)
        source = "fallback"

    return {"recommendation": reply, "source": source, "model": settings.lmstudio_model}


@mcp.tool()
async def simulate_blackout_plan(
    display_name: str,
    user_type: str,
    monthly_grid_consumption_kwh: float,
    solar_capacity_kwp: float = 0,
    battery_capacity_kwh: float = 0,
    wind_capacity_kw: float = 0,
    generator_capacity_kw: float = 0,
    sector: Optional[str] = None,
    critical_loads_count: int = 0,
    flexible_loads_count: int = 0,
    operating_hours: str = "24/7",
    extra_data: Optional[dict] = None,
) -> dict[str, Any]:
    """Plan de triaje ante apagón: estima autonomía (baterías + generador) y pide
    al LLM local el plan accionable. Adapta el tono según `user_type`
    (person | community | business).
    """
    profile, utype = _profile_from_inputs(
        display_name=display_name, user_type=user_type,
        monthly_grid_consumption_kwh=monthly_grid_consumption_kwh,
        solar_capacity_kwp=solar_capacity_kwp,
        battery_capacity_kwh=battery_capacity_kwh,
        wind_capacity_kw=wind_capacity_kw,
        generator_capacity_kw=generator_capacity_kw,
        sector=sector,
        critical_loads_count=critical_loads_count,
        flexible_loads_count=flexible_loads_count,
        operating_hours=operating_hours,
        extra_data=extra_data,
    )

    avg_hourly_kw = monthly_grid_consumption_kwh / 720 if monthly_grid_consumption_kwh else 0
    if utype == UserType.BUSINESS:
        critical_load_kw = max(critical_loads_count * 0.4, avg_hourly_kw * 0.3)
    else:
        critical_load_kw = max(0.3, avg_hourly_kw * 0.4)
    battery_hours = battery_capacity_kwh / critical_load_kw if critical_load_kw > 0 else 0
    generator_hours = (
        (generator_capacity_kw * 8) / critical_load_kw
        if critical_load_kw > 0 and generator_capacity_kw > 0 else 0
    )
    autonomy_hours = round(battery_hours + generator_hours, 1)

    user_prompt = (
        f"Hay un APAGÓN en curso. Carga crítica estimada ~{critical_load_kw:.2f} kW, "
        f"autonomía con baterías ~{battery_hours:.1f}h + generador ~{generator_hours:.1f}h "
        f"= ~{autonomy_hours:.1f}h totales. Dame un plan de triaje inmediato: qué "
        "priorizar, qué apagar YA, y cómo extender la autonomía. Máximo 180 palabras."
    )
    system_prompt = _build_system_prompt(profile, ChatKind.BLACKOUT, utype)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    try:
        plan = await _call_lmstudio(messages)
        if not plan:
            plan = _fallback_reply(user_prompt, profile)
            source = "fallback"
        else:
            source = "lmstudio"
    except Exception as exc:
        logger.warning("MCP simulate_blackout_plan LLM failed: %r", exc)
        plan = _fallback_reply(user_prompt, profile)
        source = "fallback"

    return {
        "critical_load_kw": round(critical_load_kw, 2),
        "battery_hours": round(battery_hours, 1),
        "generator_hours": round(generator_hours, 1),
        "estimated_autonomy_hours": autonomy_hours,
        "plan": plan,
        "source": source,
    }


# ─── Forecast & geocoding tools ─────────────────────────────────────────────


@mcp.tool()
async def get_weather_forecast(
    lat: float = 11.5449,
    lon: float = -72.9069,
    days: int = 7,
) -> dict[str, Any]:
    """Pronóstico clima 1-14 días (Open-Meteo): radiación solar (kWh/m²/día),
    viento a 10m y 80m extrapolado (m/s), lluvia, temperatura, código WMO.
    Útil para decidir si conviene racionar, almacenar, vender o aprovechar
    en los próximos días.

    Args:
        lat: Latitud decimal (default Riohacha).
        lon: Longitud decimal (default Riohacha).
        days: Días a pronosticar (1..14).
    """
    days = max(1, min(14, days))
    res = await weather_forecast(lat=lat, lon=lon, days=days)
    return res.model_dump()


@mcp.tool()
async def calculate_investment(
    existing_solar_kwp: float,
    monthly_grid_consumption_kwh: float,
    add_solar_kwp: float = 0,
    add_battery_kwh: float = 0,
    add_wind_kw: float = 0,
    latitude: float = 11.5449,
    longitude: float = -72.9069,
    cost_per_kwp_cop: float = 4_500_000,
    cost_per_kwh_battery_cop: float = 2_800_000,
    cost_per_kw_wind_cop: float = 12_000_000,
    tariff_cop_per_kwh: float = 943,
    performance_ratio: float = 0.8,
    sell_excess_pct: float = 0.7,
    lifetime_years: int = 25,
    tariff_inflation: float = 0.06,
) -> dict[str, Any]:
    """Calcula la viabilidad financiera de una inversión solar/eólica/baterías.
    Devuelve: inversión total, generación año 1, payback simple + dinámico,
    TIR estimada, ahorro acumulado 25 años, flujo de caja anual y veredicto.

    Args:
        existing_solar_kwp: Capacidad solar YA instalada (no se incluye en el costo).
        monthly_grid_consumption_kwh: Consumo eléctrico mensual.
        add_solar_kwp / add_battery_kwh / add_wind_kw: Capacidades a SUMAR.
        sell_excess_pct: Fracción del excedente monetizable (vender a red/comunidad).
        Costos en COP, valores típicos La Guajira: $4.5M/kWp, $2.8M/kWh batería, $12M/kW eólica.
    """
    req = InvestmentRequest(
        add_solar_kwp=add_solar_kwp,
        add_battery_kwh=add_battery_kwh,
        add_wind_kw=add_wind_kw,
        cost_per_kwp_cop=cost_per_kwp_cop,
        cost_per_kwh_battery_cop=cost_per_kwh_battery_cop,
        cost_per_kw_wind_cop=cost_per_kw_wind_cop,
        tariff_cop_per_kwh=tariff_cop_per_kwh,
        performance_ratio=performance_ratio,
        sell_excess_pct=sell_excess_pct,
        lifetime_years=lifetime_years,
        tariff_inflation=tariff_inflation,
    )
    res = await compute_investment_pure(
        existing_solar_kwp=existing_solar_kwp,
        monthly_grid_consumption_kwh=monthly_grid_consumption_kwh,
        latitude=latitude,
        longitude=longitude,
        req=req,
    )
    return res.model_dump()


@mcp.tool()
async def calculate_net_metering(
    solar_capacity_kwp: float,
    monthly_grid_consumption_kwh: float,
    latitude: float = 11.5449,
    longitude: float = -72.9069,
    tariff_cop_per_kwh: float = 943,
    export_rate_factor: float = 0.55,
    performance_ratio: float = 0.8,
) -> dict[str, Any]:
    """Balance neto mensual: cuánto exportarías a la red (excedente) vs cuánto
    comprarías (déficit), mes a mes, con créditos según CREG 030/2018.

    El autogenerador < 100 kW puede vender excedentes recibiendo ~55% de la
    tarifa retail como crédito (configurable con export_rate_factor).
    """
    res = await compute_net_metering_pure(
        solar_capacity_kwp=solar_capacity_kwp,
        monthly_grid_consumption_kwh=monthly_grid_consumption_kwh,
        latitude=latitude,
        longitude=longitude,
        tariff_cop_per_kwh=tariff_cop_per_kwh,
        export_rate_factor=export_rate_factor,
        performance_ratio=performance_ratio,
    )
    return res.model_dump()


@mcp.tool()
async def geocode_lookup(
    query: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> dict[str, Any]:
    """Geocoding vía Nominatim/OSM.
    - Si pasás `query` (texto): devuelve hasta 5 ubicaciones que coincidan.
    - Si pasás `lat` + `lon`: resuelve coordenadas a dirección legible.

    Útil para que el agente convierta lat/lon arbitrarios a algo legible para
    el usuario, o para resolver una ciudad/barrio a coordenadas antes de
    consultar NASA/Open-Meteo.
    """
    if query:
        results = await geocode_forward(q=query)
        return {"mode": "forward", "results": [r.model_dump() for r in results]}
    if lat is not None and lon is not None:
        result = await geocode_reverse(lat=lat, lon=lon)
        return {"mode": "reverse", "result": result.model_dump()}
    return {"error": "Provide either `query` or both `lat` and `lon`."}


# ─── SSE transport (mounted by main.py) ─────────────────────────────────────

# The transport keeps a per-session message queue. Client posts incoming
# JSON-RPC messages to /mcp/messages/ which routes them to the right session.
sse_transport = SseServerTransport("/mcp/messages/")
