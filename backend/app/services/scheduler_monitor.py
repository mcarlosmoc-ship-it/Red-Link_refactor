"""Centralised scheduler health tracking utilities."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Dict, MutableMapping

JOB_OVERDUE_MONITOR = "overdue_monitor"
JOB_PAYMENT_REMINDERS = "payment_reminders"
JOB_BACKUPS = "database_backups"


@dataclass
class JobStatus:
    """Runtime status information for a scheduled job."""

    enabled: bool = True
    last_tick: datetime | None = None
    recent_errors: deque[str] = field(default_factory=lambda: deque(maxlen=10))


class SchedulerMonitor:
    """Thread-safe tracker for background scheduler health."""

    _lock = Lock()
    _jobs: Dict[str, JobStatus] = {}

    @classmethod
    def set_job_enabled(cls, job_name: str, enabled: bool) -> None:
        with cls._lock:
            status = cls._jobs.get(job_name, JobStatus())
            status.enabled = enabled
            cls._jobs[job_name] = status

    @classmethod
    def record_tick(cls, job_name: str) -> None:
        with cls._lock:
            status = cls._jobs.get(job_name, JobStatus())
            status.last_tick = datetime.now(timezone.utc)
            cls._jobs[job_name] = status

    @classmethod
    def record_error(cls, job_name: str, message: str) -> None:
        timestamped = f"{datetime.now(timezone.utc).isoformat()} - {message}"
        with cls._lock:
            status = cls._jobs.get(job_name, JobStatus())
            status.recent_errors.append(timestamped)
            cls._jobs[job_name] = status

    @classmethod
    def snapshot(cls) -> MutableMapping[str, dict[str, object]]:
        with cls._lock:
            return {
                name: {
                    "enabled": status.enabled,
                    "last_tick": status.last_tick,
                    "recent_errors": list(status.recent_errors),
                }
                for name, status in cls._jobs.items()
            }

    @classmethod
    def reset(cls) -> None:
        with cls._lock:
            cls._jobs.clear()
