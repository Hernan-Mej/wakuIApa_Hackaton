"""Public endpoints that don't require authentication (health, climatology)."""
import json
import logging

import httpx
from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.core.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


# ─── NASA POWER proxy ───────────────────────────────────────────────────────

NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/climatology/point"
NASA_POWER_DAILY_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
NASA_MONTH_KEYS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                   "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
FALLBACK_MONTHLY = [5.8, 6.0, 6.3, 6.5, 6.2, 5.9, 6.6, 6.8, 6.1, 5.7, 5.6, 5.7]
DAILY_CACHE_TTL = 60 * 60 * 24 * 30  # 30 days — past daily data doesn't change


class ClimatologyResponse(BaseModel):
    lat: float
    lon: float
    monthly: list[float]
    annual: float | None = None
    source: str  # "nasa" | "fallback"
    cached: bool = False


async def _fetch_nasa_climatology(lat: float, lon: float) -> ClimatologyResponse:
    params = {
        "parameters": "ALLSKY_SFC_SW_DWN",
        "community": "RE",
        "longitude": lon,
        "latitude": lat,
        "format": "JSON",
        "start": "2010",
        "end": "2020",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(NASA_POWER_URL, params=params)
            res.raise_for_status()
            data = res.json()
        monthly_dict = data.get("properties", {}).get("parameter", {}).get("ALLSKY_SFC_SW_DWN")
        if not monthly_dict:
            raise ValueError("Respuesta NASA POWER sin datos")
        monthly = [float(monthly_dict.get(k, 5.5)) for k in NASA_MONTH_KEYS]
        annual = monthly_dict.get("ANN")
        return ClimatologyResponse(
            lat=lat, lon=lon, monthly=monthly,
            annual=float(annual) if annual is not None else None,
            source="nasa",
        )
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("NASA POWER fetch failed (%s); using fallback", exc)
        return ClimatologyResponse(
            lat=lat, lon=lon, monthly=FALLBACK_MONTHLY,
            annual=sum(FALLBACK_MONTHLY) / 12, source="fallback",
        )


class DailyEntry(BaseModel):
    day: int
    value: float


class DailyResponse(BaseModel):
    lat: float
    lon: float
    year: int
    month: int  # 1..12
    daily: list[DailyEntry]
    average: float | None = None
    source: str  # "nasa" | "fallback"
    cached: bool = False


def _month_bounds(year: int, month: int) -> tuple[str, str]:
    """Return (YYYYMMDD start, YYYYMMDD end) for the given calendar month."""
    import calendar
    last_day = calendar.monthrange(year, month)[1]
    return f"{year}{month:02d}01", f"{year}{month:02d}{last_day:02d}"


async def _fetch_nasa_daily(lat: float, lon: float, year: int, month: int) -> DailyResponse:
    start, end = _month_bounds(year, month)
    params = {
        "parameters": "ALLSKY_SFC_SW_DWN",
        "community": "RE",
        "longitude": lon,
        "latitude": lat,
        "format": "JSON",
        "start": start,
        "end": end,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(NASA_POWER_DAILY_URL, params=params)
            res.raise_for_status()
            data = res.json()
        daily_dict = data.get("properties", {}).get("parameter", {}).get("ALLSKY_SFC_SW_DWN")
        if not daily_dict:
            raise ValueError("Respuesta NASA POWER daily sin datos")
        entries: list[DailyEntry] = []
        for date_key, raw_value in sorted(daily_dict.items()):
            try:
                value = float(raw_value)
            except (TypeError, ValueError):
                continue
            # NASA uses -999 to mark missing values
            if value < 0:
                continue
            day = int(date_key[-2:])
            entries.append(DailyEntry(day=day, value=round(value, 2)))
        if not entries:
            raise ValueError("Sin valores diarios válidos")
        avg = sum(e.value for e in entries) / len(entries)
        return DailyResponse(
            lat=lat, lon=lon, year=year, month=month,
            daily=entries, average=round(avg, 2), source="nasa",
        )
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("NASA POWER daily fetch failed (%s); using fallback", exc)
        # Fallback: 30 días con la media mensual aproximada de Riohacha
        avg_for_month = FALLBACK_MONTHLY[(month - 1) % 12]
        entries = [DailyEntry(day=d, value=avg_for_month) for d in range(1, 31)]
        return DailyResponse(
            lat=lat, lon=lon, year=year, month=month,
            daily=entries, average=avg_for_month, source="fallback",
        )


@router.get("/solar/daily", response_model=DailyResponse)
async def solar_daily(
    lat: float = Query(11.5449, ge=-90, le=90),
    lon: float = Query(-72.9069, ge=-180, le=180),
    year: int = Query(2024, ge=1981, le=2030),
    month: int = Query(..., ge=1, le=12),
) -> DailyResponse:
    cache_key = f"daily:{round(lat, 3)}:{round(lon, 3)}:{year}-{month:02d}"

    cached_raw = await cache_get(cache_key)
    if cached_raw is not None:
        payload = json.loads(cached_raw)
        payload["cached"] = True
        return DailyResponse(**payload)

    result = await _fetch_nasa_daily(lat, lon, year, month)
    if result.source == "nasa":
        await cache_set(cache_key, result.model_dump_json(), ttl_seconds=DAILY_CACHE_TTL)
    return result


@router.get("/solar/climatology", response_model=ClimatologyResponse)
async def solar_climatology(
    lat: float = Query(11.5449, ge=-90, le=90),
    lon: float = Query(-72.9069, ge=-180, le=180),
) -> ClimatologyResponse:
    cache_key = f"climatology:{round(lat, 3)}:{round(lon, 3)}"

    cached_raw = await cache_get(cache_key)
    if cached_raw is not None:
        payload = json.loads(cached_raw)
        payload["cached"] = True
        return ClimatologyResponse(**payload)

    result = await _fetch_nasa_climatology(lat, lon)
    if result.source == "nasa":
        await cache_set(cache_key, result.model_dump_json())
    return result
