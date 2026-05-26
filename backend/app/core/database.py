import logging
import urllib.parse as urlparse
from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

logger = logging.getLogger(__name__)


def _normalize_db_url(raw: str) -> str:
    """Normaliza la DATABASE_URL para SQLAlchemy:
    1. `mysql://` → `mysql+pymysql://` (Railway/PlanetScale/Aiven dan el scheme corto).
    2. URL-encode del password si contiene caracteres especiales (`@`, `:`, `/`, `+`, `=`, etc.)
       que confundirían al parser de SQLAlchemy.
    """
    url = raw.strip()
    if url.startswith("mysql://"):
        url = "mysql+pymysql://" + url[len("mysql://"):]

    # urlparse maneja URLs con scheme arbitrario
    try:
        parsed = urlparse.urlparse(url)
        if parsed.password:
            # Re-quote the password aggressively (safe="" = encode everything non-alphanumeric)
            encoded_pw = urlparse.quote(parsed.password, safe="")
            if encoded_pw != parsed.password:
                # Rebuild netloc with encoded password
                userinfo = f"{parsed.username}:{encoded_pw}"
                host = parsed.hostname or ""
                if parsed.port:
                    host = f"{host}:{parsed.port}"
                new_netloc = f"{userinfo}@{host}"
                url = parsed._replace(netloc=new_netloc).geturl()
    except Exception as exc:
        logger.warning("Could not pre-process DB URL (%s); using raw", exc)
    return url


def _mask_url(url: str) -> str:
    """Esconde el password para loggear sin filtrar secretos."""
    try:
        p = urlparse.urlparse(url)
        if p.password:
            return url.replace(p.password, "***", 1)
    except Exception:
        pass
    return url


_db_url = _normalize_db_url(settings.database_url)
logger.info("DB URL (masked): %s", _mask_url(_db_url))
logger.info("DB URL length: %d chars", len(_db_url))

try:
    engine = create_engine(
        _db_url,
        echo=settings.database_echo,
        pool_pre_ping=True,
        pool_recycle=3600,
    )
except Exception as exc:
    logger.error(
        "Failed to create engine. Raw URL repr (masked): %r",
        _mask_url(_db_url),
    )
    raise


def init_db() -> None:
    """Create all tables. Imports models so SQLModel metadata is populated."""
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    logger.info("Database initialised at %s", _db_url.split("@")[-1])


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
