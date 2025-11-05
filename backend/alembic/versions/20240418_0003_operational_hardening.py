"""Tighten integrity rules, add automation, and reporting views."""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20240418_0003"
down_revision = "20240315_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.create_check_constraint(
            "ck_billing_periods_key_matches_start",
            "billing_periods",
            "period_key = to_char(starts_on, 'YYYY-MM')",
        )
        op.create_check_constraint(
            "ck_billing_periods_month_span",
            "billing_periods",
            "date_trunc('month', starts_on)::date = starts_on AND "
            "(date_trunc('month', starts_on) + INTERVAL '1 month - 1 day')::date = ends_on",
        )
        op.create_check_constraint(
            "ck_clients_monthly_fee_non_negative",
            "clients",
            "monthly_fee >= 0",
        )
        op.create_check_constraint(
            "ck_clients_paid_months_non_negative",
            "clients",
            "paid_months_ahead >= 0",
        )
        op.create_check_constraint(
            "ck_clients_debt_months_non_negative",
            "clients",
            "debt_months >= 0",
        )
        op.create_check_constraint(
            "ck_payments_amount_non_negative",
            "payments",
            "amount >= 0",
        )
        op.create_check_constraint(
            "ck_payments_months_paid_positive",
            "payments",
            "months_paid > 0",
        )
        op.create_check_constraint(
            "ck_reseller_deliveries_total_non_negative",
            "reseller_deliveries",
            "total_value >= 0",
        )
        op.create_check_constraint(
            "ck_reseller_delivery_items_quantity",
            "reseller_delivery_items",
            "quantity >= 0",
        )
        op.create_check_constraint(
            "ck_reseller_settlements_amount_non_negative",
            "reseller_settlements",
            "amount >= 0",
        )
        op.create_check_constraint(
            "ck_inventory_items_assignment_consistency",
            "inventory_items",
            "(status = 'assigned' AND client_id IS NOT NULL) OR "
            "(status <> 'assigned' AND client_id IS NULL)",
        )
        op.create_check_constraint(
            "ck_inventory_items_purchase_cost_non_negative",
            "inventory_items",
            "purchase_cost IS NULL OR purchase_cost >= 0",
        )

    op.drop_index("clients_full_name_idx", table_name="clients")
    op.create_index(
        "clients_full_name_idx",
        "clients",
        ["full_name"],
        postgresql_using="gin",
        postgresql_ops={"full_name": "gin_trgm_ops"},
    )
    op.create_index(
        "clients_base_status_idx",
        "clients",
        ["base_id", "service_status"],
    )
    op.create_index(
        "clients_ip_address_unique_idx",
        "clients",
        ["ip_address"],
        unique=True,
        postgresql_where=sa.text("ip_address IS NOT NULL"),
        sqlite_where=sa.text("ip_address IS NOT NULL"),
    )
    op.create_index(
        "clients_antenna_ip_unique_idx",
        "clients",
        ["antenna_ip"],
        unique=True,
        postgresql_where=sa.text("antenna_ip IS NOT NULL"),
        sqlite_where=sa.text("antenna_ip IS NOT NULL"),
    )
    op.create_index(
        "clients_modem_ip_unique_idx",
        "clients",
        ["modem_ip"],
        unique=True,
        postgresql_where=sa.text("modem_ip IS NOT NULL"),
        sqlite_where=sa.text("modem_ip IS NOT NULL"),
    )

    op.create_index(
        "payments_client_period_idx",
        "payments",
        ["client_id", "period_key"],
    )
    op.create_index(
        "payments_client_paid_on_idx",
        "payments",
        ["client_id", "paid_on"],
    )
    op.create_index(
        "payments_period_paid_on_idx",
        "payments",
        ["period_key", "paid_on"],
    )

    op.create_index(
        "inventory_base_status_idx",
        "inventory_items",
        ["base_id", "status"],
    )
    op.create_index(
        "inventory_ip_address_unique_idx",
        "inventory_items",
        ["ip_address"],
        unique=True,
        postgresql_where=sa.text("ip_address IS NOT NULL"),
        sqlite_where=sa.text("ip_address IS NOT NULL"),
    )

    op.create_index(
        "reseller_deliveries_reseller_status_idx",
        "reseller_deliveries",
        ["reseller_id", "settlement_status"],
    )
    op.create_index(
        "reseller_deliveries_reseller_date_idx",
        "reseller_deliveries",
        ["reseller_id", "delivered_on"],
    )
    op.create_index(
        "reseller_settlements_reseller_idx",
        "reseller_settlements",
        ["reseller_id"],
    )
    op.create_index(
        "reseller_settlements_reseller_date_idx",
        "reseller_settlements",
        ["reseller_id", "settled_on"],
    )

    op.add_column(
        "reseller_settlements",
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default="pending",
        ),
    )

    if dialect == "postgresql":
        op.create_check_constraint(
            "ck_reseller_settlements_status",
            "reseller_settlements",
            "status IN ('pending', 'applied', 'void')",
        )

    op.execute("UPDATE reseller_settlements SET status = 'pending' WHERE status IS NULL")

    if dialect == "postgresql":
        op.execute(
            """
            CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
            RETURNS trigger AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            """
        )
        op.execute(
            """
            DROP TRIGGER IF EXISTS clients_set_updated_at ON clients;
            CREATE TRIGGER clients_set_updated_at
            BEFORE UPDATE ON clients
            FOR EACH ROW
            EXECUTE FUNCTION set_updated_at_timestamp();
            """
        )
        op.execute(
            """
            DROP TRIGGER IF EXISTS inventory_items_set_updated_at ON inventory_items;
            CREATE TRIGGER inventory_items_set_updated_at
            BEFORE UPDATE ON inventory_items
            FOR EACH ROW
            EXECUTE FUNCTION set_updated_at_timestamp();
            """
        )
        op.execute(
            """
            CREATE OR REPLACE FUNCTION enforce_reseller_settlement_delivery_match()
            RETURNS trigger AS $$
            DECLARE
                delivery_reseller uuid;
            BEGIN
                IF NEW.delivery_id IS NULL THEN
                    RETURN NEW;
                END IF;

                SELECT reseller_id INTO delivery_reseller
                FROM reseller_deliveries
                WHERE delivery_id = NEW.delivery_id;

                IF delivery_reseller IS NULL THEN
                    RETURN NEW;
                END IF;

                IF delivery_reseller <> NEW.reseller_id THEN
                    RAISE EXCEPTION 'Reseller settlement must match delivery reseller';
                END IF;

                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            """
        )
        op.execute(
            """
            DROP TRIGGER IF EXISTS reseller_settlements_validate_insert ON reseller_settlements;
            CREATE TRIGGER reseller_settlements_validate_insert
            BEFORE INSERT ON reseller_settlements
            FOR EACH ROW
            EXECUTE FUNCTION enforce_reseller_settlement_delivery_match();
            """
        )
        op.execute(
            """
            DROP TRIGGER IF EXISTS reseller_settlements_validate_update ON reseller_settlements;
            CREATE TRIGGER reseller_settlements_validate_update
            BEFORE UPDATE ON reseller_settlements
            FOR EACH ROW
            EXECUTE FUNCTION enforce_reseller_settlement_delivery_match();
            """
        )
        op.execute(
            """
            CREATE OR REPLACE FUNCTION refresh_reseller_delivery_total(target uuid)
            RETURNS void AS $$
            DECLARE
                new_total numeric(12,2);
            BEGIN
                SELECT COALESCE(SUM(di.quantity * COALESCE(
                    (
                        SELECT vp.price
                        FROM voucher_prices vp
                        WHERE vp.voucher_type_id = di.voucher_type_id
                          AND vp.effective_from <= d.delivered_on
                        ORDER BY vp.effective_from DESC
                        LIMIT 1
                    ),
                    0
                )), 0)
                INTO new_total
                FROM reseller_delivery_items di
                JOIN reseller_deliveries d ON d.delivery_id = di.delivery_id
                WHERE di.delivery_id = target;

                UPDATE reseller_deliveries
                SET total_value = COALESCE(new_total, 0)
                WHERE delivery_id = target;
            END;
            $$ LANGUAGE plpgsql;
            """
        )
        op.execute(
            """
            CREATE OR REPLACE FUNCTION reseller_delivery_items_sync_total()
            RETURNS trigger AS $$
            DECLARE
                target uuid;
            BEGIN
                target := COALESCE(NEW.delivery_id, OLD.delivery_id);
                IF target IS NULL THEN
                    RETURN NEW;
                END IF;
                PERFORM refresh_reseller_delivery_total(target);
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            """
        )
        op.execute(
            """
            DROP TRIGGER IF EXISTS reseller_delivery_items_after_insert ON reseller_delivery_items;
            CREATE TRIGGER reseller_delivery_items_after_insert
            AFTER INSERT ON reseller_delivery_items
            FOR EACH ROW
            EXECUTE FUNCTION reseller_delivery_items_sync_total();
            """
        )
        op.execute(
            """
            DROP TRIGGER IF EXISTS reseller_delivery_items_after_update ON reseller_delivery_items;
            CREATE TRIGGER reseller_delivery_items_after_update
            AFTER UPDATE ON reseller_delivery_items
            FOR EACH ROW
            EXECUTE FUNCTION reseller_delivery_items_sync_total();
            """
        )
        op.execute(
            """
            DROP TRIGGER IF EXISTS reseller_delivery_items_after_delete ON reseller_delivery_items;
            CREATE TRIGGER reseller_delivery_items_after_delete
            AFTER DELETE ON reseller_delivery_items
            FOR EACH ROW
            EXECUTE FUNCTION reseller_delivery_items_sync_total();
            """
        )
        op.execute(
            """
            DROP TRIGGER IF EXISTS reseller_deliveries_after_update ON reseller_deliveries;
            CREATE TRIGGER reseller_deliveries_after_update
            AFTER UPDATE OF delivered_on ON reseller_deliveries
            FOR EACH ROW
            EXECUTE FUNCTION reseller_delivery_items_sync_total();
            """
        )

    op.execute("DROP VIEW IF EXISTS reseller_delivery_totals")
    op.execute(
        """
        CREATE VIEW reseller_delivery_totals AS
        SELECT
            d.delivery_id,
            d.reseller_id,
            d.delivered_on,
            d.settlement_status,
            COALESCE((
                SELECT SUM(di.quantity * COALESCE((
                    SELECT vp.price
                    FROM voucher_prices vp
                    WHERE vp.voucher_type_id = di.voucher_type_id
                      AND vp.effective_from <= d.delivered_on
                    ORDER BY vp.effective_from DESC
                    LIMIT 1
                ), 0))
                FROM reseller_delivery_items di
                WHERE di.delivery_id = d.delivery_id
            ), 0) AS computed_total_value,
            d.total_value
        FROM reseller_deliveries d;
        """
    )

    op.execute("DROP VIEW IF EXISTS reseller_balances")
    op.execute(
        """
        CREATE VIEW reseller_balances AS
        SELECT
            r.reseller_id,
            r.full_name,
            r.base_id,
            COALESCE(dt.total_delivered, 0) AS total_delivered,
            COALESCE(st.total_settled, 0) AS total_settled,
            COALESCE(dt.total_delivered, 0) - COALESCE(st.total_settled, 0) AS outstanding_balance
        FROM resellers r
        LEFT JOIN (
            SELECT
                d.reseller_id,
                SUM(t.computed_total_value) AS total_delivered
            FROM reseller_delivery_totals t
            JOIN reseller_deliveries d ON d.delivery_id = t.delivery_id
            GROUP BY d.reseller_id
        ) dt ON dt.reseller_id = r.reseller_id
        LEFT JOIN (
            SELECT reseller_id, SUM(amount) AS total_settled
            FROM reseller_settlements
            WHERE status <> 'void'
            GROUP BY reseller_id
        ) st ON st.reseller_id = r.reseller_id;
        """
    )

    op.execute("DROP VIEW IF EXISTS base_period_revenue")
    op.execute(
        """
        CREATE VIEW base_period_revenue AS
        SELECT
            c.base_id,
            p.period_key,
            SUM(p.amount) AS total_payments
        FROM payments p
        JOIN clients c ON c.client_id = p.client_id
        GROUP BY c.base_id, p.period_key;
        """
    )

    op.execute("DROP VIEW IF EXISTS inventory_availability")
    op.execute(
        """
        CREATE VIEW inventory_availability AS
        SELECT
            b.base_id,
            b.name AS base_name,
            COALESCE(SUM(CASE WHEN i.status = 'available' THEN 1 ELSE 0 END), 0) AS available_items,
            COALESCE(SUM(CASE WHEN i.status = 'assigned' THEN 1 ELSE 0 END), 0) AS assigned_items,
            COALESCE(SUM(CASE WHEN i.status = 'maintenance' THEN 1 ELSE 0 END), 0) AS maintenance_items,
            COUNT(i.inventory_id) AS total_items
        FROM base_stations b
        LEFT JOIN inventory_items i ON i.base_id = b.base_id
        GROUP BY b.base_id, b.name;
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    op.execute("DROP VIEW IF EXISTS inventory_availability")
    op.execute("DROP VIEW IF EXISTS base_period_revenue")
    op.execute("DROP VIEW IF EXISTS reseller_balances")
    op.execute("DROP VIEW IF EXISTS reseller_delivery_totals")

    if dialect == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS reseller_deliveries_after_update ON reseller_deliveries")
        op.execute("DROP TRIGGER IF EXISTS reseller_delivery_items_after_delete ON reseller_delivery_items")
        op.execute("DROP TRIGGER IF EXISTS reseller_delivery_items_after_update ON reseller_delivery_items")
        op.execute("DROP TRIGGER IF EXISTS reseller_delivery_items_after_insert ON reseller_delivery_items")
        op.execute("DROP FUNCTION IF EXISTS reseller_delivery_items_sync_total()")
        op.execute("DROP FUNCTION IF EXISTS refresh_reseller_delivery_total(uuid)")
        op.execute("DROP TRIGGER IF EXISTS reseller_settlements_validate_update ON reseller_settlements")
        op.execute("DROP TRIGGER IF EXISTS reseller_settlements_validate_insert ON reseller_settlements")
        op.execute("DROP FUNCTION IF EXISTS enforce_reseller_settlement_delivery_match()")
        op.execute("DROP TRIGGER IF EXISTS inventory_items_set_updated_at ON inventory_items")
        op.execute("DROP TRIGGER IF EXISTS clients_set_updated_at ON clients")
        op.execute("DROP FUNCTION IF EXISTS set_updated_at_timestamp()")

        op.drop_constraint("ck_billing_periods_month_span", "billing_periods", type_="check")
        op.drop_constraint("ck_billing_periods_key_matches_start", "billing_periods", type_="check")
        op.drop_constraint("ck_clients_monthly_fee_non_negative", "clients", type_="check")
        op.drop_constraint("ck_clients_paid_months_non_negative", "clients", type_="check")
        op.drop_constraint("ck_clients_debt_months_non_negative", "clients", type_="check")
        op.drop_constraint("ck_payments_amount_non_negative", "payments", type_="check")
        op.drop_constraint("ck_payments_months_paid_positive", "payments", type_="check")
        op.drop_constraint("ck_reseller_deliveries_total_non_negative", "reseller_deliveries", type_="check")
        op.drop_constraint("ck_reseller_delivery_items_quantity", "reseller_delivery_items", type_="check")
        op.drop_constraint("ck_reseller_settlements_amount_non_negative", "reseller_settlements", type_="check")
        op.drop_constraint("ck_inventory_items_assignment_consistency", "inventory_items", type_="check")
        op.drop_constraint("ck_inventory_items_purchase_cost_non_negative", "inventory_items", type_="check")
        op.drop_constraint("ck_reseller_settlements_status", "reseller_settlements", type_="check")

    op.execute("ALTER TABLE reseller_settlements DROP COLUMN IF EXISTS status")

    op.drop_index("reseller_settlements_reseller_date_idx", table_name="reseller_settlements")
    op.drop_index("reseller_settlements_reseller_idx", table_name="reseller_settlements")
    op.drop_index("reseller_deliveries_reseller_date_idx", table_name="reseller_deliveries")
    op.drop_index("reseller_deliveries_reseller_status_idx", table_name="reseller_deliveries")

    op.drop_index("inventory_ip_address_unique_idx", table_name="inventory_items")
    op.drop_index("inventory_base_status_idx", table_name="inventory_items")

    op.drop_index("payments_period_paid_on_idx", table_name="payments")
    op.drop_index("payments_client_paid_on_idx", table_name="payments")
    op.drop_index("payments_client_period_idx", table_name="payments")

    op.drop_index("clients_modem_ip_unique_idx", table_name="clients")
    op.drop_index("clients_antenna_ip_unique_idx", table_name="clients")
    op.drop_index("clients_ip_address_unique_idx", table_name="clients")
    op.drop_index("clients_base_status_idx", table_name="clients")
    op.drop_index("clients_full_name_idx", table_name="clients")
    op.create_index("clients_full_name_idx", "clients", ["full_name"])
