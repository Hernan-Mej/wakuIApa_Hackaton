"""Seed the DB with realistic Riohacha (La Guajira, Colombia) profiles of the
three user types: 3 personas, 2 comunidades y 4 empresas.

Run:
    python -m app.seeds.seed              # idempotent
    python -m app.seeds.seed --reset      # wipe first
    python -m app.seeds.seed --with-chat  # add sample chat history

Default password for every seeded account: ``demo1234``
"""
from __future__ import annotations

import argparse
import logging
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlmodel import Session, delete, select

from app.core.database import engine, init_db
from app.core.security import hash_password
from app.models import (
    BatteryType,
    BlackoutSession,
    ChatKind,
    ChatMessage,
    ChatRole,
    GeneratorFuel,
    Profile,
    Sector,
    User,
    UserType,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_PASSWORD = "demo1234"


@dataclass
class ChatSeed:
    role: ChatRole
    kind: ChatKind
    content: str
    minutes_ago: int = 0


@dataclass
class UserSeed:
    email: str
    user_type: UserType
    profile: dict
    chat: list[ChatSeed] = field(default_factory=list)


# ─── 3 PERSONAS ─────────────────────────────────────────────────────────────

PERSONAS: list[UserSeed] = [
    UserSeed(
        email="familia.perez@riohacha.demo",
        user_type=UserType.PERSON,
        profile=dict(
            display_name="Familia Pérez",
            latitude=11.5390, longitude=-72.9150,
            address="Barrio Cangrejito, Riohacha",
            monthly_grid_consumption_kwh=340,   # 4 personas, A/A nocturno
            monthly_self_generation_kwh=180,
            wants_to_sell_energy=False,
            solar_panels_count=6,
            solar_panel_watts=450,              # paneles modernos
            battery_count=2,
            battery_kwh_each=2.4,               # baterías LiFePO4 standard
            battery_type=BatteryType.LITHIUM,
            inverter_kw=3.0,
            extra_data=dict(
                household_size=4,
                has_electric_vehicle=False,
                appliances=["aire acondicionado", "nevera", "lavadora", "ventiladores"],
                has_well_pump=False,
            ),
        ),
    ),
    UserSeed(
        email="rancho.olivares@riohacha.demo",
        user_type=UserType.PERSON,
        profile=dict(
            display_name="Rancho Los Olivares",
            latitude=11.5810, longitude=-72.8780,
            address="Zona rural Camarones, Riohacha",
            monthly_grid_consumption_kwh=90,    # red intermitente
            monthly_self_generation_kwh=520,    # mucho sol, autosuficiente
            wants_to_sell_energy=True,
            solar_panels_count=12,
            solar_panel_watts=550,
            battery_count=4,
            battery_kwh_each=5.0,
            battery_type=BatteryType.LITHIUM,
            wind_turbine_count=1,
            wind_turbine_kw_each=3.0,
            generator_capacity_kw=5.0,
            generator_fuel=GeneratorFuel.DIESEL,
            inverter_kw=6.0,
            extra_data=dict(
                household_size=3,
                has_well_pump=True,
                well_pump_kw=1.5,
                has_electric_vehicle=False,
                appliances=["nevera", "lavadora", "bomba de agua", "TV", "iluminación LED"],
            ),
        ),
        chat=[
            ChatSeed(ChatRole.USER, ChatKind.GENERAL,
                     "¿Me conviene vender energía a mis vecinos?", minutes_ago=60 * 30),
            ChatSeed(ChatRole.ASSISTANT, ChatKind.GENERAL,
                     "Sí — generás ~520 kWh/mes y consumís 90, te sobran ~430 kWh. "
                     "Si tus vecinos pagaran $943 COP/kWh (la tarifa de la red), "
                     "podrías ingresar ~$405.000 COP/mes. Te conviene formalizar un "
                     "acuerdo simple y verificar que tu inversor permita alimentar "
                     "a otra casa o que existe una microred local.",
                     minutes_ago=60 * 30 - 1),
        ],
    ),
    UserSeed(
        email="ana.mendoza@riohacha.demo",
        user_type=UserType.PERSON,
        profile=dict(
            display_name="Ana Mendoza",
            latitude=11.5449, longitude=-72.9069,
            address="Centro Histórico, Riohacha",
            monthly_grid_consumption_kwh=210,
            monthly_self_generation_kwh=0,       # sin paneles aún — quiere evaluar
            wants_to_sell_energy=False,
            solar_panels_count=0,
            solar_panel_watts=0,
            battery_count=0,
            battery_kwh_each=0,
            battery_type=BatteryType.NONE,
            inverter_kw=0,
            extra_data=dict(
                household_size=2,
                has_electric_vehicle=False,
                appliances=["nevera", "ventilador", "TV", "computador"],
                interested_in_solar=True,
                budget_cop=8_000_000,            # quiere invertir hasta $8M COP
            ),
        ),
    ),
]


# ─── 2 COMUNIDADES ──────────────────────────────────────────────────────────

COMUNIDADES: list[UserSeed] = [
    UserSeed(
        email="ranchera.wayuu@riohacha.demo",
        user_type=UserType.COMMUNITY,
        profile=dict(
            display_name="Ranchería Wayuu Mayapo",
            latitude=11.6420, longitude=-72.7790,
            address="Mayapo, Manaure (cerca Riohacha)",
            monthly_grid_consumption_kwh=380,    # 28 hogares con consumo bajo
            monthly_self_generation_kwh=720,
            wants_to_sell_energy=True,
            solar_panels_count=24,
            solar_panel_watts=540,
            battery_count=8,
            battery_kwh_each=5.0,
            battery_type=BatteryType.LITHIUM,
            wind_turbine_count=2,
            wind_turbine_kw_each=5.0,            # vientos costeros excelentes
            generator_capacity_kw=8.0,
            generator_fuel=GeneratorFuel.DIESEL,
            inverter_kw=10.0,
            extra_data=dict(
                household_count=28,
                avg_residents_per_household=4,
                shared_infrastructure=["escuela", "centro de salud", "bomba comunal de agua"],
                school_consumption_kwh=80,
                health_center_consumption_kwh=120,
                community_water_pump_kw=2.2,
                language="Wayuunaiki + Español",
            ),
        ),
        chat=[
            ChatSeed(ChatRole.USER, ChatKind.WEATHER_FORECAST,
                     "Si viene una semana lluviosa, ¿podemos sostenernos solo con baterías?",
                     minutes_ago=60 * 12),
            ChatSeed(ChatRole.ASSISTANT, ChatKind.WEATHER_FORECAST,
                     "Con 40 kWh de baterías y consumo crítico ~13 kWh/día (bomba + "
                     "centro de salud), tienen ~3 días de autonomía. Si la lluvia "
                     "dura más, recomiendo racionar el A/A de noche y activar el "
                     "generador de respaldo 2-3h por día. Las turbinas eólicas suelen "
                     "compensar parcialmente (el viento aumenta con tormentas).",
                     minutes_ago=60 * 12 - 1),
        ],
    ),
    UserSeed(
        email="junta.cooperativo@riohacha.demo",
        user_type=UserType.COMMUNITY,
        profile=dict(
            display_name="JAC Barrio El Cooperativo",
            latitude=11.5320, longitude=-72.9210,
            address="Barrio El Cooperativo, Riohacha",
            monthly_grid_consumption_kwh=1850,   # ~85 hogares conectados a red
            monthly_self_generation_kwh=0,
            wants_to_sell_energy=False,
            solar_panels_count=0,
            solar_panel_watts=0,
            battery_count=0,
            battery_kwh_each=0,
            battery_type=BatteryType.NONE,
            inverter_kw=0,
            extra_data=dict(
                household_count=85,
                shared_infrastructure=["salón comunal", "alumbrado público parcial"],
                interested_in_collective_solar=True,
                budget_cop=120_000_000,           # $120M COP de presupuesto comunitario
                main_problem="cortes frecuentes de luz, 4-6 veces/semana",
            ),
        ),
    ),
]


# ─── 4 EMPRESAS (representativas de los sectores principales) ───────────────

EMPRESAS: list[UserSeed] = [
    UserSeed(
        email="hoteltaroa@riohacha.demo",
        user_type=UserType.BUSINESS,
        profile=dict(
            display_name="Hotel Taroa",
            latitude=11.5472, longitude=-72.9021,
            address="Carrera 1 #4-22, Riohacha",
            monthly_grid_consumption_kwh=14500,
            monthly_self_generation_kwh=3600,
            wants_to_sell_energy=False,
            sector=Sector.HOTEL,
            operating_hours="24/7",
            critical_loads_count=14,
            flexible_loads_count=42,
            solar_panels_count=50,
            solar_panel_watts=550,
            battery_count=12,
            battery_kwh_each=2.5,
            battery_type=BatteryType.LITHIUM,
            generator_capacity_kw=40,
            generator_fuel=GeneratorFuel.DIESEL,
            inverter_kw=25,
            extra_data=dict(
                rooms_standard=32, rooms_suite=8,
                avg_kwh_per_room_night=12.5, avg_occupancy_pct=68,
                has_pool=True, pool_pump_kw=3.5,
                has_restaurant=True, has_spa=False,
                peak_season="dic-feb, jun-jul",
            ),
        ),
    ),
    UserSeed(
        email="clinica@riohacha.demo",
        user_type=UserType.BUSINESS,
        profile=dict(
            display_name="Clínica Renacer",
            latitude=11.5430, longitude=-72.9200,
            address="Av. 15, Riohacha",
            monthly_grid_consumption_kwh=42000,
            monthly_self_generation_kwh=8600,
            wants_to_sell_energy=False,
            sector=Sector.HOSPITAL,
            operating_hours="24/7",
            critical_loads_count=38,
            flexible_loads_count=18,
            solar_panels_count=110,
            solar_panel_watts=550,
            battery_count=28,
            battery_kwh_each=5.0,
            battery_type=BatteryType.LITHIUM,
            generator_capacity_kw=180,
            generator_fuel=GeneratorFuel.DIESEL,
            inverter_kw=60,
            extra_data=dict(
                hospitalization_beds=60, icu_beds=8, surgery_rooms=3,
                imaging_machines=2,
                has_pharmacy_cold_chain=True, has_oxygen_plant=True,
            ),
        ),
    ),
    UserSeed(
        email="hielera@riohacha.demo",
        user_type=UserType.BUSINESS,
        profile=dict(
            display_name="Hielera del Norte Guajira",
            latitude=11.5390, longitude=-72.9150,
            address="Zona industrial, Riohacha",
            monthly_grid_consumption_kwh=36000,
            monthly_self_generation_kwh=12000,
            wants_to_sell_energy=False,
            sector=Sector.INDUSTRIAL,
            operating_hours="Lun-Sab 5:00-20:00",
            critical_loads_count=22,
            flexible_loads_count=8,
            solar_panels_count=145,
            solar_panel_watts=550,
            battery_count=24,
            battery_kwh_each=5.0,
            battery_type=BatteryType.LITHIUM,
            wind_turbine_count=3,
            wind_turbine_kw_each=5.0,
            generator_capacity_kw=100,
            generator_fuel=GeneratorFuel.DIESEL,
            inverter_kw=80,
            extra_data=dict(
                shifts_per_day=2, production_lines=3,
                compressors_total_kw=55, cold_room_volume_m3=240,
                daily_ice_output_tons=18, has_cogeneration=False,
            ),
        ),
    ),
    UserSeed(
        email="suchiimma@riohacha.demo",
        user_type=UserType.BUSINESS,
        profile=dict(
            display_name="Centro Comercial Suchiimma",
            latitude=11.5510, longitude=-72.9080,
            address="Av. de los Estudiantes, Riohacha",
            monthly_grid_consumption_kwh=95000,
            monthly_self_generation_kwh=22500,
            wants_to_sell_energy=False,
            sector=Sector.RETAIL,
            operating_hours="Lun-Dom 9:00-21:00",
            critical_loads_count=18,
            flexible_loads_count=120,
            solar_panels_count=275,
            solar_panel_watts=550,
            battery_count=16,
            battery_kwh_each=5.0,
            battery_type=BatteryType.LITHIUM,
            generator_capacity_kw=200,
            generator_fuel=GeneratorFuel.DIESEL,
            inverter_kw=150,
            extra_data=dict(
                floor_area_m2=18500, store_count=85,
                refrigeration_units=22, has_parking_lighting=True,
                has_food_court=True, food_court_kitchens=12,
            ),
        ),
    ),
]


SEEDS: list[UserSeed] = PERSONAS + COMUNIDADES + EMPRESAS


# ─── Seeder logic ────────────────────────────────────────────────────────────


def reset_db(session: Session) -> None:
    logger.warning("Resetting DB — wiping all rows from app tables")
    session.exec(delete(BlackoutSession))
    session.exec(delete(ChatMessage))
    session.exec(delete(Profile))
    session.exec(delete(User))
    session.commit()


def seed_user(session: Session, seed: UserSeed, include_chat: bool) -> bool:
    existing = session.exec(select(User).where(User.email == seed.email)).first()
    if existing is not None:
        logger.info("  · %s already exists, skipping", seed.email)
        return False

    user = User(
        email=seed.email,
        password_hash=hash_password(DEFAULT_PASSWORD),
        user_type=seed.user_type,
    )
    session.add(user)
    session.flush()

    profile = Profile(user_id=user.id, **seed.profile)
    session.add(profile)

    if include_chat and seed.chat:
        now = datetime.utcnow()
        for msg in seed.chat:
            session.add(ChatMessage(
                user_id=user.id,
                role=msg.role,
                kind=msg.kind,
                content=msg.content,
                created_at=now - timedelta(minutes=msg.minutes_ago),
            ))

    session.commit()
    badge = {"person": "👤", "community": "🏘️", "business": "🏢"}[seed.user_type.value]
    logger.info("  %s %-32s %s", badge, seed.email, profile.display_name)
    return True


def run(reset: bool, include_chat: bool) -> None:
    init_db()
    with Session(engine) as session:
        if reset:
            reset_db(session)

        logger.info("Seeding %d users (3 personas + 2 comunidades + 4 empresas, password: %s)...",
                    len(SEEDS), DEFAULT_PASSWORD)
        inserted = 0
        for seed in SEEDS:
            if seed_user(session, seed, include_chat):
                inserted += 1

        logger.info("Done. %d inserted, %d skipped.", inserted, len(SEEDS) - inserted)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reset", action="store_true", help="Wipe ALL existing data before seeding")
    parser.add_argument("--with-chat", action="store_true", help="Also seed sample chat history")
    args = parser.parse_args()

    try:
        run(reset=args.reset, include_chat=args.with_chat)
    except Exception as exc:
        logger.error("Seed failed: %r", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
