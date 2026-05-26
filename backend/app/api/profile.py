from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.api.auth import ProfileIn, ProfileOut, _profile_to_out
from app.core.database import get_session
from app.core.security import get_current_user
from app.models import Profile, User

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileOut)
def get_profile(current: User = Depends(get_current_user)) -> ProfileOut:
    if current.profile is None:
        raise HTTPException(status_code=404, detail="Perfil no existe")
    return _profile_to_out(current.profile)


@router.put("", response_model=ProfileOut)
def update_profile(
    payload: ProfileIn,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ProfileOut:
    profile = current.profile
    if profile is None:
        profile = Profile(user_id=current.id, **payload.model_dump())
        session.add(profile)
    else:
        for field, value in payload.model_dump().items():
            setattr(profile, field, value)
        profile.updated_at = datetime.utcnow()
        session.add(profile)
    session.commit()
    session.refresh(profile)
    return _profile_to_out(profile)
