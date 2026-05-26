"""Carga neta (Net Metering) — calcula cuánto excedente le sobra al usuario
mes a mes, cuánto la red le "debe" (créditos), y cómo se acumula.

En Colombia la Resolución CREG 030/2018 permite a autogeneradores < 100 kW
inyectar excedentes y recibir créditos por la energía exportada.
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from app.api.routes import _fetch_nasa_climatology
from app.core.database import get_session
from app.core.security import get_current_user
from app.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/net-metering", tags=["net-metering"])

DEFAULT_TARIFF_COP_KWH = 943
DEFAULT_PR = 0.8
# CREG 030/2018: la red paga a tarifa de comercialización (~50-60% del retail)
DEFAULT_EXPORT_RATE_FACTOR = 0.55
MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


class MonthlyBalance(BaseModel):
    month_index: int       # 0..11
    month_label: str       # "Ene"
    days_in_month: int
    radiation_kwh_m2_day: float
    generation_kwh: float
    consumption_kwh: float
    self_consumed_kwh: float
    excess_kwh: float            # Lo que va a la red
    deficit_kwh: float           # Lo que se compra de la red
    savings_cop: int             # ahorro por self-consumed
    export_credit_cop: int       # crédito por exportar a la red
    grid_purchase_cop: int       # costo de comprar el déficit
    net_balance_cop: int         # savings + credit - purchase


class NetMeteringResponse(BaseModel):
    annual_generation_kwh: float
    annual_consumption_kwh: float
    annual_self_consumed_kwh: float
    annual_excess_kwh: float
    annual_deficit_kwh: float
    annual_savings_cop: int
    annual_export_credit_cop: int
    annual_grid_purchase_cop: int
    annual_net_balance_cop: int
    months: list[MonthlyBalance]
    tariff_cop_per_kwh: float
    export_rate_cop_per_kwh: float
    eligible_for_creg_030: bool  # < 100 kW autogenerador a pequeña escala


async def compute_net_metering_pure(
    *,
    solar_capacity_kwp: float,
    monthly_grid_consumption_kwh: float,
    latitude: float,
    longitude: float,
    tariff_cop_per_kwh: Optional[float] = None,
    export_rate_factor: float = DEFAULT_EXPORT_RATE_FACTOR,
    performance_ratio: float = DEFAULT_PR,
) -> NetMeteringResponse:
    """Balance neto sin DB/auth — reutilizable por endpoint REST + MCP."""
    tariff = tariff_cop_per_kwh or DEFAULT_TARIFF_COP_KWH
    export_rate = tariff * export_rate_factor
    kwp = solar_capacity_kwp
    monthly_consumption = monthly_grid_consumption_kwh

    clim = await _fetch_nasa_climatology(latitude, longitude)

    months: list[MonthlyBalance] = []
    cur_year = datetime.utcnow().year
    for i, rad in enumerate(clim.monthly):
        from calendar import monthrange
        days = monthrange(cur_year, i + 1)[1]
        gen = kwp * rad * performance_ratio * days
        self_consumed = min(gen, monthly_consumption)
        excess = max(0, gen - monthly_consumption)
        deficit = max(0, monthly_consumption - gen)
        savings = int(self_consumed * tariff)
        export_credit = int(excess * export_rate)
        grid_purchase = int(deficit * tariff)
        months.append(MonthlyBalance(
            month_index=i,
            month_label=MONTHS_ES[i],
            days_in_month=days,
            radiation_kwh_m2_day=round(rad, 2),
            generation_kwh=round(gen, 1),
            consumption_kwh=round(monthly_consumption, 1),
            self_consumed_kwh=round(self_consumed, 1),
            excess_kwh=round(excess, 1),
            deficit_kwh=round(deficit, 1),
            savings_cop=savings,
            export_credit_cop=export_credit,
            grid_purchase_cop=grid_purchase,
            net_balance_cop=savings + export_credit - grid_purchase,
        ))

    return NetMeteringResponse(
        annual_generation_kwh=round(sum(m.generation_kwh for m in months), 1),
        annual_consumption_kwh=round(sum(m.consumption_kwh for m in months), 1),
        annual_self_consumed_kwh=round(sum(m.self_consumed_kwh for m in months), 1),
        annual_excess_kwh=round(sum(m.excess_kwh for m in months), 1),
        annual_deficit_kwh=round(sum(m.deficit_kwh for m in months), 1),
        annual_savings_cop=sum(m.savings_cop for m in months),
        annual_export_credit_cop=sum(m.export_credit_cop for m in months),
        annual_grid_purchase_cop=sum(m.grid_purchase_cop for m in months),
        annual_net_balance_cop=sum(m.net_balance_cop for m in months),
        months=months,
        tariff_cop_per_kwh=tariff,
        export_rate_cop_per_kwh=round(export_rate, 2),
        eligible_for_creg_030=kwp < 100,
    )


@router.get("/balance", response_model=NetMeteringResponse)
async def net_metering_balance(
    tariff_cop_per_kwh: Optional[float] = None,
    export_rate_factor: float = DEFAULT_EXPORT_RATE_FACTOR,
    performance_ratio: float = DEFAULT_PR,
    current: User = Depends(get_current_user),
) -> NetMeteringResponse:
    profile = current.profile
    if profile is None:
        raise HTTPException(status_code=400, detail="Completá primero tu perfil")
    return await compute_net_metering_pure(
        solar_capacity_kwp=profile.solar_capacity_kwp,
        monthly_grid_consumption_kwh=profile.monthly_grid_consumption_kwh,
        latitude=profile.latitude,
        longitude=profile.longitude,
        tariff_cop_per_kwh=tariff_cop_per_kwh,
        export_rate_factor=export_rate_factor,
        performance_ratio=performance_ratio,
    )
