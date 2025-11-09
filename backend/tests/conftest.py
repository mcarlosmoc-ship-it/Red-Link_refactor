from __future__ import annotations

from datetime import date
from decimal import Decimal
import base64
import os
import sys
from pathlib import Path
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

# Ensure the project root (which exposes the ``backend`` package) is on ``sys.path``
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.database import Base, get_db
from backend.app.main import app
from backend.app import models
from backend.app.security import generate_password_hash, generate_totp_code


@pytest.fixture(scope="session")
def security_settings(tmp_path_factory) -> dict:
    password = "Adm1nS3cret!"
    otp_secret = base64.b32encode(os.urandom(20)).decode("ascii").rstrip("=")
    backup_dir = tmp_path_factory.mktemp("db_backups")

    os.environ["CLIENT_PASSWORD_KEY"] = base64.urlsafe_b64encode(b"\x01" * 32).decode()
    os.environ["ADMIN_USERNAME"] = "admin@example.com"
    os.environ["ADMIN_JWT_SECRET"] = base64.urlsafe_b64encode(os.urandom(32)).decode()
    os.environ["ADMIN_TOTP_SECRET"] = otp_secret
    os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "60"
    os.environ["DATABASE_BACKUP_DIR"] = str(backup_dir)
    os.environ["DATABASE_BACKUP_FREQUENCY"] = "24h"

    os.environ["ADMIN_PASSWORD_HASH"] = generate_password_hash(password)

    return {
        "username": os.environ["ADMIN_USERNAME"],
        "password": password,
        "otp_secret": otp_secret,
        "backup_dir": backup_dir,
    }


@pytest.fixture(scope="session", autouse=True)
def _ensure_security_settings(security_settings: dict) -> Generator[None, None, None]:
    yield

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


@pytest.fixture(scope="session", autouse=True)
def setup_database() -> Generator[None, None, None]:
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session: Session, security_settings: dict) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        try:
            yield db_session
        finally:
            db_session.expire_all()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        otp_code = generate_totp_code(security_settings["otp_secret"])
        response = test_client.post(
            "/auth/token",
            json={
                "username": security_settings["username"],
                "password": security_settings["password"],
                "otp_code": otp_code,
            },
        )
        assert response.status_code == 200
        token = response.json()["access_token"]
        test_client.headers.update({"Authorization": f"Bearer {token}"})
        yield test_client
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def seed_basic_data(db_session: Session) -> dict:
    base = models.BaseStation(code="B1", name="Base Uno", location="Centro")
    db_session.add(base)

    period = models.BillingPeriod(period_key="2025-01", starts_on=date(2025, 1, 1), ends_on=date(2025, 1, 31))
    db_session.add(period)

    client = models.Client(
        full_name="Cliente Demo",
        location="Centro",
        base=base,
        client_type=models.ClientType.RESIDENTIAL,
        monthly_fee=Decimal("300"),
        debt_months=Decimal("2"),
        paid_months_ahead=Decimal("0"),
        service_status=models.ServiceStatus.SUSPENDED,
    )
    db_session.add(client)

    plan = models.ServicePlan(
        name="Internet mensual",
        service_type=models.ClientServiceType.INTERNET,
        default_monthly_fee=Decimal("300"),
        description="Plan base de internet residencial",
    )
    db_session.add(plan)
    db_session.flush()

    client_service = models.ClientService(
        client=client,
        service_plan=plan,
        service_type=plan.service_type,
        display_name=plan.name,
        status=models.ClientServiceStatus.ACTIVE,
        price=plan.default_monthly_fee,
        currency="MXN",
    )
    db_session.add(client_service)

    reseller = models.Reseller(full_name="Revendedor Demo", base=base, location="Centro")
    db_session.add(reseller)

    settlement = models.ResellerSettlement(
        reseller=reseller,
        settled_on=date(2025, 1, 15),
        amount=Decimal("150"),
        notes="Liquidación semanal",
    )
    db_session.add(settlement)

    expense = models.Expense(
        base=base,
        expense_date=date(2025, 1, 5),
        category="Gasolina",
        description="Traslados",
        amount=Decimal("100"),
    )
    db_session.add(expense)

    base_cost = models.BaseOperatingCost(base=base, period_key="2025-01", total_cost=Decimal("200"))
    db_session.add(base_cost)

    db_session.commit()

    return {
        "client": client,
        "client_service": client_service,
        "service_plan": plan,
        "period": period,
        "reseller": reseller,
    }
