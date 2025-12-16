from __future__ import annotations
from backend.app.main import start_background_jobs, stop_background_jobs
from backend.app.services.scheduler_monitor import (
    JOB_BACKUPS,
    JOB_OVERDUE_MONITOR,
    JOB_PAYMENT_REMINDERS,
    SchedulerMonitor,
)


def test_background_jobs_respect_enable_flags(monkeypatch):
    started = []

    def _stub(job_name: str):
        def _start() -> None:
            started.append(job_name)

        return _start

    SchedulerMonitor.reset()
    monkeypatch.setenv("ENABLE_OVERDUE_MONITOR", "0")
    monkeypatch.setenv("ENABLE_PAYMENT_REMINDERS", "0")
    monkeypatch.setenv("ENABLE_BACKUPS", "0")

    monkeypatch.setattr("backend.app.main.start_overdue_monitor", _stub(JOB_OVERDUE_MONITOR))
    monkeypatch.setattr(
        "backend.app.main.start_payment_reminder_scheduler", _stub(JOB_PAYMENT_REMINDERS)
    )
    monkeypatch.setattr("backend.app.main.start_backup_scheduler", _stub(JOB_BACKUPS))

    start_background_jobs()

    assert started == []
    snapshot = SchedulerMonitor.snapshot()
    assert snapshot[JOB_OVERDUE_MONITOR]["enabled"] is False
    assert snapshot[JOB_PAYMENT_REMINDERS]["enabled"] is False
    assert snapshot[JOB_BACKUPS]["enabled"] is False
    assert snapshot[JOB_OVERDUE_MONITOR]["last_tick"] is None


def test_background_jobs_stop_all(monkeypatch):
    stopped: list[str] = []

    def _stub(job_name: str):
        def _stop() -> None:
            stopped.append(job_name)

        return _stop

    monkeypatch.setattr("backend.app.main.stop_overdue_monitor", _stub(JOB_OVERDUE_MONITOR))
    monkeypatch.setattr(
        "backend.app.main.stop_payment_reminder_scheduler", _stub(JOB_PAYMENT_REMINDERS)
    )
    monkeypatch.setattr("backend.app.main.stop_backup_scheduler", _stub(JOB_BACKUPS))

    stop_background_jobs()

    assert stopped.count(JOB_OVERDUE_MONITOR) >= 1
    assert stopped.count(JOB_PAYMENT_REMINDERS) >= 1
    assert stopped.count(JOB_BACKUPS) >= 1


def test_scheduler_health_endpoint_reports_status(client):
    SchedulerMonitor.reset()
    SchedulerMonitor.set_job_enabled(JOB_OVERDUE_MONITOR, True)
    SchedulerMonitor.record_tick(JOB_OVERDUE_MONITOR)
    SchedulerMonitor.record_error(JOB_OVERDUE_MONITOR, "failing task")

    response = client.get("/metrics/scheduler")

    assert response.status_code == 200
    payload = response.json()
    overdue_status = payload["jobs"][JOB_OVERDUE_MONITOR]
    assert overdue_status["enabled"] is True
    assert isinstance(overdue_status["last_tick"], str)
    assert any("failing task" in entry for entry in overdue_status["recent_errors"])

