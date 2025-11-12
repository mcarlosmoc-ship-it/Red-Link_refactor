"""Expose Pydantic schemas for convenient imports."""

from .account import (
    ClientAccountCreate,
    ClientAccountListResponse,
    ClientAccountPaymentCreate,
    ClientAccountPaymentListResponse,
    ClientAccountPaymentRead,
    ClientAccountRead,
    ClientAccountUpdate,
    PrincipalAccountCreate,
    PrincipalAccountListResponse,
    PrincipalAccountRead,
    PrincipalAccountUpdate,
)
from .common import PaginatedResponse
from .client import (
    ClientBase,
    ClientCreate,
    ClientImportError,
    ClientImportRequest,
    ClientImportSummary,
    ClientListResponse,
    ClientRead,
    ClientUpdate,
    ZoneSummary,
)
from .expense import ExpenseBase, ExpenseCreate, ExpenseListResponse, ExpenseRead
from .inventory import (
    InventoryBase,
    InventoryCreate,
    InventoryListResponse,
    InventoryRead,
    InventoryUpdate,
)
from .ip_pool import (
    BaseIpPoolBase,
    BaseIpPoolCreate,
    BaseIpPoolListResponse,
    BaseIpPoolRead,
    BaseIpPoolUpdate,
    BaseIpReservationBase,
    BaseIpReservationCreate,
    BaseIpReservationListResponse,
    BaseIpReservationRead,
    BaseIpReservationUpdate,
)
from .metrics import (
    BaseCostUpdateRequest,
    BaseCostUpdateResponse,
    CommunityMetrics,
    DashboardClient,
    DashboardMetricsResponse,
    DashboardMetricsSummary,
    MetricsOverview,
    MetricsResponse,
    StatusFilter,
)
from .payment import (
    ServicePaymentBase,
    ServicePaymentCreate,
    ServicePaymentListResponse,
    ServicePaymentRead,
    ServicePaymentUpdate,
)
from .pos import (
    PosProductCreate,
    PosProductListResponse,
    PosProductRead,
    PosProductUpdate,
    PosSaleCreate,
    PosSaleListResponse,
    PosSaleRead,
)
from .reseller import (
    ResellerBase,
    ResellerCreate,
    ResellerDeliveryCreate,
    ResellerDeliveryItemBase,
    ResellerDeliveryRead,
    ResellerRead,
    ResellerSettlementCreate,
    ResellerSettlementRead,
)
from .service_plan import (
    ServicePlanBase,
    ServicePlanCreate,
    ServicePlanListResponse,
    ServicePlanRead,
    ServicePlanUpdate,
)
from .auth import AdminLoginRequest, TokenResponse

__all__ = [
    "PrincipalAccountCreate",
    "PrincipalAccountRead",
    "PrincipalAccountUpdate",
    "PrincipalAccountListResponse",
    "ClientAccountCreate",
    "ClientAccountRead",
    "ClientAccountUpdate",
    "ClientAccountListResponse",
    "ClientAccountPaymentCreate",
    "ClientAccountPaymentRead",
    "ClientAccountPaymentListResponse",
    "ClientBase",
    "ClientCreate",
    "ClientRead",
    "ClientListResponse",
    "ClientUpdate",
    "ClientImportError",
    "ClientImportRequest",
    "ClientImportSummary",
    "ZoneSummary",
    "ClientServiceBase",
    "ClientServiceBulkCreate",
    "ClientServiceCreate",
    "ClientServiceInlineCreate",
    "ClientServiceRead",
    "ClientServiceUpdate",
    "ClientServiceListResponse",
    "PaginatedResponse",
    "ServicePaymentBase",
    "ServicePaymentCreate",
    "ServicePaymentRead",
    "ServicePaymentListResponse",
    "ServicePaymentUpdate",
    "PosProductCreate",
    "PosProductRead",
    "PosProductUpdate",
    "PosProductListResponse",
    "PosSaleCreate",
    "PosSaleRead",
    "PosSaleListResponse",
    "ExpenseBase",
    "ExpenseCreate",
    "ExpenseRead",
    "ExpenseListResponse",
    "InventoryBase",
    "InventoryCreate",
    "InventoryRead",
    "InventoryUpdate",
    "InventoryListResponse",
    "BaseIpPoolBase",
    "BaseIpPoolCreate",
    "BaseIpPoolRead",
    "BaseIpPoolUpdate",
    "BaseIpPoolListResponse",
    "BaseIpReservationBase",
    "BaseIpReservationCreate",
    "BaseIpReservationRead",
    "BaseIpReservationUpdate",
    "BaseIpReservationListResponse",
    "ResellerBase",
    "ResellerCreate",
    "ResellerDeliveryCreate",
    "ResellerDeliveryItemBase",
    "ResellerDeliveryRead",
    "ResellerRead",
    "ResellerSettlementCreate",
    "ResellerSettlementRead",
    "MetricsOverview",
    "CommunityMetrics",
    "MetricsResponse",
    "StatusFilter",
    "DashboardClient",
    "DashboardMetricsSummary",
    "DashboardMetricsResponse",
    "BaseCostUpdateRequest",
    "BaseCostUpdateResponse",
    "AdminLoginRequest",
    "TokenResponse",
    "ServicePlanBase",
    "ServicePlanSummary",
    "ServicePlanCreate",
    "ServicePlanUpdate",
    "ServicePlanRead",
    "ServicePlanListResponse",
]
from .service import (
    ClientServiceBase,
    ClientServiceBulkCreate,
    ClientServiceCreate,
    ClientServiceInlineCreate,
    ClientServiceListResponse,
    ClientServiceRead,
    ClientServiceUpdate,
    ServicePlanSummary,
)

# Resolve forward references for schemas that rely on cross-module types.
ServicePaymentRead.model_rebuild(
    _types_namespace={
        "ClientRead": ClientRead,
        "ClientServiceRead": ClientServiceRead,
    }
)
ClientListResponse.model_rebuild(_types_namespace={"ClientRead": ClientRead})
ClientServiceListResponse.model_rebuild(
    _types_namespace={"ClientServiceRead": ClientServiceRead}
)
ServicePaymentListResponse.model_rebuild(
    _types_namespace={"ServicePaymentRead": ServicePaymentRead}
)
