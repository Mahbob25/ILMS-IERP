"""Read-only system metrics probes for the System Health page.

Design rules:
- **Read-only.** SQL SELECTs, Redis INFO/XLEN, HTTP GETs to sibling containers,
  and cgroup file reads. No writes, no subprocess, no shell.
- **Independent.** Each probe is self-guarding and returns a well-formed dict
  with a ``status`` even when its dependency is down, so a single failure
  degrades one section instead of raising through the endpoint.
- **Concurrency-safe.** ``gather_metrics`` must share one ``AsyncSession``, and
  a SQLAlchemy AsyncSession is not safe for concurrent use — so the database
  probes run sequentially while the network/filesystem probes run alongside
  them.
"""
import asyncio
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.timezone import get_today

logger = logging.getLogger(__name__)

CGROUP_ROOT = Path("/sys/fs/cgroup")
STREAM_NAMES = ("ai:student", "ai:ingestion", "ai:dlq")
JOB_NAMES = ("section_daily_check", "notification_daily_check")


# ── small helpers ───────────────────────────────────────────────────────────

def _read_text(path: Path) -> Optional[str]:
    try:
        return path.read_text().strip()
    except OSError:
        return None


def _as_int(value: Any) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _err_detail(exc: BaseException, limit: int = 200) -> str:
    """Human-readable failure text.

    Some exceptions (e.g. a bare ImportError) carry an empty message, which
    would render as a blank detail in the UI — fall back to the type name.
    """
    text = str(exc).strip()
    return (text or type(exc).__name__)[:limit]


# ── resources ───────────────────────────────────────────────────────────────

async def probe_resources() -> dict:
    """Container CPU/memory from cgroup v2, with a psutil fallback.

    psutil's memory/cpu readings are host-wide (they parse /proc, which is not
    namespaced for these), so they are only a fallback and are labelled
    ``source="host"``.
    """
    import psutil

    disk = psutil.disk_usage("/")
    result: dict[str, Any] = {
        "source": "host",
        "host_disk_percent": disk.percent,
        "host_disk_total_gb": round(disk.total / (1024 ** 3), 1),
        "host_disk_used_gb": round(disk.used / (1024 ** 3), 1),
    }

    mem_current = _read_text(CGROUP_ROOT / "memory.current")
    mem_max = _read_text(CGROUP_ROOT / "memory.max")

    if mem_current is not None:
        used_mb = int(mem_current) / (1024 * 1024)
        limit_mb = None
        if mem_max and mem_max != "max":
            try:
                limit_mb = int(mem_max) / (1024 * 1024)
            except ValueError:
                limit_mb = None
        result.update({
            "source": "cgroup",
            "memory_used_mb": round(used_mb, 1),
            "memory_limit_mb": round(limit_mb, 1) if limit_mb else None,
            "memory_percent": round(used_mb / limit_mb * 100, 1) if limit_mb else None,
        })
    else:
        mem = psutil.virtual_memory()
        result.update({
            "memory_used_mb": round(mem.used / (1024 * 1024), 1),
            "memory_limit_mb": round(mem.total / (1024 * 1024), 1),
            "memory_percent": mem.percent,
        })

    cpu = await _cpu_percent()
    if cpu is None:
        # No cgroup cpu.stat (cgroup v1 or unavailable) — fall back to the
        # host-wide sampling so the field is still populated.
        cpu = psutil.cpu_percent(interval=0.1)
    result["cpu_percent"] = cpu
    return result


async def _cpu_percent() -> Optional[float]:
    """CPU usage as a percentage of what this container may consume.

    cgroup ``cpu.stat`` is a monotonic counter, so a percentage needs two
    samples. We take a short second sample rather than reporting nothing on
    first page load, and use ``cpu.max`` (quota/period) as the denominator so
    the number is meaningful for a limited container.
    """
    stat = _read_text(CGROUP_ROOT / "cpu.stat")
    if not stat:
        return None

    def usage_usec(raw: str) -> Optional[int]:
        for line in raw.splitlines():
            if line.startswith("usage_usec"):
                parts = line.split()
                if len(parts) == 2:
                    return _as_int(parts[1])
        return None

    first = usage_usec(stat)
    if first is None:
        return None

    await asyncio.sleep(0.1)

    second_raw = _read_text(CGROUP_ROOT / "cpu.stat")
    second = usage_usec(second_raw) if second_raw else None
    if second is None or second <= first:
        return None

    quota_cores = _cpu_quota_cores()
    elapsed_us = 0.1 * 1_000_000
    used = second - first
    if quota_cores:
        return round(used / (elapsed_us * quota_cores) * 100, 1)
    cores = os.cpu_count() or 1
    return round(used / elapsed_us * 100 / cores, 1)


def _cpu_quota_cores() -> Optional[float]:
    raw = _read_text(CGROUP_ROOT / "cpu.max")
    if not raw:
        return None
    parts = raw.split()
    if len(parts) != 2 or parts[0] == "max":
        return None
    quota = _as_int(parts[0])
    period = _as_int(parts[1])
    if not quota or not period:
        return None
    return quota / period


# ── database ────────────────────────────────────────────────────────────────

async def probe_database(db: AsyncSession) -> dict:
    try:
        row = (
            await db.execute(
                text(
                    """
                    SELECT
                      pg_size_pretty(pg_database_size(current_database())) AS size_pretty,
                      (SELECT count(*) FROM pg_stat_activity) AS connections,
                      current_setting('max_connections')::int AS max_connections,
                      (SELECT count(*) FROM pg_stat_activity
                         WHERE state = 'active' AND pid <> pg_backend_pid()) AS active,
                      (SELECT count(*) FROM pg_stat_activity
                         WHERE state = 'idle in transaction') AS idle_in_transaction,
                      (SELECT COALESCE(max(EXTRACT(EPOCH FROM (now() - xact_start)))::int, 0)
                         FROM pg_stat_activity WHERE xact_start IS NOT NULL) AS longest_txn_s,
                      (SELECT count(*) FROM pg_locks WHERE NOT granted) AS blocking_locks,
                      (SELECT count(*) FROM information_schema.tables
                         WHERE table_schema = 'public') AS table_count
                    """
                )
            )
        ).mappings().one()

        connections = _as_int(row["connections"])
        max_connections = _as_int(row["max_connections"])
        idle_txn = _as_int(row["idle_in_transaction"])
        blocking = _as_int(row["blocking_locks"])

        percent = None
        if connections is not None and max_connections:
            percent = round(connections / max_connections * 100, 1)

        status = "ok"
        if (percent is not None and percent >= 80) or (blocking or 0) > 0 or (idle_txn or 0) > 5:
            status = "warn"

        return {
            "status": status,
            "size_pretty": row["size_pretty"],
            "connections": connections,
            "max_connections": max_connections,
            "connections_percent": percent,
            "active": _as_int(row["active"]),
            "idle_in_transaction": idle_txn,
            "longest_transaction_seconds": _as_int(row["longest_txn_s"]),
            "blocking_locks": blocking,
            "table_count": _as_int(row["table_count"]),
        }
    except Exception as exc:
        logger.warning("sysmetrics: database probe failed: %s", exc)
        return {"status": "unreachable", "detail": _err_detail(exc)}


# ── migrations ──────────────────────────────────────────────────────────────

def _alembic_ini_path() -> Optional[Path]:
    if settings.ALEMBIC_INI_PATH:
        candidate = Path(settings.ALEMBIC_INI_PATH)
        return candidate if candidate.is_file() else None
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "alembic.ini"
        if candidate.is_file():
            return candidate
    return None


def _script_directory():
    """Build an alembic ScriptDirectory, or None if unavailable.

    ``script_location`` in alembic.ini is relative, so it is pinned to the ini's
    directory to remove any dependence on the process working directory.
    """
    ini = _alembic_ini_path()
    if ini is None:
        return None, "alembic.ini not found"
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        cfg = Config(str(ini))
        cfg.set_main_option("script_location", str(ini.parent / "alembic"))
        return ScriptDirectory.from_config(cfg), None
    except Exception as exc:
        return None, _err_detail(exc)


async def probe_migrations(db: AsyncSession) -> dict:
    try:
        db_revision = (
            await db.execute(text("SELECT version_num FROM alembic_version"))
        ).scalar()
    except Exception as exc:
        logger.warning("sysmetrics: could not read alembic_version: %s", exc)
        return {"status": "unknown", "detail": f"alembic_version unreadable: {_err_detail(exc, 150)}"}

    script, error = _script_directory()
    if script is None:
        return {
            "status": "unknown",
            "db_revision": db_revision,
            "detail": error,
        }

    try:
        heads = list(script.get_heads())
    except Exception as exc:
        return {
            "status": "unknown",
            "db_revision": db_revision,
            "detail": _err_detail(exc),
        }

    code_head = heads[0] if len(heads) == 1 else ",".join(sorted(heads))
    result = {"db_revision": db_revision, "code_head": code_head}

    if not db_revision:
        return {**result, "status": "unknown", "detail": "database has no alembic_version"}

    try:
        script.get_revision(db_revision)
    except Exception:
        return {
            **result,
            "status": "missing_revision",
            "detail": (
                "database is stamped at a revision with no migration file in this "
                "image — 'alembic upgrade head' will fail and the backend will crash-loop"
            ),
        }

    if db_revision in heads:
        return {**result, "status": "in_sync", "pending": 0}

    try:
        pending = len(list(script.iterate_revisions(code_head, db_revision))) - 1
    except Exception:
        pending = None
    return {
        **result,
        "status": "behind",
        "pending": pending,
        "detail": "database is behind the code head; the backend should apply it on boot",
    }


# ── redis ───────────────────────────────────────────────────────────────────

async def _close_redis(client) -> None:
    for closer in ("aclose", "close"):
        fn = getattr(client, closer, None)
        if fn is None:
            continue
        try:
            await fn()
            return
        except Exception:
            continue


async def probe_redis() -> dict:
    url = settings.REDIS_URL
    if not url:
        return {
            "status": "not_configured",
            "detail": "REDIS_URL is empty — the ERP runs without Redis in this environment",
        }

    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(
            url,
            decode_responses=True,
            socket_timeout=settings.HEALTH_PROBE_TIMEOUT_SECONDS,
            socket_connect_timeout=settings.HEALTH_PROBE_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        return {"status": "unreachable", "detail": _err_detail(exc)}

    try:
        started = time.perf_counter()
        await client.ping()
        latency_ms = round((time.perf_counter() - started) * 1000, 1)

        server = await client.info("server")
        memory = await client.info("memory")
        clients = await client.info("clients")
        stats = await client.info("stats")
        persistence = await client.info("persistence")

        streams: dict[str, Optional[int]] = {}
        pending: dict[str, Optional[int]] = {}
        for name in STREAM_NAMES:
            try:
                streams[name] = await client.xlen(name)
            except Exception:
                streams[name] = None

        # Pending (unacked) entries only exist once the consumer group is
        # created; NOGROUP is expected and means "nothing in flight".
        for name in ("ai:student", "ai:ingestion"):
            try:
                summary = await client.xpending(name, "ai-workers")
                pending[name] = _as_int(summary.get("pending")) if isinstance(summary, dict) else None
            except Exception:
                pending[name] = 0

        maxmemory = _as_int(memory.get("maxmemory")) or 0
        used = _as_int(memory.get("used_memory"))
        policy = memory.get("maxmemory_policy")

        warnings: list[str] = []
        if maxmemory == 0:
            warnings.append(
                "maxmemory is 0 — Redis will grow until the kernel OOM-kills the container"
            )
        if policy and policy.startswith("allkeys"):
            warnings.append(
                f"policy={policy} can evict the no-TTL job streams — use volatile-lru"
            )

        hits = _as_int(stats.get("keyspace_hits")) or 0
        misses = _as_int(stats.get("keyspace_misses")) or 0
        hit_rate = round(hits / (hits + misses), 4) if (hits + misses) else None

        return {
            "status": "ok",
            "latency_ms": latency_ms,
            "version": server.get("redis_version"),
            "used_memory_human": memory.get("used_memory_human"),
            "maxmemory_human": memory.get("maxmemory_human"),
            "maxmemory_bytes": maxmemory,
            "memory_percent": round(used / maxmemory * 100, 1) if used and maxmemory else None,
            "policy": policy,
            "connected_clients": _as_int(clients.get("connected_clients")),
            "evicted_keys": _as_int(stats.get("evicted_keys")),
            "hit_rate": hit_rate,
            "aof_enabled": persistence.get("aof_enabled") in (1, "1", True),
            "aof_last_write_status": persistence.get("aof_last_write_status"),
            "rdb_last_bgsave_status": persistence.get("rdb_last_bgsave_status"),
            "streams": streams,
            "stream_pending": pending,
            "warnings": warnings,
        }
    except Exception as exc:
        logger.warning("sysmetrics: redis probe failed: %s", exc)
        return {"status": "unreachable", "detail": _err_detail(exc)}
    finally:
        await _close_redis(client)


# ── sibling services ────────────────────────────────────────────────────────

async def probe_services() -> list[dict]:
    """HTTP health probes to sibling containers on the internal network.

    This is the honest substitute for container-state inspection: it reports
    whether the service actually answers, which is what affects users.
    """
    import httpx

    targets = [
        ("portal-backend", settings.HEALTH_PORTAL_HEALTH_URL),
        ("gateway", settings.HEALTH_GATEWAY_HEALTH_URL),
    ]
    results: list[dict] = []

    async with httpx.AsyncClient(timeout=settings.HEALTH_PROBE_TIMEOUT_SECONDS) as client:
        for name, url in targets:
            if not url:
                results.append({"name": name, "status": "unknown", "detail": "not configured"})
                continue
            try:
                started = time.perf_counter()
                resp = await client.get(url)
                latency_ms = round((time.perf_counter() - started) * 1000, 1)

                detail = None
                if name == "portal-backend":
                    try:
                        body = resp.json()
                        detail = f"redis={body.get('redis')} db={body.get('database')}"
                    except Exception:
                        detail = None

                results.append({
                    "name": name,
                    "status": "ok" if resp.status_code == 200 else "degraded",
                    "latency_ms": latency_ms,
                    "detail": detail if resp.status_code == 200 else f"HTTP {resp.status_code}",
                })
            except Exception as exc:
                logger.warning("sysmetrics: probe %s failed: %s", name, exc)
                results.append({
                    "name": name,
                    "status": "unreachable",
                    "detail": _err_detail(exc, 150),
                })

    return results


# ── daily jobs ──────────────────────────────────────────────────────────────

async def probe_jobs(db: AsyncSession) -> list[dict]:
    from app.modules.academic.models import DailyJobsLog

    today = get_today()
    results: list[dict] = []
    for job_name in JOB_NAMES:
        try:
            row = (
                await db.execute(
                    select(DailyJobsLog)
                    .where(DailyJobsLog.job_name == job_name)
                    .order_by(DailyJobsLog.last_run_date.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
        except Exception as exc:
            logger.warning("sysmetrics: job probe %s failed: %s", job_name, exc)
            results.append({"name": job_name, "last_run_date": None, "healthy": False})
            continue

        last_run = row.last_run_date if row else None
        results.append({
            "name": job_name,
            "last_run_date": last_run,
            "healthy": last_run is not None and last_run >= today - timedelta(days=1),
        })
    return results


# ── backups ─────────────────────────────────────────────────────────────────

async def probe_backups() -> dict:
    try:
        from app.modules.backups.service import list_backups

        listing = await list_backups()
    except Exception as exc:
        logger.warning("sysmetrics: backup probe failed: %s", exc)
        return {"status": "unknown", "detail": _err_detail(exc)}

    last = listing.last_backup
    age_hours = None
    if last:
        try:
            age_hours = round(
                (datetime.now(timezone.utc) - datetime.fromisoformat(last)).total_seconds() / 3600,
                1,
            )
        except Exception:
            age_hours = None

    if age_hours is None:
        status, detail = "fail", "no database backup found"
    elif age_hours > settings.HEALTH_BACKUP_FAIL_HOURS:
        status, detail = "fail", f"newest backup is {age_hours}h old"
    elif age_hours > settings.HEALTH_BACKUP_WARN_HOURS:
        status, detail = "warn", f"newest backup is {age_hours}h old (expected daily)"
    else:
        status, detail = "ok", f"newest backup is {age_hours}h old"

    return {
        "status": status,
        "last_backup": last,
        "age_hours": age_hours,
        "count": listing.total,
        "total_size_bytes": listing.total_size_bytes,
        "disk_free_gb": listing.disk_free_gb,
        "detail": detail,
    }


# ── aggregation ─────────────────────────────────────────────────────────────

async def gather_metrics(db: AsyncSession) -> dict:
    """Run every probe and return a partial-tolerant payload.

    The database probes share ``db`` and therefore run sequentially; the
    network and filesystem probes have no shared state and run concurrently
    alongside them.
    """
    io_results = await asyncio.gather(
        probe_redis(),
        probe_services(),
        probe_backups(),
        probe_resources(),
        return_exceptions=True,
    )

    database = await _guarded("database", probe_database(db), {"status": "unreachable"})
    migrations = await _guarded("migrations", probe_migrations(db), {"status": "unknown"})
    jobs = await _guarded("jobs", probe_jobs(db), [])

    redis_result, services_result, backups_result, resources_result = io_results
    return {
        "database": database,
        "migrations": migrations,
        "jobs": jobs,
        "redis": _unwrap("redis", redis_result, {"status": "unreachable"}),
        "services": _unwrap("services", services_result, []),
        "backups": _unwrap("backups", backups_result, {"status": "unknown"}),
        "resources": _unwrap("resources", resources_result, {}),
    }


async def _guarded(name: str, coro, fallback: Any) -> Any:
    try:
        return await coro
    except Exception as exc:
        logger.warning("sysmetrics: %s probe raised: %s", name, exc, exc_info=True)
        return fallback


def _unwrap(name: str, value: Any, fallback: Any) -> Any:
    if isinstance(value, BaseException):
        logger.warning("sysmetrics: %s probe raised: %s", name, value)
        return fallback
    return value
