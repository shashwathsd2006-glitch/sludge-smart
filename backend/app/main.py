"""SLUDGE SMART API entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import audit, auth, config, db, migrations
from .routers import router
from .routers_auth import router as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    migrations.run_migrations()
    auth.ensure_bootstrap_admin()
    yield


app = FastAPI(
    title="SLUDGE SMART API",
    description="Industrial wastewater sludge management and monitoring system",
    version="1.0.0",
    lifespan=lifespan,
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "request_id": audit.REQUEST_ID.get() or None,
        },
    )

if config.TRUSTED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(config.TRUSTED_ORIGINS),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )


@app.middleware("http")
async def correlation_id(request: Request, call_next):
    candidate = request.headers.get("X-Request-ID", "")
    if candidate and len(candidate) <= 64 and all(c.isalnum() or c in "-_" for c in candidate):
        request_id = candidate
    else:
        request_id = audit.new_request_id()
    token = audit.REQUEST_ID.set(request_id)
    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        audit.REQUEST_ID.reset(token)


app.include_router(router)
app.include_router(auth_router)
