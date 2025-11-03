-- Red-Link ISP Database Schema
-- Target database: PostgreSQL 15+
-- This schema captures the core entities used across the Red-Link backoffice UI,
-- including clients, payments, inventory, resellers, vouchers, and operational expenses.

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
  ip_address INET,
  antenna_ip INET,
  modem_ip INET,
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

-- Billing periods tracked by the frontend (yyyy-mm format).
CREATE TABLE billing_periods (
  period_key TEXT PRIMARY KEY CHECK (period_key ~ '^[0-9]{4}-[0-9]{2}$'),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  UNIQUE (starts_on, ends_on)
);

-- Payments recorded against clients and periods.
CREATE TABLE payments (
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

CREATE INDEX payments_client_idx ON payments(client_id);
CREATE INDEX payments_period_idx ON payments(period_key);

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

COMMIT;
