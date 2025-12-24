-- Red-Link ISP Database Schema
-- Target database: PostgreSQL 15+
-- This schema captures the core entities used across the Red-Link backoffice UI,
-- including clients, payments, inventory, resellers, vouchers, and operational expenses.
-- NOTE: Alembic migrations are the source of truth. This file is a reference
-- snapshot that must be regenerated or updated whenever migrations change.

BEGIN;

-- Shared enums for catalog consistency.
CREATE TYPE client_account_status_enum AS ENUM ('activo', 'suspendido', 'moroso');
CREATE TYPE payment_method_enum AS ENUM ('Mixto', 'Efectivo', 'Transferencia', 'Tarjeta', 'Revendedor', 'Otro');
CREATE TYPE subscription_status_enum AS ENUM ('active', 'suspended', 'cancelled', 'pending');
CREATE TYPE charge_status_enum AS ENUM ('pending', 'invoiced', 'partially_paid', 'paid', 'void');
CREATE TYPE billing_cycle_enum AS ENUM ('monthly', 'quarterly', 'semiannual', 'annual');

-- Base stations ("bases" in the UI) from which clients and inventory are associated.
CREATE TABLE base_stations (
  base_id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  notes TEXT
);

-- Service catalogs and plan pricing history.
CREATE TABLE service_catalog (
  catalog_id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE service_plans (
  plan_id SERIAL PRIMARY KEY,
  catalog_id INTEGER NOT NULL REFERENCES service_catalog(catalog_id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  download_speed_mbps NUMERIC(10,2),
  upload_speed_mbps NUMERIC(10,2),
  billing_cycle billing_cycle_enum NOT NULL DEFAULT 'monthly',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (catalog_id, code)
);

CREATE TABLE service_plan_prices (
  plan_price_id SERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES service_plans(plan_id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'MXN',
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, currency, effective_from)
);

CREATE INDEX service_plan_prices_plan_idx ON service_plan_prices(plan_id);

-- Core client records covering both residential subscribers and token-based community points.
CREATE TABLE clients (
  client_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_code TEXT UNIQUE,
  client_type TEXT NOT NULL CHECK (client_type IN ('residential', 'token')),
  full_name TEXT NOT NULL,
  location TEXT NOT NULL,
  base_id INTEGER NOT NULL REFERENCES base_stations(base_id) ON UPDATE CASCADE,
  paid_months_ahead NUMERIC(6,2) NOT NULL DEFAULT 0,
  debt_months NUMERIC(6,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX clients_full_name_idx ON clients USING GIN (to_tsvector('spanish', full_name));
CREATE INDEX clients_location_idx ON clients(location);
CREATE INDEX clients_location_trgm_idx ON clients USING GIN (location gin_trgm_ops);
CREATE INDEX clients_base_idx ON clients(base_id);

-- Individual services contracted by each client (internet, streaming, hotspot, etc.).
CREATE TABLE client_services (
  client_service_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  plan_id INTEGER REFERENCES service_plans(plan_id) ON DELETE SET NULL,
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
  status subscription_status_enum NOT NULL DEFAULT 'active',
  billing_cycle billing_cycle_enum NOT NULL DEFAULT 'monthly',
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
  UNIQUE (client_id, service_type, display_name),
  UNIQUE (client_id, client_service_id)
);

CREATE INDEX client_services_client_idx ON client_services(client_id);
CREATE INDEX client_services_base_idx ON client_services(base_id);
CREATE INDEX client_services_plan_idx ON client_services(plan_id);
CREATE UNIQUE INDEX client_services_ip_unique_idx ON client_services(ip_address) WHERE ip_address IS NOT NULL;
CREATE UNIQUE INDEX client_services_antenna_ip_unique_idx ON client_services(antenna_ip) WHERE antenna_ip IS NOT NULL;
CREATE UNIQUE INDEX client_services_modem_ip_unique_idx ON client_services(modem_ip) WHERE modem_ip IS NOT NULL;

-- Subscription metadata built on top of client services.
CREATE TABLE subscriptions (
  subscription_id UUID PRIMARY KEY REFERENCES client_services(client_service_id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  plan_id INTEGER REFERENCES service_plans(plan_id) ON DELETE SET NULL,
  billing_cycle billing_cycle_enum NOT NULL DEFAULT 'monthly',
  billing_anchor_day INTEGER CHECK (billing_anchor_day IS NULL OR (billing_anchor_day >= 1 AND billing_anchor_day <= 31)),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  status subscription_status_enum NOT NULL DEFAULT 'active',
  trial_ends_at DATE,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subscription_id, client_id)
);

CREATE INDEX subscriptions_client_idx ON subscriptions(client_id);
CREATE INDEX subscriptions_plan_idx ON subscriptions(plan_id);

-- Billing periods tracked by the frontend (yyyy-mm format).
CREATE TABLE billing_periods (
  period_key TEXT PRIMARY KEY CHECK (period_key ~ '^[0-9]{4}-[0-9]{2}$'),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  CHECK (ends_on >= starts_on),
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
  method payment_method_enum NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX legacy_payments_client_idx ON legacy_payments(client_id);
CREATE INDEX legacy_payments_period_idx ON legacy_payments(period_key);

-- Payments tied to specific client services (supersedes legacy_payments).
CREATE TABLE service_payments (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_service_id UUID NOT NULL REFERENCES client_services(client_service_id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(subscription_id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  period_key TEXT REFERENCES billing_periods(period_key) ON DELETE RESTRICT,
  paid_on DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  months_paid NUMERIC(6,2) CHECK (months_paid IS NULL OR months_paid > 0),
  method payment_method_enum NOT NULL,
  method_breakdown JSONB,
  note TEXT,
  recorded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX service_payments_client_idx ON service_payments(client_id);
CREATE INDEX service_payments_service_idx ON service_payments(client_service_id);
CREATE INDEX service_payments_subscription_idx ON service_payments(subscription_id);
CREATE INDEX service_payments_period_idx ON service_payments(period_key);
CREATE INDEX service_payments_paid_on_idx ON service_payments(paid_on);

-- Monthly charges generated per service subscription and period.
CREATE TABLE service_charges (
  charge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(subscription_id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  period_key TEXT NOT NULL REFERENCES billing_periods(period_key) ON DELETE RESTRICT,
  charge_date DATE NOT NULL,
  due_date DATE CHECK (due_date IS NULL OR due_date >= charge_date),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status charge_status_enum NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subscription_id, period_key)
);

CREATE INDEX service_charges_client_idx ON service_charges(client_id);
CREATE INDEX service_charges_subscription_idx ON service_charges(subscription_id);
CREATE INDEX service_charges_period_idx ON service_charges(period_key);
CREATE INDEX service_charges_status_idx ON service_charges(status);
CREATE INDEX service_charges_charge_date_idx ON service_charges(charge_date);

-- Allocation of payments to specific service charges (supports partials/advance).
CREATE TABLE service_charge_payments (
  allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id UUID NOT NULL REFERENCES service_charges(charge_id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES service_payments(payment_id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  applied_on DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (charge_id, payment_id)
);

CREATE INDEX service_charge_payments_charge_idx ON service_charge_payments(charge_id);
CREATE INDEX service_charge_payments_payment_idx ON service_charge_payments(payment_id);

-- Compatibility view for legacy payment consumers (one row per allocation).
CREATE VIEW payments_compat_view AS
SELECT
  sp.payment_id,
  sp.client_id,
  sc.period_key,
  sp.paid_on,
  scp.amount,
  sp.months_paid,
  sp.method,
  sp.note,
  sp.created_at
FROM service_payments sp
JOIN service_charge_payments scp ON scp.payment_id = sp.payment_id
JOIN service_charges sc ON sc.charge_id = scp.charge_id

UNION ALL

SELECT
  sp.payment_id,
  sp.client_id,
  sp.period_key,
  sp.paid_on,
  sp.amount,
  sp.months_paid,
  sp.method,
  sp.note,
  sp.created_at
FROM service_payments sp
WHERE NOT EXISTS (
  SELECT 1 FROM service_charge_payments scp
  WHERE scp.payment_id = sp.payment_id
);

-- Principal accounts and their client accounts for the portal.
CREATE TABLE principal_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_principal TEXT NOT NULL UNIQUE,
  nota TEXT,
  fecha_alta TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_account_profiles (
  profile TEXT PRIMARY KEY,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_account_id UUID NOT NULL REFERENCES principal_accounts(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(client_id) ON DELETE SET NULL,
  correo_cliente TEXT NOT NULL UNIQUE,
  contrasena_cliente TEXT NOT NULL,
  perfil TEXT NOT NULL REFERENCES client_account_profiles(profile) ON DELETE RESTRICT,
  nombre_cliente TEXT NOT NULL,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_proximo_pago DATE,
  estatus client_account_status_enum NOT NULL
);

CREATE INDEX client_accounts_client_idx ON client_accounts(client_id);
CREATE INDEX client_accounts_fecha_proximo_pago_idx ON client_accounts(fecha_proximo_pago);
CREATE INDEX client_accounts_estatus_idx ON client_accounts(estatus);

-- Link portal accounts to the services they manage.
CREATE TABLE client_account_services (
  account_service_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  client_service_id UUID NOT NULL REFERENCES client_services(client_service_id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_account_services_service_fk FOREIGN KEY (client_id, client_service_id)
    REFERENCES client_services(client_id, client_service_id) ON DELETE CASCADE,
  UNIQUE (client_account_id, client_service_id),
  UNIQUE (client_id, client_service_id)
);

CREATE INDEX client_account_services_account_idx ON client_account_services(client_account_id);
CREATE INDEX client_account_services_service_idx ON client_account_services(client_service_id);
CREATE INDEX client_account_services_client_idx ON client_account_services(client_id);

-- Payments tracked for client accounts.
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  monto NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  fecha_pago DATE NOT NULL,
  periodo_correspondiente TEXT,
  metodo_pago payment_method_enum NOT NULL,
  notas TEXT
);

-- Bridge portal payments to the unified service payment flow.
CREATE TABLE client_account_payment_links (
  link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  service_payment_id UUID REFERENCES service_payments(payment_id) ON DELETE SET NULL,
  service_charge_id UUID REFERENCES service_charges(charge_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portal_payment_id),
  UNIQUE (service_payment_id, service_charge_id)
);

CREATE INDEX client_account_payment_links_payment_idx ON client_account_payment_links(portal_payment_id);
CREATE INDEX client_account_payment_links_service_payment_idx ON client_account_payment_links(service_payment_id);

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
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('assigned', 'available', 'maintenance')),
  location TEXT NOT NULL,
  client_id UUID REFERENCES clients(client_id) ON DELETE SET NULL,
  notes TEXT,
  installed_at DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX inventory_status_idx ON inventory_items(status);
CREATE INDEX inventory_client_idx ON inventory_items(client_id);
CREATE INDEX inventory_brand_trgm_idx ON inventory_items USING GIN (brand gin_trgm_ops);
CREATE INDEX inventory_model_trgm_idx ON inventory_items USING GIN (model gin_trgm_ops);
CREATE INDEX inventory_serial_trgm_idx ON inventory_items USING GIN (serial_number gin_trgm_ops);
CREATE INDEX inventory_asset_tag_trgm_idx ON inventory_items USING GIN (asset_tag gin_trgm_ops);

-- Historical mapping of inventory assignments per client service.
CREATE TABLE client_service_equipment (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_service_id UUID NOT NULL REFERENCES client_services(client_service_id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES inventory_items(inventory_id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE (client_service_id, inventory_id, assigned_at)
);

CREATE INDEX client_service_equipment_service_idx ON client_service_equipment(client_service_id);
CREATE INDEX client_service_equipment_inventory_idx ON client_service_equipment(inventory_id);
CREATE UNIQUE INDEX client_service_equipment_active_unique_idx ON client_service_equipment(client_service_id, inventory_id) WHERE released_at IS NULL;

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
  UNIQUE (base_id, cidr),
  UNIQUE (base_id, pool_id)
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

ALTER TABLE base_ip_reservations
  ADD CONSTRAINT base_ip_reservations_pool_matches_base_fk
  FOREIGN KEY (base_id, pool_id) REFERENCES base_ip_pools(base_id, pool_id);

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
