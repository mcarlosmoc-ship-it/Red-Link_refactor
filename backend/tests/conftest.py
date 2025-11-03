from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.app.database import Base, get_db
from backend.app.main import app
from backend.app import models

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
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        try:
            yield db_session
        finally:
            db_session.rollback()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
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
        "period": period,
        "reseller": reseller,
    }
