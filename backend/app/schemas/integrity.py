from __future__ import annotations

from pydantic import BaseModel, Field


class CounterMismatch(BaseModel):
    key: str = Field(..., description="Identificador del cliente o servicio evaluado")
    payments_via_payments: int = Field(..., description="Pagos encontrados en el módulo de pagos")
    payments_via_services: int = Field(..., description="Pagos asociados al servicio desde el módulo de servicios")


class PaymentClientMismatch(BaseModel):
    payment_id: str = Field(..., description="Pago con cliente inconsistente")
    client_id: str | None = Field(None, description="Cliente guardado en el pago")
    client_service_id: str | None = Field(None, description="Servicio asociado al pago")
    service_client_id: str | None = Field(None, description="Cliente dueño del servicio")


class PaymentConsistencyReport(BaseModel):
    client_counters: list[CounterMismatch]
    service_counters: list[CounterMismatch]
    payments_without_service: list[str]
    payments_with_mismatched_client: list[PaymentClientMismatch]
    services_without_client: list[str]
