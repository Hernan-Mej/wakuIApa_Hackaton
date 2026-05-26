"""Calculadora de inversión solar — payback, ROI, flujo de caja 25 años.

Funciona para los 3 user_types (persona / comunidad / empresa) ya que sólo
necesita totales (consumo, capacidades). Combina datos NASA POWER + supuestos
de mercado colombianos para producir un análisis financiero realista.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.api.routes import _fetch_nasa_climatology
from app.core.database import get_session
from app.core.security import get_current_user
from app.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/investment", tags=["investment"])

# Supuestos del mercado colombiano (La Guajira) — editables desde el frontend
DEFAULT_COST_PER_KWP_COP = 4_500_000
DEFAULT_COST_PER_KWH_BATTERY_COP = 2_800_000  # baterías LiFePO4
DEFAULT_COST_PER_KW_WIND_COP = 12_000_000     # turbinas micro-eólicas
DEFAULT_TARIFF_COP_KWH = 943
DEFAULT_TARIFF_INFLATION = 0.06               # 6%/año histórico Colombia
DEFAULT_PANEL_DEGRADATION = 0.005             # 0.5%/año
DEFAULT_OM_PCT = 0.015                        # 1.5%/año mantenimiento
DEFAULT_PR = 0.8                              # Performance Ratio
DEFAULT_LIFETIME_YEARS = 25


class InvestmentRequest(BaseModel):
    # Cuántos paneles/baterías/eólicas QUIERE agregar (no lo que ya tiene)
    add_solar_kwp: float = Field(default=0, ge=0)
    add_battery_kwh: float = Field(default=0, ge=0)
    add_wind_kw: float = Field(default=0, ge=0)
    # Overrides opcionales
    cost_per_kwp_cop: float = DEFAULT_COST_PER_KWP_COP
    cost_per_kwh_battery_cop: float = DEFAULT_COST_PER_KWH_BATTERY_COP
    cost_per_kw_wind_cop: float = DEFAULT_COST_PER_KW_WIND_COP
    tariff_cop_per_kwh: float = DEFAULT_TARIFF_COP_KWH
    performance_ratio: float = Field(default=DEFAULT_PR, ge=0.3, le=1.0)
    lifetime_years: int = Field(default=DEFAULT_LIFETIME_YEARS, ge=5, le=40)
    tariff_inflation: float = Field(default=DEFAULT_TARIFF_INFLATION, ge=0, le=0.2)
    sell_excess_pct: float = Field(default=0.7, ge=0, le=1.0,
                                   description="Fracción del excedente que se monetiza (vender a red/comunidad)")


class YearlyCashFlow(BaseModel):
    year: int
    generation_kwh: float
    self_consumed_kwh: float
    excess_kwh: float
    tariff_cop: float
    savings_cop: int
    excess_revenue_cop: int
    om_cost_cop: int
    net_cash_flow_cop: int
    cumulative_cop: int


class InvestmentResponse(BaseModel):
    # Inputs eco
    total_investment_cop: int
    annual_generation_year1_kwh: float
    monthly_grid_consumption_kwh: float
    annual_grid_consumption_kwh: float
    # Resumen
    payback_simple_years: Optional[float]
    payback_dynamic_years: Optional[float]
    irr_estimated_pct: Optional[float]
    total_savings_lifetime_cop: int
    avg_coverage_pct: float
    excess_year1_kwh: float
    # Flujo de caja
    cash_flow: list[YearlyCashFlow]
    # Veredicto
    verdict: str  # "excellent" | "good" | "marginal" | "review"
    verdict_message: str


def _verdict(payback: Optional[float]) -> tuple[str, str]:
    if payback is None:
        return "review", "La inversión no se recupera dentro de la vida útil — revisá dimensionamiento."
    if payback < 4:
        return "excellent", f"✓ EXCELENTE inversión — payback de {payback:.1f} años, muy superior al promedio del mercado."
    if payback < 6:
        return "good", f"✓ BUENA inversión — payback de {payback:.1f} años, retorno competitivo y recomendable."
    if payback < 8:
        return "marginal", f"⚠ MARGINAL — payback de {payback:.1f} años. Evaluá ajustar capacidad o esperar incentivos."
    return "review", f"⚠ REVISAR — payback de {payback:.1f} años, posiblemente sobredimensionado para tu consumo."


def _irr(cash_flows: list[float], guess: float = 0.1) -> Optional[float]:
    """Newton-Raphson IRR. cash_flows[0] = -inversión, resto = flujos netos."""
    rate = guess
    for _ in range(60):
        npv = sum(cf / ((1 + rate) ** i) for i, cf in enumerate(cash_flows))
        dnpv = sum(-i * cf / ((1 + rate) ** (i + 1)) for i, cf in enumerate(cash_flows))
        if abs(dnpv) < 1e-12:
            return None
        new_rate = rate - npv / dnpv
        if abs(new_rate - rate) < 1e-6:
            return new_rate
        rate = new_rate
    return None


async def compute_investment_pure(
    *,
    existing_solar_kwp: float,
    monthly_grid_consumption_kwh: float,
    latitude: float,
    longitude: float,
    req: InvestmentRequest,
) -> InvestmentResponse:
    """Cálculo de inversión sin requerir DB/auth — útil tanto para el endpoint
    REST autenticado como para la tool MCP que recibe el perfil inline."""
    # Capacidad TOTAL después de la inversión (existente + propuesta)
    new_total_kwp = existing_solar_kwp + req.add_solar_kwp

    # Inversión total
    investment_solar = req.add_solar_kwp * req.cost_per_kwp_cop
    investment_battery = req.add_battery_kwh * req.cost_per_kwh_battery_cop
    investment_wind = req.add_wind_kw * req.cost_per_kw_wind_cop
    total_investment = int(investment_solar + investment_battery + investment_wind)

    # Generación anual usando NASA POWER climatología
    clim = await _fetch_nasa_climatology(latitude, longitude)
    annual_avg_radiation = sum(clim.monthly) / len(clim.monthly)  # kWh/m²/día
    daily_gen_y1 = new_total_kwp * annual_avg_radiation * req.performance_ratio
    annual_gen_y1 = daily_gen_y1 * 365

    # Consumo
    annual_consumption = monthly_grid_consumption_kwh * 12

    # Self-consumed: lo que cubre el consumo; resto es excedente
    self_consumed_y1 = min(annual_gen_y1, annual_consumption)
    excess_y1 = max(0, annual_gen_y1 - annual_consumption)
    coverage_y1 = (self_consumed_y1 / annual_consumption * 100) if annual_consumption > 0 else 0

    # Proyectar 25 años con degradación + inflación tarifaria + O&M
    cash_flows: list[YearlyCashFlow] = []
    cum = -total_investment
    npv_flows = [-float(total_investment)]
    payback_simple = None
    payback_dynamic = None
    real_cum_simple = -float(total_investment)
    real_cum_dynamic = -float(total_investment)

    for year in range(1, req.lifetime_years + 1):
        degradation = (1 - DEFAULT_PANEL_DEGRADATION) ** (year - 1)
        gen_n = annual_gen_y1 * degradation
        self_n = min(gen_n, annual_consumption)
        excess_n = max(0, gen_n - annual_consumption)
        tariff_n = req.tariff_cop_per_kwh * ((1 + req.tariff_inflation) ** (year - 1))
        savings_n = self_n * tariff_n
        excess_rev_n = excess_n * tariff_n * req.sell_excess_pct
        om_n = total_investment * DEFAULT_OM_PCT
        net_n = savings_n + excess_rev_n - om_n

        cum += net_n
        # Payback simple: usa flujo del año (sin descontar)
        if payback_simple is None and real_cum_simple + net_n >= 0:
            # Interpolación lineal del año fraccional
            payback_simple = (year - 1) + abs(real_cum_simple) / net_n if net_n > 0 else year
        real_cum_simple += net_n

        # Payback dinámico: descuenta a 10% (costo de oportunidad típico)
        discount = (1.10) ** (year - 1)
        net_discounted = net_n / discount
        if payback_dynamic is None and real_cum_dynamic + net_discounted >= 0:
            payback_dynamic = (year - 1) + abs(real_cum_dynamic) / net_discounted if net_discounted > 0 else year
        real_cum_dynamic += net_discounted

        npv_flows.append(net_n)
        cash_flows.append(YearlyCashFlow(
            year=year,
            generation_kwh=round(gen_n, 1),
            self_consumed_kwh=round(self_n, 1),
            excess_kwh=round(excess_n, 1),
            tariff_cop=round(tariff_n, 2),
            savings_cop=int(savings_n),
            excess_revenue_cop=int(excess_rev_n),
            om_cost_cop=int(om_n),
            net_cash_flow_cop=int(net_n),
            cumulative_cop=int(cum),
        ))

    irr = _irr(npv_flows)
    if irr is not None:
        irr = round(irr * 100, 2)

    verdict_code, verdict_msg = _verdict(payback_simple)

    return InvestmentResponse(
        total_investment_cop=total_investment,
        annual_generation_year1_kwh=round(annual_gen_y1, 1),
        monthly_grid_consumption_kwh=monthly_grid_consumption_kwh,
        annual_grid_consumption_kwh=annual_consumption,
        payback_simple_years=round(payback_simple, 2) if payback_simple else None,
        payback_dynamic_years=round(payback_dynamic, 2) if payback_dynamic else None,
        irr_estimated_pct=irr,
        total_savings_lifetime_cop=int(sum(f.net_cash_flow_cop for f in cash_flows)),
        avg_coverage_pct=round(coverage_y1, 1),
        excess_year1_kwh=round(excess_y1, 1),
        cash_flow=cash_flows,
        verdict=verdict_code,
        verdict_message=verdict_msg,
    )


@router.post("/calculate", response_model=InvestmentResponse)
async def calculate_investment(
    req: InvestmentRequest,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),  # noqa: ARG001 — kept for future auth-bound logic
) -> InvestmentResponse:
    profile = current.profile
    if profile is None:
        raise HTTPException(status_code=400, detail="Completá primero tu perfil")
    return await compute_investment_pure(
        existing_solar_kwp=profile.solar_capacity_kwp,
        monthly_grid_consumption_kwh=profile.monthly_grid_consumption_kwh,
        latitude=profile.latitude,
        longitude=profile.longitude,
        req=req,
    )
