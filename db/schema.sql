-- Red-Link ISP Database Schema
-- Target database: PostgreSQL 15+
-- This schema captures the core entities used across the Red-Link backoffice UI,
-- including clients, payments, inventory, resellers, vouchers, and operational expenses.
-- NOTE: This file is a reference schema; keep it synchronized with Alembic migrations
-- under backend/alembic/versions to match production changes.

BEGIN;

-- Base stations ("bases" in the UI) from which clients and inventory are associated.
CREATE TABLE base_stations (
  base_id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  notes TEXT
);

-- Core client records covering both residential subscribers and token-based community points.
CREATE TABLE clients (
  client_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_code TEXT UNIQUE,
  client_type TEXT NOT NULL CHECK (client_type IN ('residential', 'token')),
  full_name TEXT NOT NULL,
  location TEXT NOT NULL,
  base_id INTEGER NOT NULL REFERENCES base_stations(base_id) ON UPDATE CASCADE,
  antenna_model TEXT,
  modem_model TEXT,
  monthly_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_months_ahead NUMERIC(6,2) NOT NULL DEFAULT 0,
  debt_months NUMERIC(6,2) NOT NULL DEFAULT 0,
  service_status TEXT NOT NULL CHECK (service_status IN ('Activo', 'Suspendido')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX clients_full_name_idx ON clients USING GIN (to_tsvector('spanish', full_name));
CREATE INDEX clients_location_idx ON clients(location);
CREATE INDEX clients_base_idx ON clients(base_id);

-- Individual services contracted by each client (internet, streaming, hotspot, etc.).
CREATE TABLE client_services (
  client_service_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  service_type TEXT NOT NULL CHECK (
    service_type IN (
      'internet_private',
      'internet_tokens',
      'streaming_spotify',
      'streaming_netflix',
      'streaming_vix',
      'public_desk',
      'point_of_sale',
      'other'
    )
  ),
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled', 'pending')),
  billing_day INTEGER CHECK (billing_day IS NULL OR (billing_day >= 1 AND billing_day <= 31)),
  next_billing_date DATE,
  price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'MXN',
  base_id INTEGER REFERENCES base_stations(base_id) ON DELETE SET NULL,
  ip_address INET,
  antenna_ip INET,
  modem_ip INET,
  antenna_model TEXT,
  modem_model TEXT,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  UNIQUE (client_id, service_type, display_name)
);

CREATE INDEX client_services_client_idx ON client_services(client_id);
CREATE INDEX client_services_base_idx ON client_services(base_id);
CREATE UNIQUE INDEX client_services_ip_unique_idx ON client_services(ip_address) WHERE ip_address IS NOT NULL;
CREATE UNIQUE INDEX client_services_antenna_ip_unique_idx ON client_services(antenna_ip) WHERE antenna_ip IS NOT NULL;
CREATE UNIQUE INDEX client_services_modem_ip_unique_idx ON client_services(modem_ip) WHERE modem_ip IS NOT NULL;

-- Billing periods tracked by the frontend (yyyy-mm format).
CREATE TABLE billing_periods (
  period_key TEXT PRIMARY KEY CHECK (period_key ~ '^[0-9]{4}-[0-9]{2}$'),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  UNIQUE (starts_on, ends_on)
);

-- Legacy payments recorded against clients and periods.
CREATE TABLE legacy_payments (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  period_key TEXT NOT NULL REFERENCES billing_periods(period_key) ON DELETE RESTRICT,
  paid_on DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  months_paid NUMERIC(6,2) NOT NULL DEFAULT 1,
  method TEXT NOT NULL CHECK (method IN ('Efectivo', 'Transferencia', 'Tarjeta', 'Revendedor', 'Otro')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX legacy_payments_client_idx ON legacy_payments(client_id);
CREATE INDEX legacy_payments_period_idx ON legacy_payments(period_key);

-- Principal accounts and their client accounts for the portal.
CREATE TABLE principal_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_principal TEXT NOT NULL UNIQUE,
  nota TEXT,
  fecha_alta TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_account_id UUID NOT NULL REFERENCES principal_accounts(id) ON DELETE CASCADE,
  correo_cliente TEXT NOT NULL UNIQUE,
  contrasena_cliente TEXT NOT NULL,
  perfil TEXT NOT NULL,
  nombre_cliente TEXT NOT NULL,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_proximo_pago DATE,
  estatus TEXT NOT NULL
);

CREATE INDEX client_accounts_fecha_proximo_pago_idx ON client_accounts(fecha_proximo_pago);
CREATE INDEX client_accounts_estatus_idx ON client_accounts(estatus);

-- Payments tracked for client accounts.
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  monto NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  fecha_pago DATE NOT NULL,
  periodo_correspondiente TEXT,
  metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('Efectivo', 'Transferencia', 'Tarjeta', 'Revendedor', 'Otro')),
  notas TEXT
);

-- Audit log for reminders sent to client accounts.
CREATE TABLE payment_reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('upcoming', 'overdue')),
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('sent', 'failed')),
  destination TEXT NOT NULL,
  channel TEXT NOT NULL,
  due_date DATE,
  provider_message_id TEXT,
  response_code INTEGER,
  error_message TEXT,
  payload TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX payment_reminder_logs_client_idx ON payment_reminder_logs(client_account_id);
CREATE INDEX payment_reminder_logs_created_at_idx ON payment_reminder_logs(created_at);
CREATE INDEX payment_reminder_logs_type_idx ON payment_reminder_logs(reminder_type);

-- Voucher catalog used by resellers.
CREATE TABLE voucher_types (
  voucher_type_id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);

-- Voucher pricing, allowing historical changes by period.
CREATE TABLE voucher_prices (
  voucher_price_id SERIAL PRIMARY KEY,
  voucher_type_id INTEGER NOT NULL REFERENCES voucher_types(voucher_type_id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  UNIQUE (voucher_type_id, effective_from)
);

-- Reseller records.
CREATE TABLE resellers (
  reseller_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  base_id INTEGER NOT NULL REFERENCES base_stations(base_id) ON UPDATE CASCADE,
  location TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deliveries of voucher batches to resellers.
CREATE TABLE reseller_deliveries (
  delivery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES resellers(reseller_id) ON DELETE CASCADE,
  delivered_on DATE NOT NULL,
  settlement_status TEXT NOT NULL DEFAULT 'pending' CHECK (settlement_status IN ('pending', 'settled', 'partial')),
  total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT
);

-- Individual voucher counts per delivery.
CREATE TABLE reseller_delivery_items (
  delivery_item_id SERIAL PRIMARY KEY,
  delivery_id UUID NOT NULL REFERENCES reseller_deliveries(delivery_id) ON DELETE CASCADE,
  voucher_type_id INTEGER NOT NULL REFERENCES voucher_types(voucher_type_id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity >= 0)
);

-- Settlements recorded when resellers reconcile delivered vouchers.
CREATE TABLE reseller_settlements (
  settlement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES resellers(reseller_id) ON DELETE CASCADE,
  delivery_id UUID REFERENCES reseller_deliveries(delivery_id) ON DELETE SET NULL,
  settled_on DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  notes TEXT
);

-- Inventory equipment managed by the ISP.
CREATE TABLE inventory_items (
  inventory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_tag TEXT UNIQUE,
  brand TEXT NOT NULL,
  model TEXT,
  serial_number TEXT,
  base_id INTEGER NOT NULL REFERENCES base_stations(base_id) ON UPDATE CASCADE,
  ip_address INET,
  status TEXT NOT NULL CHECK (status IN ('assigned', 'available', 'maintenance')),
  location TEXT NOT NULL,
  client_id UUID REFERENCES clients(client_id) ON DELETE SET NULL,
  notes TEXT,
  installed_at DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX inventory_status_idx ON inventory_items(status);
CREATE INDEX inventory_client_idx ON inventory_items(client_id);

-- IP pools allocated to each base and their reservations.
CREATE TABLE base_ip_pools (
  pool_id SERIAL PRIMARY KEY,
  base_id INTEGER NOT NULL REFERENCES base_stations(base_id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  cidr TEXT NOT NULL,
  vlan TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (base_id, cidr)
);

CREATE INDEX base_ip_pools_base_idx ON base_ip_pools(base_id);

CREATE TABLE base_ip_reservations (
  reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id INTEGER NOT NULL REFERENCES base_stations(base_id) ON DELETE CASCADE,
  pool_id INTEGER REFERENCES base_ip_pools(pool_id) ON DELETE SET NULL,
  ip_address INET NOT NULL,
  status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'reserved', 'in_use', 'quarantine')),
  service_id UUID REFERENCES client_services(client_service_id) ON DELETE SET NULL,
  inventory_item_id UUID REFERENCES inventory_items(inventory_id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(client_id) ON DELETE SET NULL,
  notes TEXT,
  assigned_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (base_id, ip_address)
);

CREATE INDEX base_ip_reservations_status_idx ON base_ip_reservations(status);
CREATE INDEX base_ip_reservations_pool_idx ON base_ip_reservations(pool_id);
CREATE INDEX base_ip_reservations_service_idx ON base_ip_reservations(service_id);
CREATE INDEX base_ip_reservations_client_idx ON base_ip_reservations(client_id);
CREATE INDEX base_ip_reservations_inventory_item_idx ON base_ip_reservations(inventory_item_id);

CREATE TABLE base_ip_assignment_history (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES base_ip_reservations(reservation_id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('reserve', 'assign', 'release', 'quarantine')),
  previous_status TEXT,
  new_status TEXT NOT NULL,
  service_id UUID REFERENCES client_services(client_service_id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(client_id) ON DELETE SET NULL,
  inventory_item_id UUID REFERENCES inventory_items(inventory_id) ON DELETE SET NULL,
  note TEXT,
  recorded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Operating expenses tracked per base.
CREATE TABLE expenses (
  expense_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id INTEGER NOT NULL REFERENCES base_stations(base_id) ON UPDATE CASCADE,
  expense_date DATE NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX expenses_base_date_idx ON expenses(base_id, expense_date DESC);

-- Monthly base operating costs.
CREATE TABLE base_operating_costs (
  cost_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id INTEGER NOT NULL REFERENCES base_stations(base_id) ON DELETE CASCADE,
  period_key TEXT NOT NULL REFERENCES billing_periods(period_key) ON DELETE CASCADE,
  total_cost NUMERIC(12,2) NOT NULL,
  UNIQUE (base_id, period_key)
);

-- Initial data mirroring the frontend defaults.
INSERT INTO base_stations (code, name, location, notes)
VALUES
  ('BASE1', 'Base 1', 'Nuevo Amatenango', 'Cobertura principal'),
  ('BASE2', 'Base 2', 'Lagunita', 'Cobertura extendida');

INSERT INTO voucher_types (code, description)
VALUES
  ('h1', 'Ficha 1 hora'),
  ('h3', 'Ficha 3 horas'),
  ('d1', 'Ficha 1 día'),
  ('w1', 'Ficha 1 semana'),
  ('d15', 'Ficha 15 días'),
  ('m1', 'Ficha 1 mes');

INSERT INTO voucher_prices (voucher_type_id, effective_from, price)
SELECT voucher_type_id, DATE '2025-01-01',
  CASE code
    WHEN 'h1' THEN 5
    WHEN 'h3' THEN 8
    WHEN 'd1' THEN 15
    WHEN 'w1' THEN 45
    WHEN 'd15' THEN 70
    WHEN 'm1' THEN 140
  END
FROM voucher_types;

-- View of current service-to-IP assignments.
CREATE VIEW service_ip_assignments AS
SELECT
  reservation_id,
  service_id,
  client_id,
  base_id,
  pool_id,
  ip_address,
  status,
  assigned_at,
  released_at,
  inventory_item_id,
  created_at,
  updated_at
FROM base_ip_reservations
WHERE service_id IS NOT NULL;

COMMIT;
