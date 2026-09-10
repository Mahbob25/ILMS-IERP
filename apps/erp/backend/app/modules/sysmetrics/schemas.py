"""Schemas for the system-metrics probes shown on the System Health page.

Every section is optional/nullable by design: a probe that cannot reach its
dependency returns a status of ``unreachable`` instead of raising, so one dead
dependency never blanks the whole health payload.
"""
from datetime import date
from typing import Optional

from pydantic import BaseModel


class HealthResources(BaseModel):
    """CPU/memory for THIS container (cgroup) plus host disk.

    ``source`` records which mechanism produced the numbers so the UI can label
    them honestly: "cgroup" means measured for this container, "host" means the
    psutil fallback (host-wide, not cgroup-aware).
    """

    source: str = "host"
    memory_used_mb: Optional[float] = None
    memory_limit_mb: Optional[float] = None
    memory_percent: Optional[float] = None
    cpu_percent: Optional[float] = None
    host_disk_percent: float = 0.0
    host_disk_total_gb: float = 0.0
    host_disk_used_gb: float = 0.0


class HealthDatabase(BaseModel):
    status: str = "unknown"
    size_pretty: Optional[str] = None
    connections: Optional[int] = None
    max_connections: Optional[int] = None
    connections_percent: Optional[float] = None
    active: Optional[int] = None
    idle_in_transaction: Optional[int] = None
    longest_transaction_seconds: Optional[int] = None
    blocking_locks: Optional[int] = None
    table_count: Optional[int] = None
    detail: Optional[str] = None


class HealthMigrations(BaseModel):
    """Alembic state.

    ``missing_revision`` is the crash-loop condition: the database is stamped at
    a revision that has no migration file in the running image, so the
    entrypoint's ``alembic upgrade head`` fails and the backend never boots.
    """

    status: str = "unknown"
    db_revision: Optional[str] = None
    code_head: Optional[str] = None
    pending: Optional[int] = None
    detail: Optional[str] = None


class HealthRedis(BaseModel):
    status: str = "unknown"
    latency_ms: Optional[float] = None
    version: Optional[str] = None
    used_memory_human: Optional[str] = None
    maxmemory_human: Optional[str] = None
    maxmemory_bytes: Optional[int] = None
    memory_percent: Optional[float] = None
    policy: Optional[str] = None
    connected_clients: Optional[int] = None
    evicted_keys: Optional[int] = None
    hit_rate: Optional[float] = None
    aof_enabled: Optional[bool] = None
    aof_last_write_status: Optional[str] = None
    rdb_last_bgsave_status: Optional[str] = None
    streams: dict[str, Optional[int]] = {}
    stream_pending: dict[str, Optional[int]] = {}
    warnings: list[str] = []
    detail: Optional[str] = None


class HealthService(BaseModel):
    name: str
    status: str = "unknown"
    latency_ms: Optional[float] = None
    detail: Optional[str] = None


class HealthJob(BaseModel):
    name: str
    last_run_date: Optional[date] = None
    healthy: bool = False


class HealthBackups(BaseModel):
    status: str = "unknown"
    last_backup: Optional[str] = None
    age_hours: Optional[float] = None
    count: int = 0
    total_size_bytes: int = 0
    disk_free_gb: Optional[float] = None
    detail: Optional[str] = None
