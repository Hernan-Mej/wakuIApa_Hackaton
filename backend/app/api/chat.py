import logging
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, desc, select

from app.core.config import settings
from app.core.database import get_session
from app.core.security import get_current_user
from app.models import ChatKind, ChatMessage, ChatRole, Profile, User, UserType

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
TARIFA_COP_KWH = 943


# ─── Schemas ───────────────────────────────────────────────────────────────


class ChatMessageOut(BaseModel):
    id: int
    role: ChatRole
    kind: ChatKind
    content: str
    created_at: str


class SendMessageRequest(BaseModel):
    message: str
    kind: ChatKind = ChatKind.GENERAL


class SendMessageResponse(BaseModel):
    user_message: ChatMessageOut
    assistant_message: ChatMessageOut
    source: str  # "lmstudio" | "fallback"


# ─── Helpers ───────────────────────────────────────────────────────────────


_THINK_PROCESS_RE = re.compile(
    r"^\s*(?:#+\s*)?(?:thinking\s*process|reasoning|analysis)\s*:.*?(?=\n\n|\Z)",
    re.DOTALL | re.IGNORECASE,
)


def _strip_reasoning(text: str) -> str:
    """Remove <think> blocks and 'Thinking Process:' prefixes Qwen3 sometimes emits."""
    cleaned = _THINK_RE.sub("", text).strip()
    if not cleaned:
        cleaned = re.sub(r"</?think>", "", text, flags=re.IGNORECASE).strip()
    # Drop a leading "Thinking Process: ..." block (until blank line) if the model
    # wrote one as plain text despite enable_thinking=False
    cleaned = _THINK_PROCESS_RE.sub("", cleaned).strip()
    return cleaned


def _format_extra_data(extra: dict) -> str:
    """Render the sector-specific JSON details as human-readable bullets."""
    if not extra:
        return ""
    lines = ["\n\nDatos específicos del sector:"]
    for key, value in extra.items():
        label = key.replace("_", " ").capitalize()
        if isinstance(value, bool):
            value = "sí" if value else "no"
        elif isinstance(value, list):
            value = ", ".join(str(v) for v in value) if value else "—"
        elif isinstance(value, dict):
            # E.g. rooms_by_type: {"standard": 30, "suite": 8}
            inner = ", ".join(f"{k}: {v}" for k, v in value.items())
            value = inner or "—"
        lines.append(f"- {label}: {value}")
    return "\n".join(lines)


def _build_system_prompt(
    profile: Profile | None,
    kind: ChatKind,
    user_type: UserType = UserType.BUSINESS,
) -> str:
    # Base style adapts to the user_type — personas/comunidades necesitan
    # lenguaje simple sin jergas; empresas pueden manejar lo técnico.
    if user_type == UserType.PERSON:
        tone = (
            "Eres un asesor energético amigable que ayuda a familias y personas "
            "en Riohacha, La Guajira (Colombia) a aprovechar la energía solar. "
            "Habla en español sencillo, sin tecnicismos. Cuando uses un término "
            "técnico, explícalo en una frase. Usa analogías cotidianas "
            "(ej: 'lo mismo que tener X focos prendidos toda la tarde'). "
        )
    elif user_type == UserType.COMMUNITY:
        tone = (
            "Eres un asesor energético comunitario que ayuda a comunidades, "
            "rancherías y juntas de acción comunal en La Guajira (Colombia) "
            "a gestionar energía colectiva. Habla en español claro y directo, "
            "pensando en decisiones grupales (cuánta gente se beneficia, cómo "
            "repartir, costos compartidos). Evita jerga técnica salvo lo esencial. "
        )
    else:  # BUSINESS
        tone = (
            "Eres un asistente experto en eficiencia energética y energía solar "
            "para empresas en Riohacha, La Guajira (Colombia). Respuestas "
            "técnicas, con números concretos por habitación/cama/máquina cuando "
            "los datos lo permitan. "
        )

    base = (
        tone +
        "Datos regionales: tarifa eléctrica $943 COP/kWh, radiación solar "
        "promedio ~5.5 kWh/m²/día, interrupciones promedio 60 horas/año. "
        "Tu respuesta DEBE empezar directamente con la recomendación final — "
        "NO escribas 'Thinking Process', 'Reasoning', 'Analysis' ni etiquetas "
        "<think>. Sin markdown excesivo."
    )

    if profile is None:
        return base + " El usuario aún no ha completado su perfil."

    # Common profile block (works for all user types)
    type_label = {
        UserType.PERSON: "Persona / hogar",
        UserType.COMMUNITY: "Comunidad",
        UserType.BUSINESS: "Empresa",
    }[user_type]
    sector_info = f" (sector {profile.sector.value})" if profile.sector else ""

    lines = [
        f"\n\nPerfil ({type_label}):",
        f"- Nombre: {profile.display_name}{sector_info}",
        f"- Ubicación: {profile.address or 'no especificada'} "
        f"(lat {profile.latitude:.4f}, lon {profile.longitude:.4f})",
        f"- Consumo mensual de la red: {profile.monthly_grid_consumption_kwh:,.0f} kWh "
        f"(~${int(profile.monthly_grid_consumption_kwh * TARIFA_COP_KWH):,} COP/mes)",
    ]
    if profile.monthly_self_generation_kwh > 0:
        lines.append(
            f"- Generación propia actual: {profile.monthly_self_generation_kwh:,.0f} kWh/mes"
        )
    if profile.solar_panels_count > 0:
        lines.append(
            f"- Paneles solares: {profile.solar_panels_count} × {profile.solar_panel_watts:.0f}W "
            f"= {profile.solar_capacity_kwp:.2f} kWp instalados"
        )
    if profile.battery_count > 0:
        lines.append(
            f"- Baterías: {profile.battery_count} × {profile.battery_kwh_each:.1f} kWh "
            f"({profile.battery_type.value}) = {profile.battery_capacity_kwh:.1f} kWh"
        )
    if profile.wind_turbine_count > 0:
        lines.append(
            f"- Turbinas eólicas: {profile.wind_turbine_count} × {profile.wind_turbine_kw_each:.1f} kW "
            f"= {profile.wind_capacity_kw:.2f} kW"
        )
    if profile.generator_capacity_kw > 0:
        lines.append(
            f"- Generador de respaldo: {profile.generator_capacity_kw:.1f} kW "
            f"({profile.generator_fuel.value})"
        )
    if profile.inverter_kw > 0:
        lines.append(f"- Inversor: {profile.inverter_kw:.1f} kW")
    if not profile.has_any_renewable:
        lines.append("- ⚠️ Aún no tiene fuentes renovables instaladas — evaluá costos de instalar.")
    if profile.wants_to_sell_energy:
        lines.append("- 💡 Le interesa vender energía excedente a la red o a vecinos.")

    if user_type == UserType.BUSINESS:
        lines.append(f"- Horario operativo: {profile.operating_hours}")
        lines.append(
            f"- Cargas críticas: {profile.critical_loads_count} · "
            f"flexibles: {profile.flexible_loads_count}"
        )

    profile_block = "\n".join(lines)
    profile_block += _format_extra_data(profile.extra_data or {})

    if kind == ChatKind.PREDICTION:
        base += (
            "\n\nMODO PREDICCIÓN: el usuario quiere una recomendación estructurada del ahorro "
            "energético hoy. Devuelve exactamente 4 secciones con emojis: "
            "🌞 POTENCIAL SOLAR HOY, ⚡ ACCIÓN PRIORITARIA, 🔋 GESTIÓN DE PICOS, 💰 AHORRO ESTIMADO."
        )
    elif kind == ChatKind.BLACKOUT:
        base += (
            "\n\nMODO APAGÓN: hay un corte de energía en curso. Devuelve un plan de triaje: "
            "qué cargas críticas mantener encendidas, cuáles flexibles apagar de inmediato, "
            "estimación de autonomía con baterías + generador, y orden de prioridad."
        )

    return base + profile_block


async def _call_lmstudio(messages: list[dict]) -> str:
    payload = {
        "model": settings.lmstudio_model,
        "messages": messages,
        "max_tokens": settings.lmstudio_max_tokens,
        "temperature": settings.lmstudio_temperature,
        "stream": False,
        "chat_template_kwargs": {"enable_thinking": False},
    }
    async with httpx.AsyncClient(timeout=settings.lmstudio_timeout) as client:
        res = await client.post(f"{settings.lmstudio_url}/chat/completions", json=payload)
        res.raise_for_status()
        data = res.json()
    msg = data["choices"][0]["message"]
    content = (msg.get("content") or "").strip()
    if not content:
        content = (msg.get("reasoning_content") or "").strip()
    return _strip_reasoning(content)


def _fallback_reply(message: str, profile: Profile | None) -> str:
    if profile is None:
        return ("No pude conectar con el modelo IA local. Completá primero tu perfil para "
                "obtener recomendaciones personalizadas.")
    consumption = profile.monthly_grid_consumption_kwh
    monthly_cost = int(consumption * TARIFA_COP_KWH)
    daily_solar = profile.solar_capacity_kwp * 5.5  # kWh/día estimados a 5.5 kWh/m²/día
    coverage = (
        min(100, (daily_solar * 30 / max(consumption, 1)) * 100)
        if consumption > 0 else 0
    )
    return (
        f"⚠️ Modelo IA no disponible — respuesta calculada localmente.\n\n"
        f"{profile.display_name} consume ~{consumption:,.0f} kWh/mes "
        f"(~${monthly_cost:,} COP). Con tus {profile.solar_capacity_kwp:.2f} kWp solares "
        f"puedes generar ~{daily_solar:.1f} kWh/día, lo que cubre ~{coverage:.0f}% "
        f"de tu consumo. Desplaza cargas flexibles al pico solar 10:00–14:00."
    )


def _serialize(msg: ChatMessage) -> ChatMessageOut:
    return ChatMessageOut(
        id=msg.id,
        role=msg.role,
        kind=msg.kind,
        content=msg.content,
        created_at=msg.created_at.isoformat(),
    )


# ─── Endpoints ─────────────────────────────────────────────────────────────


@router.get("/history", response_model=list[ChatMessageOut])
def chat_history(
    limit: int = 50,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[ChatMessageOut]:
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.user_id == current.id)
        .order_by(desc(ChatMessage.created_at))
        .limit(limit)
    )
    rows = session.exec(stmt).all()
    return [_serialize(m) for m in reversed(rows)]


@router.post("/send", response_model=SendMessageResponse)
async def send_message(
    payload: SendMessageRequest,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> SendMessageResponse:
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío")

    # Persist the user message first
    user_msg = ChatMessage(
        user_id=current.id, role=ChatRole.USER, kind=payload.kind, content=payload.message.strip()
    )
    session.add(user_msg)
    session.commit()
    session.refresh(user_msg)

    # Build context: system prompt + last N messages
    system_prompt = _build_system_prompt(current.profile, payload.kind, current.user_type)
    history_stmt = (
        select(ChatMessage)
        .where(ChatMessage.user_id == current.id)
        .order_by(desc(ChatMessage.created_at))
        .limit(settings.chat_history_window)
    )
    history = list(reversed(session.exec(history_stmt).all()))
    messages = [{"role": "system", "content": system_prompt}]
    for m in history:
        if m.role == ChatRole.SYSTEM:
            continue
        messages.append({"role": m.role.value, "content": m.content})

    # Call LLM (with fallback)
    try:
        reply = await _call_lmstudio(messages)
        source = "lmstudio"
        if not reply:
            reply = _fallback_reply(payload.message, current.profile)
            source = "fallback"
    except (httpx.HTTPError, KeyError, IndexError) as exc:
        logger.warning("LM Studio failed (%s: %r); using fallback", type(exc).__name__, exc)
        reply = _fallback_reply(payload.message, current.profile)
        source = "fallback"

    assistant_msg = ChatMessage(
        user_id=current.id, role=ChatRole.ASSISTANT, kind=payload.kind, content=reply
    )
    session.add(assistant_msg)
    session.commit()
    session.refresh(assistant_msg)

    return SendMessageResponse(
        user_message=_serialize(user_msg),
        assistant_message=_serialize(assistant_msg),
        source=source,
    )


@router.delete("/history", status_code=204)
def clear_history(
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    session.exec(
        ChatMessage.__table__.delete().where(ChatMessage.user_id == current.id)
    )
    session.commit()
