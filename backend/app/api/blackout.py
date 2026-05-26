import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, desc, select

from app.api.chat import _call_lmstudio, _fallback_reply, _build_system_prompt
from app.core.database import get_session
from app.core.security import get_current_user
from app.models import BlackoutSession, ChatKind, ChatMessage, ChatRole, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/blackout", tags=["blackout"])


class BlackoutStartResponse(BaseModel):
    session_id: int
    estimated_autonomy_hours: float
    critical_load_kw: float
    plan: str
    started_at: str


class BlackoutSessionOut(BaseModel):
    id: int
    started_at: str
    ended_at: str | None
    estimated_autonomy_hours: float
    critical_load_kw: float
    plan: str


def _serialize(s: BlackoutSession) -> BlackoutSessionOut:
    return BlackoutSessionOut(
        id=s.id,
        started_at=s.started_at.isoformat(),
        ended_at=s.ended_at.isoformat() if s.ended_at else None,
        estimated_autonomy_hours=s.estimated_autonomy_hours,
        critical_load_kw=s.critical_load_kw,
        plan=s.plan,
    )


@router.post("/start", response_model=BlackoutStartResponse)
async def start_blackout(
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> BlackoutStartResponse:
    profile = current.profile
    if profile is None:
        raise HTTPException(status_code=400, detail="Completa primero tu perfil")

    # Consumo de la red como proxy del consumo total mensual
    monthly_kwh = profile.monthly_grid_consumption_kwh
    avg_hourly_kw = monthly_kwh / 720 if monthly_kwh else 0
    # Cargas críticas — sólo aplica plenamente a empresas; para personas/comunidades
    # asumimos que el 40% del consumo promedio es "esencial" (luces, refri, agua).
    if current.user_type.value == "business":
        critical_load_kw = max(profile.critical_loads_count * 0.4, avg_hourly_kw * 0.3)
    else:
        critical_load_kw = max(0.3, avg_hourly_kw * 0.4)

    # Autonomy = batteries + generator fuel reserve
    battery_hours = (
        profile.battery_capacity_kwh / critical_load_kw if critical_load_kw > 0 else 0
    )
    generator_hours = (
        (profile.generator_capacity_kw * 8) / critical_load_kw
        if critical_load_kw > 0 and profile.generator_capacity_kw > 0 else 0
    )
    autonomy_hours = round(battery_hours + generator_hours, 1)

    user_prompt = (
        f"Hay un APAGÓN en curso. Estimación: carga crítica ~{critical_load_kw:.2f} kW, "
        f"autonomía con baterías ~{battery_hours:.1f}h + generador ~{generator_hours:.1f}h "
        f"= ~{autonomy_hours:.1f}h totales. "
        f"Dame un plan de triaje inmediato: qué priorizar, qué apagar YA, y cómo "
        f"extender la autonomía. Máximo 180 palabras, accionable."
    )

    system_prompt = _build_system_prompt(profile, ChatKind.BLACKOUT, current.user_type)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    try:
        plan = await _call_lmstudio(messages)
        if not plan:
            plan = _fallback_reply(user_prompt, profile)
    except Exception as exc:
        logger.warning("Blackout LLM call failed: %r", exc)
        plan = _fallback_reply(user_prompt, profile)

    blackout = BlackoutSession(
        user_id=current.id,
        estimated_autonomy_hours=autonomy_hours,
        critical_load_kw=critical_load_kw,
        plan=plan,
    )
    session.add(blackout)

    # Also save as a chat message so it appears in history
    chat_msg = ChatMessage(
        user_id=current.id,
        role=ChatRole.ASSISTANT,
        kind=ChatKind.BLACKOUT,
        content=plan,
    )
    session.add(chat_msg)
    session.commit()
    session.refresh(blackout)

    return BlackoutStartResponse(
        session_id=blackout.id,
        estimated_autonomy_hours=autonomy_hours,
        critical_load_kw=critical_load_kw,
        plan=plan,
        started_at=blackout.started_at.isoformat(),
    )


@router.post("/end/{session_id}", response_model=BlackoutSessionOut)
def end_blackout(
    session_id: int,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> BlackoutSessionOut:
    blackout = session.get(BlackoutSession, session_id)
    if blackout is None or blackout.user_id != current.id:
        raise HTTPException(status_code=404, detail="Sesión de apagón no encontrada")
    if blackout.ended_at is None:
        blackout.ended_at = datetime.utcnow()
        session.add(blackout)
        session.commit()
        session.refresh(blackout)
    return _serialize(blackout)


@router.get("/history", response_model=list[BlackoutSessionOut])
def blackout_history(
    limit: int = 20,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[BlackoutSessionOut]:
    stmt = (
        select(BlackoutSession)
        .where(BlackoutSession.user_id == current.id)
        .order_by(desc(BlackoutSession.started_at))
        .limit(limit)
    )
    return [_serialize(s) for s in session.exec(stmt).all()]
