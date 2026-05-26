"""Geocoding vía Nominatim (OpenStreetMap) — gratis, sin API key.

- `/forward?q=...` → busca por texto, devuelve lat/lon + dirección
- `/reverse?lat=&lon=` → resuelve coordenadas a dirección legible

Nominatim pide un User-Agent identificable y respetar 1 req/seg.
"""
import json
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.cache import cache_get, cache_set

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/geocode", tags=["geocode"])

NOMINATIM_URL = "https://nominatim.openstreetmap.org"
HEADERS = {"User-Agent": "WakuAIpa-EnergyAgent/1.0 (hackaton@riohacha.demo)"}
GEOCODE_CACHE_TTL = 60 * 60 * 24 * 30  # 30 días — las direcciones cambian poco


class GeocodeResult(BaseModel):
    lat: float
    lon: float
    display_name: str
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postcode: Optional[str] = None


def _parse(item: dict) -> GeocodeResult:
    addr = item.get("address", {}) or {}
    return GeocodeResult(
        lat=float(item["lat"]),
        lon=float(item["lon"]),
        display_name=item.get("display_name", ""),
        city=addr.get("city") or addr.get("town") or addr.get("village") or addr.get("hamlet"),
        state=addr.get("state") or addr.get("region"),
        country=addr.get("country"),
        postcode=addr.get("postcode"),
    )


@router.get("/forward", response_model=list[GeocodeResult])
async def geocode_forward(q: str = Query(..., min_length=2)) -> list[GeocodeResult]:
    """Busca direcciones por texto (autocomplete-style)."""
    cache_key = f"geo:fwd:{q.lower().strip()}"
    cached = await cache_get(cache_key)
    if cached:
        return [GeocodeResult(**r) for r in json.loads(cached)]

    params = {"q": q, "format": "json", "addressdetails": 1, "limit": 5}
    try:
        async with httpx.AsyncClient(timeout=8.0, headers=HEADERS) as client:
            res = await client.get(f"{NOMINATIM_URL}/search", params=params)
            res.raise_for_status()
            items = res.json()
        out = [_parse(item) for item in items]
        await cache_set(
            cache_key,
            json.dumps([r.model_dump() for r in out]),
            ttl_seconds=GEOCODE_CACHE_TTL,
        )
        return out
    except httpx.HTTPError as exc:
        logger.warning("Nominatim forward failed: %r", exc)
        raise HTTPException(status_code=503, detail="Servicio de geocoding no disponible")


@router.get("/reverse", response_model=GeocodeResult)
async def geocode_reverse(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
) -> GeocodeResult:
    """Resuelve coordenadas → dirección legible. Útil después del geolocation."""
    cache_key = f"geo:rev:{round(lat, 4)}:{round(lon, 4)}"
    cached = await cache_get(cache_key)
    if cached:
        return GeocodeResult(**json.loads(cached))

    params = {"lat": lat, "lon": lon, "format": "json", "addressdetails": 1, "zoom": 16}
    try:
        async with httpx.AsyncClient(timeout=8.0, headers=HEADERS) as client:
            res = await client.get(f"{NOMINATIM_URL}/reverse", params=params)
            res.raise_for_status()
            item = res.json()
        if not item:
            raise HTTPException(status_code=404, detail="Ubicación no encontrada")
        out = _parse(item)
        # Fix lat/lon (Nominatim a veces devuelve los reverse-search shifted)
        out.lat, out.lon = lat, lon
        await cache_set(cache_key, json.dumps(out.model_dump()), ttl_seconds=GEOCODE_CACHE_TTL)
        return out
    except httpx.HTTPError as exc:
        logger.warning("Nominatim reverse failed: %r", exc)
        raise HTTPException(status_code=503, detail="Servicio de geocoding no disponible")
