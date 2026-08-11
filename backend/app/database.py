"""
Engine/session setup.

Self-contained default (SQLite via aiosqlite) so the whole stack runs with a
single `uvicorn` command — no Postgres roles, no Redis, no Celery. The
session/context helpers keep the same shape the route handlers rely on, so
swapping back to a Postgres + RLS deployment later only means changing
DATABASE_URL and re-enabling the tenant-context plumbing.
"""

import os

from contextlib import asynccontextmanager

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .core.config import get_settings

DATABASE_URL = get_settings().DATABASE_URL

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_async_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def set_tenant_context(session: AsyncSession, org_id: str) -> None:
    """
    No-op placeholder. In the Postgres/RLS deployment this ran
    `SET LOCAL app.current_org_id = :org_id` so row-level policies scoped
    every query. In the self-contained mode, tenancy is enforced in the
    route layer by explicit org_id filters (see `get_db_for_request`).
    """
    if DATABASE_URL.startswith("postgres"):
        await session.execute(text("SET LOCAL app.current_org_id = :org_id"), {"org_id": org_id})


@asynccontextmanager
async def tenant_session(org_id: str):
    """Yields a session with tenant context set (no-op outside Postgres).

    Routes own the transaction explicitly (``await db.commit()``). The
    ``SET LOCAL`` tenant statement must run inside a transaction, so on
    Postgres we wrap just that call; the yielded session is left open so
    route handlers can commit/rollback without hitting "closed transaction"
    errors.
    """
    async with SessionLocal() as session:
        if DATABASE_URL.startswith("postgres"):
            async with session.begin():
                await set_tenant_context(session, org_id)
        yield session


async def get_db_for_request(request: Request):
    """
    FastAPI dependency. org_id comes from the authenticated user attached to
    the request by the auth middleware. In self-contained mode routes use it
    to filter explicitly; the dependency also owns the session lifecycle.
    """
    org_id = str(request.state.user.org_id)
    async with tenant_session(org_id) as session:
        yield session


async def get_public_db():
    """FastAPI dependency for unauthenticated endpoints like auth and org onboarding."""
    async with SessionLocal() as session:
        yield session


async def get_tracking_db():
    """For the public /track/* routes — no tenant context needed."""
    async with SessionLocal() as session:
        yield session
