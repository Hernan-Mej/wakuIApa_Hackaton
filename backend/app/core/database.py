import logging
from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

logger = logging.getLogger(__name__)

# Railway / PlanetScale / Aiven dan la URL como `mysql://...` pero SQLAlchemy
# necesita el driver explícito (`mysql+pymysql://...`). Hacemos la conversión
# automáticamente para que la misma env var funcione local y en producción.
_db_url = settings.database_url
if _db_url.startswith("mysql://"):
    _db_url = _db_url.replace("mysql://", "mysql+pymysql://", 1)

engine = create_engine(
    _db_url,
    echo=settings.database_echo,
    pool_pre_ping=True,
    pool_recycle=3600,
)


def init_db() -> None:
    """Create all tables. Imports models so SQLModel metadata is populated."""
    # Importing here avoids circular imports at module load time
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    logger.info("Database initialised at %s", settings.database_url.split("@")[-1])


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
