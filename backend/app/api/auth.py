from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.security import create_access_token, get_current_user, hash_password, verify_password
from app.models import BatteryType, GeneratorFuel, Profile, Sector, User, UserType

router = APIRouter(prefix="/auth", tags=["auth"])


# ─── Schemas ───────────────────────────────────────────────────────────────


class ProfileIn(BaseModel):
    # Identity
    display_name: str

    # Location (with default Riohacha for users that don't provide it)
    latitude: float = 11.5449
    longitude: float = -72.9069
    address: str = ""

    # Consumption & generation
    monthly_grid_consumption_kwh: float = 0.0
    monthly_self_generation_kwh: float = 0.0
    wants_to_sell_energy: bool = False

    # Solar (structured)
    solar_panels_count: int = 0
    solar_panel_watts: float = 0.0

    # Batteries
    battery_count: int = 0
    battery_kwh_each: float = 0.0
    battery_type: BatteryType = BatteryType.NONE

    # Wind
    wind_turbine_count: int = 0
    wind_turbine_kw_each: float = 0.0

    # Generator
    generator_capacity_kw: float = 0.0
    generator_fuel: GeneratorFuel = GeneratorFuel.NONE

    # Inverter
    inverter_kw: float = 0.0

    # Business-only (ignored for person/community)
    sector: Optional[Sector] = None
    operating_hours: str = "24/7"
    critical_loads_count: int = 0
    flexible_loads_count: int = 0

    extra_data: dict[str, Any] = Field(default_factory=dict)


class ProfileOut(ProfileIn):
    updated_at: datetime
    # Computed totals so the frontend doesn't recompute
    solar_capacity_kwp: float
    battery_capacity_kwh: float
    wind_capacity_kw: float
    has_any_renewable: bool


def _profile_to_out(p: Profile) -> ProfileOut:
    return ProfileOut(
        display_name=p.display_name,
        latitude=p.latitude, longitude=p.longitude, address=p.address,
        monthly_grid_consumption_kwh=p.monthly_grid_consumption_kwh,
        monthly_self_generation_kwh=p.monthly_self_generation_kwh,
        wants_to_sell_energy=p.wants_to_sell_energy,
        solar_panels_count=p.solar_panels_count,
        solar_panel_watts=p.solar_panel_watts,
        battery_count=p.battery_count,
        battery_kwh_each=p.battery_kwh_each,
        battery_type=p.battery_type,
        wind_turbine_count=p.wind_turbine_count,
        wind_turbine_kw_each=p.wind_turbine_kw_each,
        generator_capacity_kw=p.generator_capacity_kw,
        generator_fuel=p.generator_fuel,
        inverter_kw=p.inverter_kw,
        sector=p.sector,
        operating_hours=p.operating_hours,
        critical_loads_count=p.critical_loads_count,
        flexible_loads_count=p.flexible_loads_count,
        extra_data=p.extra_data,
        updated_at=p.updated_at,
        solar_capacity_kwp=p.solar_capacity_kwp,
        battery_capacity_kwh=p.battery_capacity_kwh,
        wind_capacity_kw=p.wind_capacity_kw,
        has_any_renewable=p.has_any_renewable,
    )


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    user_type: UserType
    profile: ProfileIn


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: EmailStr
    user_type: UserType
    created_at: datetime
    profile: Optional[ProfileOut] = None


# ─── Endpoints ─────────────────────────────────────────────────────────────


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, session: Session = Depends(get_session)) -> TokenResponse:
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Este email ya está registrado")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        user_type=payload.user_type,
    )
    session.add(user)
    session.flush()

    profile = Profile(user_id=user.id, **payload.profile.model_dump())
    session.add(profile)
    session.commit()
    session.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenResponse)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
) -> TokenResponse:
    user = session.exec(select(User).where(User.email == form.username)).first()
    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    return TokenResponse(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)) -> UserOut:
    profile_out = _profile_to_out(current.profile) if current.profile else None
    return UserOut(
        id=current.id,
        email=current.email,
        user_type=current.user_type,
        created_at=current.created_at,
        profile=profile_out,
    )
