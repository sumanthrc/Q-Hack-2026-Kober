"""
db/connection.py

Manages a psycopg (v3) connection pool to the Neon PostgreSQL database.
The DATABASE_URL (or DB_HOST) is read from .env.

Public helpers used by the engine:
    init_pool()      — called once at FastAPI startup
    execute(sql, params)
    executemany(sql, rows)
    fetchone(sql, params) -> dict | None
    fetchall(sql, params) -> list[dict]
"""

import os
from contextlib import contextmanager

from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row
from dotenv import load_dotenv

load_dotenv()

_pool: ConnectionPool | None = None


def init_pool(min_size: int = 1, max_size: int = 10) -> None:
    """Initialize the connection pool. Called once at app startup."""
    global _pool
    dsn = os.environ.get("DATABASE_URL") or os.environ.get("DB_HOST")
    if not dsn:
        raise RuntimeError(
            "No database URL found. Set DATABASE_URL or DB_HOST in .env"
        )
    _pool = ConnectionPool(dsn, min_size=min_size, max_size=max_size)
    print(f"[db] Connection pool initialised (min={min_size}, max={max_size})")


@contextmanager
def _get_conn():
    if _pool is None:
        raise RuntimeError("Connection pool not initialised. Call init_pool() first.")
    with _pool.connection() as conn:
        yield conn


def execute(sql: str, params=None) -> None:
    with _get_conn() as conn:
        conn.execute(sql, params)


def executemany(sql: str, rows) -> None:
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, rows)


def fetchone(sql: str, params=None) -> dict | None:
    with _get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            return dict(row) if row else None


def fetchall(sql: str, params=None) -> list[dict]:
    with _get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]
