import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.routing import Mount

from app.api.auth import router as auth_router
from app.api.blackout import router as blackout_router
from app.api.chat import router as chat_router
from app.api.geocode import router as geocode_router
from app.api.investment import router as investment_router
from app.api.netmetering import router as netmetering_router
from app.api.profile import router as profile_router
from app.api.routes import router as public_router
from app.api.weather import router as weather_router
from app.core.config import settings
from app.core.database import init_db
from app.mcp_server import mcp, sse_transport

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        debug=settings.debug,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_allow_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def _startup() -> None:
        try:
            init_db()
        except Exception as exc:
            logger.error("Database init failed: %r — verify MySQL is running and DB exists", exc)

    app.include_router(public_router, prefix="/api")
    app.include_router(auth_router, prefix="/api")
    app.include_router(profile_router, prefix="/api")
    app.include_router(chat_router, prefix="/api")
    app.include_router(blackout_router, prefix="/api")
    app.include_router(weather_router, prefix="/api")
    app.include_router(investment_router, prefix="/api")
    app.include_router(netmetering_router, prefix="/api")
    app.include_router(geocode_router, prefix="/api")

    # ─── MCP server (SSE transport) ─────────────────────────────────────────
    # Clients (Claude Desktop, OpenAI Agents, IDE plugins, etc.) connect to
    # `GET /sse` to open the event stream and post JSON-RPC messages back to
    # `POST /mcp/messages/`. Tools are defined in app.mcp_server.
    @app.get("/sse")
    async def mcp_sse_endpoint(request: Request):
        async with sse_transport.connect_sse(
            request.scope, request.receive, request._send,
        ) as (read_stream, write_stream):
            await mcp._mcp_server.run(
                read_stream, write_stream,
                mcp._mcp_server.create_initialization_options(),
            )

    # POST handler for incoming JSON-RPC messages from MCP clients
    app.router.routes.append(Mount("/mcp/messages", app=sse_transport.handle_post_message))

    @app.get("/")
    def root() -> dict[str, str]:
        return {"message": f"Welcome to {settings.app_name}", "mcp": "/sse"}

    return app


app = create_app()
