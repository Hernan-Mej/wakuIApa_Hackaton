"""Weather forecast via Open-Meteo (free, no API key).

Devuelve 7-14 días con radiación solar + viento a 10/80m, lluvia y temperatura.
Cacheado en Redis por 1 hora (los pronósticos se actualizan ~cada hora).
"""
import json
import logging

import httpx
from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.core.cache import cache_get, cache_set

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/weather", tags=["weather"])

OPENMETEO_URL = "https://api.open-meteo.com/v1/forecast"
WEATHER_CACHE_TTL = 60 * 60  # 1h


class WeatherDay(BaseModel):
    date: str                          # YYYY-MM-DD
    radiation_kwh_m2: float            # daily shortwave radiation sum
    wind_speed_10m_max_ms: float       # max @ 10m
    wind_speed_80m_max_ms: float       # max @ 80m (mejor proxy para turbinas)
    temperature_min_c: float
    temperature_max_c: float
    precipitation_mm: float
    precipitation_probability_pct: float
    weather_code: int                  # WMO code (sol, lluvia, tormenta...)
    weather_label: str                 # "soleado" | "nublado" | "lluvia" | ...


class WeatherForecastResponse(BaseModel):
    lat: float
    lon: float
    timezone: str
    forecast_days: int
    days: list[WeatherDay]
    source: str  # "open-meteo" | "fallback"
    cached: bool = False


# WMO weather codes — https://open-meteo.com/en/docs
WMO_LABELS = {
    0: "soleado",
    1: "mayormente soleado", 2: "parcialmente nublado", 3: "nublado",
    45: "niebla", 48: "niebla con escarcha",
    51: "llovizna ligera", 53: "llovizna", 55: "llovizna intensa",
    61: "lluvia ligera", 63: "lluvia", 65: "lluvia intensa",
    66: "lluvia helada", 67: "lluvia helada intensa",
    71: "nieve ligera", 73: "nieve", 75: "nieve intensa",
    80: "chubascos ligeros", 81: "chubascos", 82: "chubascos intensos",
    95: "tormenta", 96: "tormenta con granizo", 99: "tormenta intensa",
}


def _label(code: int) -> str:
    return WMO_LABELS.get(code, f"código {code}")


def _fallback(lat: float, lon: float, days: int) -> WeatherForecastResponse:
    """Si Open-Meteo falla, devolvemos un pronóstico "soleado típico" basado en
    los promedios climatológicos de Riohacha — para que el dashboard nunca
    quede sin datos."""
    from datetime import datetime, timedelta
    today = datetime.utcnow().date()
    fake = [
        WeatherDay(
            date=(today + timedelta(days=i)).isoformat(),
            radiation_kwh_m2=5.5,
            wind_speed_10m_max_ms=6.0,
            wind_speed_80m_max_ms=9.0,
            temperature_min_c=24, temperature_max_c=32,
            precipitation_mm=0,
            precipitation_probability_pct=10,
            weather_code=1,
            weather_label="mayormente soleado",
        )
        for i in range(days)
    ]
    return WeatherForecastResponse(
        lat=lat, lon=lon, timezone="America/Bogota",
        forecast_days=days, days=fake, source="fallback",
    )


@router.get("/forecast", response_model=WeatherForecastResponse)
async def weather_forecast(
    lat: float = Query(11.5449, ge=-90, le=90),
    lon: float = Query(-72.9069, ge=-180, le=180),
    days: int = Query(7, ge=1, le=14),
) -> WeatherForecastResponse:
    cache_key = f"openmeteo:{round(lat, 3)}:{round(lon, 3)}:{days}"
    cached = await cache_get(cache_key)
    if cached:
        payload = json.loads(cached)
        payload["cached"] = True
        return WeatherForecastResponse(**payload)

    # Open-Meteo wants repeated `daily=X` params (not comma-separated).
    params: list[tuple[str, str | float | int]] = [
        ("latitude", lat),
        ("longitude", lon),
        ("daily", "shortwave_radiation_sum"),
        ("daily", "wind_speed_10m_max"),
        ("daily", "wind_gusts_10m_max"),
        ("daily", "temperature_2m_max"),
        ("daily", "temperature_2m_min"),
        ("daily", "precipitation_sum"),
        ("daily", "precipitation_probability_max"),
        ("daily", "weather_code"),
        ("timezone", "America/Bogota"),
        ("forecast_days", days),
    ]
    KMH_TO_MS = 1 / 3.6
    # Wind shear: extrapolate 10m → 80m using power law (alpha ~0.14 for open land)
    # v80 = v10 * (80/10)^0.14 ≈ v10 * 1.327
    WIND_SHEAR_FACTOR_80M = (80 / 10) ** 0.14
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(OPENMETEO_URL, params=params)
            res.raise_for_status()
            data = res.json()
        d = data.get("daily") or {}
        dates = d.get("time") or []
        if not dates:
            raise ValueError("Open-Meteo sin datos diarios")
        # shortwave_radiation_sum viene en MJ/m²; convertir a kWh/m² (÷ 3.6)
        rads_mj = d.get("shortwave_radiation_sum") or [0] * len(dates)
        ws10 = d.get("wind_speed_10m_max") or [0] * len(dates)
        # 80m not available in daily aggregation — extrapolar con wind shear
        ws80 = [v * WIND_SHEAR_FACTOR_80M for v in ws10]
        tmin = d.get("temperature_2m_min") or [0] * len(dates)
        tmax = d.get("temperature_2m_max") or [0] * len(dates)
        precip = d.get("precipitation_sum") or [0] * len(dates)
        precip_prob = d.get("precipitation_probability_max") or [0] * len(dates)
        codes = d.get("weather_code") or [0] * len(dates)
        days_out = [
            WeatherDay(
                date=date,
                radiation_kwh_m2=round((rads_mj[i] or 0) / 3.6, 2),
                wind_speed_10m_max_ms=round((ws10[i] or 0) * KMH_TO_MS, 1),
                wind_speed_80m_max_ms=round((ws80[i] or 0) * KMH_TO_MS, 1),
                temperature_min_c=round(tmin[i] or 0, 1),
                temperature_max_c=round(tmax[i] or 0, 1),
                precipitation_mm=round(precip[i] or 0, 1),
                precipitation_probability_pct=float(precip_prob[i] or 0),
                weather_code=int(codes[i] or 0),
                weather_label=_label(int(codes[i] or 0)),
            )
            for i, date in enumerate(dates)
        ]
        result = WeatherForecastResponse(
            lat=lat, lon=lon,
            timezone=data.get("timezone", "America/Bogota"),
            forecast_days=days, days=days_out, source="open-meteo",
        )
        await cache_set(cache_key, result.model_dump_json(), ttl_seconds=WEATHER_CACHE_TTL)
        return result
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        logger.warning("Open-Meteo fetch failed (%s); using fallback", exc)
        return _fallback(lat, lon, days)
