from datetime import datetime
from enum import Enum
from typing import Any, Optional

from sqlalchemy import JSON, Column, Text
from sqlmodel import Field, Relationship, SQLModel


# ─── Enums ──────────────────────────────────────────────────────────────────


class UserType(str, Enum):
    """Tres perfiles distintos con UIs y necesidades muy diferentes."""
    PERSON = "person"        # Hogar individual / familia
    COMMUNITY = "community"  # Comunidad rural, junta de acción comunal, etc.
    BUSINESS = "business"    # Empresa con conocimiento técnico


class Sector(str, Enum):
    """Sólo aplica a user_type = BUSINESS."""
    HOTEL = "hotel"
    INDUSTRIAL = "industrial"
    RETAIL = "retail"
    HOSPITAL = "hospital"
    OFICINA = "oficina"
    EDUCACION = "educacion"
    RESTAURANTE = "restaurante"
    OTRO = "otro"


class BatteryType(str, Enum):
    LITHIUM = "lithium"
    LEAD_ACID = "lead_acid"
    AGM = "agm"
    GEL = "gel"
    OTHER = "other"
    NONE = "none"


class GeneratorFuel(str, Enum):
    DIESEL = "diesel"
    GASOLINE = "gasoline"
    LPG = "lpg"
    NATURAL_GAS = "natural_gas"
    NONE = "none"


class ChatRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ChatKind(str, Enum):
    GENERAL = "general"
    PREDICTION = "prediction"
    BLACKOUT = "blackout"
    INVESTMENT = "investment"
    NET_METERING = "net_metering"
    WEATHER_FORECAST = "weather_forecast"


# ─── User & profile ─────────────────────────────────────────────────────────


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True, max_length=255)
    password_hash: str = Field(max_length=255)
    user_type: UserType = Field(default=UserType.PERSON, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    profile: "Profile" = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"uselist": False, "cascade": "all, delete-orphan"},
    )


class Profile(SQLModel, table=True):
    """Perfil unificado para los 3 user_types. Los campos que no aplican a un
    tipo (ej. sector para una persona) quedan en defaults; el catch-all
    ``extra_data`` JSON guarda lo específico del tipo (household_size,
    rooms_standard, member_families, etc.).
    """
    __tablename__ = "profiles"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", unique=True, nullable=False)

    # ─── Identity ─────────────────────────────────────────────────────────
    display_name: str = Field(max_length=255)  # "Familia Pérez" / "Comunidad X" / "Hotel Y"

    # ─── Location (NEW — central para NASA POWER / Open-Meteo) ──────────
    latitude: float = Field(default=11.5449)   # Default Riohacha
    longitude: float = Field(default=-72.9069)
    address: str = Field(default="", max_length=500)  # Human-readable

    # ─── Consumption & current generation ──────────────────────────────
    monthly_grid_consumption_kwh: float = Field(default=0.0, ge=0)
    monthly_self_generation_kwh: float = Field(default=0.0, ge=0)
    wants_to_sell_energy: bool = Field(default=False)

    # ─── Solar (estructurado: contamos paneles y W cada uno) ───────────
    solar_panels_count: int = Field(default=0, ge=0)
    solar_panel_watts: float = Field(default=0.0, ge=0)  # W por panel

    # ─── Batteries ──────────────────────────────────────────────────────
    battery_count: int = Field(default=0, ge=0)
    battery_kwh_each: float = Field(default=0.0, ge=0)
    battery_type: BatteryType = Field(default=BatteryType.NONE)

    # ─── Wind ───────────────────────────────────────────────────────────
    wind_turbine_count: int = Field(default=0, ge=0)
    wind_turbine_kw_each: float = Field(default=0.0, ge=0)

    # ─── Backup generator ───────────────────────────────────────────────
    generator_capacity_kw: float = Field(default=0.0, ge=0)
    generator_fuel: GeneratorFuel = Field(default=GeneratorFuel.NONE)

    # ─── Inverter (limita lo que se puede convertir AC en simultáneo) ──
    inverter_kw: float = Field(default=0.0, ge=0)

    # ─── Business-only fields (defaults vacíos para person/community) ──
    sector: Optional[Sector] = Field(default=None)
    operating_hours: str = Field(default="24/7", max_length=50)
    critical_loads_count: int = Field(default=0, ge=0)
    flexible_loads_count: int = Field(default=0, ge=0)

    # ─── Type-specific extras (JSON) ────────────────────────────────────
    extra_data: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
    )

    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    user: User = Relationship(back_populates="profile")

    # ─── Derived helpers (no van a la DB) ───────────────────────────────

    @property
    def solar_capacity_kwp(self) -> float:
        return round((self.solar_panels_count * self.solar_panel_watts) / 1000.0, 3)

    @property
    def battery_capacity_kwh(self) -> float:
        return round(self.battery_count * self.battery_kwh_each, 2)

    @property
    def wind_capacity_kw(self) -> float:
        return round(self.wind_turbine_count * self.wind_turbine_kw_each, 2)

    @property
    def has_any_renewable(self) -> bool:
        return self.solar_capacity_kwp > 0 or self.wind_capacity_kw > 0


# ─── Chat & sessions ────────────────────────────────────────────────────────


class ChatMessage(SQLModel, table=True):
    __tablename__ = "chat_messages"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True, nullable=False)
    role: ChatRole = Field(default=ChatRole.USER)
    kind: ChatKind = Field(default=ChatKind.GENERAL, index=True)
    content: str = Field(sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False, index=True)


class BlackoutSession(SQLModel, table=True):
    __tablename__ = "blackout_sessions"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True, nullable=False)
    started_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    ended_at: Optional[datetime] = Field(default=None)
    estimated_autonomy_hours: float = Field(default=0.0)
    critical_load_kw: float = Field(default=0.0)
    plan: str = Field(sa_column=Column(Text, nullable=False))


# ─── Backward-compat alias (legacy code still imports CompanyProfile) ──────
# Mantener temporalmente para no romper imports en otros módulos. Después de
# migrar todo se puede eliminar.
CompanyProfile = Profile
