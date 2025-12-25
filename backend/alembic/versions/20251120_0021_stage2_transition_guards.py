"""Add stage 2 transition guards for legacy fields and IP reservations.

Revision ID: 20251120_0021_stage2_transition_guards
Revises: 20251115_0020_service_ledger_balance_view
Create Date: 2025-02-05
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "20251120_0021_stage2_transition_guards"
down_revision = "20251115_0020_service_ledger_balance_view"
branch_labels = None
depends_on = None


def _create_clients_debt_guards(dialect: str, inspector) -> None:
    if dialect == "postgresql":
        op.execute(
            """
            CREATE OR REPLACE FUNCTION clients_debt_columns_guard()
            RETURNS trigger AS $$
            BEGIN
              IF TG_OP = 'INSERT' THEN
                IF COALESCE(NEW.paid_months_ahead, 0) <> 0 OR COALESCE(NEW.debt_months, 0) <> 0 THEN
                  RAISE EXCEPTION 'paid_months_ahead/debt_months are legacy and read-only; derive from ledger';
                END IF;
              ELSIF TG_OP = 'UPDATE' THEN
                IF NEW.paid_months_ahead IS DISTINCT FROM OLD.paid_months_ahead OR NEW.debt_months IS DISTINCT FROM OLD.debt_months THEN
                  RAISE EXCEPTION 'paid_months_ahead/debt_months are legacy and read-only; derive from ledger';
                END IF;
              END IF;
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            """
        )
        op.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_clients_debt_columns_guard
            BEFORE INSERT OR UPDATE ON clients
            FOR EACH ROW EXECUTE FUNCTION clients_debt_columns_guard();
            """
        )
    else:
        op.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_clients_debt_columns_guard_insert
            BEFORE INSERT ON clients
            FOR EACH ROW
            WHEN COALESCE(NEW.paid_months_ahead, 0) <> 0 OR COALESCE(NEW.debt_months, 0) <> 0
            BEGIN
              SELECT RAISE(FAIL, 'paid_months_ahead/debt_months are legacy and read-only; derive from ledger');
            END;
            """
        )
        op.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_clients_debt_columns_guard_update
            BEFORE UPDATE ON clients
            FOR EACH ROW
            WHEN NEW.paid_months_ahead IS NOT OLD.paid_months_ahead OR NEW.debt_months IS NOT OLD.debt_months
            BEGIN
              SELECT RAISE(FAIL, 'paid_months_ahead/debt_months are legacy and read-only; derive from ledger');
            END;
            """
        )


def _create_legacy_payments_guard(dialect: str, inspector) -> None:
    if not inspector.has_table("legacy_payments"):
        return
    if dialect == "postgresql":
        op.execute(
            """
            CREATE OR REPLACE FUNCTION legacy_payments_read_only()
            RETURNS trigger AS $$
            BEGIN
              RAISE EXCEPTION 'legacy_payments is read-only; use service_payments + allocations';
            END;
            $$ LANGUAGE plpgsql;
            """
        )
        op.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_legacy_payments_read_only
            BEFORE INSERT OR UPDATE OR DELETE ON legacy_payments
            FOR EACH ROW EXECUTE FUNCTION legacy_payments_read_only();
            """
        )
    else:
        op.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_legacy_payments_read_only
            BEFORE INSERT ON legacy_payments
            FOR EACH ROW
            BEGIN
              SELECT RAISE(FAIL, 'legacy_payments is read-only; use service_payments + allocations');
            END;
            """
        )
        op.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_legacy_payments_read_only_update
            BEFORE UPDATE ON legacy_payments
            FOR EACH ROW
            BEGIN
              SELECT RAISE(FAIL, 'legacy_payments is read-only; use service_payments + allocations');
            END;
            """
        )
        op.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_legacy_payments_read_only_delete
            BEFORE DELETE ON legacy_payments
            FOR EACH ROW
            BEGIN
              SELECT RAISE(FAIL, 'legacy_payments is read-only; use service_payments + allocations');
            END;
            """
        )


def _create_ip_guards(dialect: str, inspector) -> None:
    has_client_services = inspector.has_table("client_services")
    has_inventory_items = inspector.has_table("inventory_items")
    if not has_client_services and not has_inventory_items:
        return
    client_service_ip_cols = set()
    inventory_ip_cols = set()
    if has_client_services:
        client_service_ip_cols = {
            c["name"] for c in inspector.get_columns("client_services") if c["name"] in {"ip_address", "antenna_ip", "modem_ip"}
        }
    if has_inventory_items:
        inventory_ip_cols = {c["name"] for c in inspector.get_columns("inventory_items") if c["name"] == "ip_address"}

    if not client_service_ip_cols and not inventory_ip_cols:
        return
    if dialect == "postgresql":
        if client_service_ip_cols:
            checks = " OR ".join(f"NEW.{col} IS NOT NULL" for col in client_service_ip_cols)
            diffs = " OR ".join(f"NEW.{col} IS DISTINCT FROM OLD.{col}" for col in client_service_ip_cols)
            op.execute(
                f"""
                CREATE OR REPLACE FUNCTION client_services_ip_guard()
                RETURNS trigger AS $$
                BEGIN
                  IF TG_OP = 'INSERT' THEN
                    IF {checks} THEN
                      RAISE EXCEPTION 'IP columns on client_services are legacy/read-only; use base_ip_reservations';
                    END IF;
                  ELSIF TG_OP = 'UPDATE' THEN
                    IF {diffs} THEN
                      RAISE EXCEPTION 'IP columns on client_services are legacy/read-only; use base_ip_reservations';
                    END IF;
                  END IF;
                  RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
                """
            )
            op.execute(
                """
                CREATE TRIGGER IF NOT EXISTS trg_client_services_ip_guard
                BEFORE INSERT OR UPDATE ON client_services
                FOR EACH ROW EXECUTE FUNCTION client_services_ip_guard();
                """
            )
        if inventory_ip_cols:
            op.execute(
                """
                CREATE OR REPLACE FUNCTION inventory_items_ip_guard()
                RETURNS trigger AS $$
                BEGIN
                  IF TG_OP = 'INSERT' THEN
                    IF NEW.ip_address IS NOT NULL THEN
                      RAISE EXCEPTION 'inventory_items.ip_address is legacy/read-only; use base_ip_reservations';
                    END IF;
                  ELSIF TG_OP = 'UPDATE' THEN
                    IF NEW.ip_address IS DISTINCT FROM OLD.ip_address THEN
                      RAISE EXCEPTION 'inventory_items.ip_address is legacy/read-only; use base_ip_reservations';
                    END IF;
                  END IF;
                  RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
                """
            )
            op.execute(
                """
                CREATE TRIGGER IF NOT EXISTS trg_inventory_items_ip_guard
                BEFORE INSERT OR UPDATE ON inventory_items
                FOR EACH ROW EXECUTE FUNCTION inventory_items_ip_guard();
                """
            )
    else:
        if client_service_ip_cols:
            checks = " OR ".join(f"NEW.{col} IS NOT NULL" for col in client_service_ip_cols)
            diffs = " OR ".join(f"NEW.{col} IS NOT OLD.{col}" for col in client_service_ip_cols)
            op.execute(
                f"""
                CREATE TRIGGER IF NOT EXISTS trg_client_services_ip_guard_insert
                BEFORE INSERT ON client_services
                FOR EACH ROW
                WHEN {checks}
                BEGIN
                  SELECT RAISE(FAIL, 'IP columns on client_services are legacy/read-only; use base_ip_reservations');
                END;
                """
            )
            op.execute(
                f"""
                CREATE TRIGGER IF NOT EXISTS trg_client_services_ip_guard_update
                BEFORE UPDATE ON client_services
                FOR EACH ROW
                WHEN {diffs}
                BEGIN
                  SELECT RAISE(FAIL, 'IP columns on client_services are legacy/read-only; use base_ip_reservations');
                END;
                """
            )
        if inventory_ip_cols:
            op.execute(
                """
                CREATE TRIGGER IF NOT EXISTS trg_inventory_items_ip_guard_insert
                BEFORE INSERT ON inventory_items
                FOR EACH ROW
                WHEN NEW.ip_address IS NOT NULL
                BEGIN
                  SELECT RAISE(FAIL, 'inventory_items.ip_address is legacy/read-only; use base_ip_reservations');
                END;
                """
            )
            op.execute(
                """
                CREATE TRIGGER IF NOT EXISTS trg_inventory_items_ip_guard_update
                BEFORE UPDATE ON inventory_items
                FOR EACH ROW
                WHEN NEW.ip_address IS NOT OLD.ip_address
                BEGIN
                  SELECT RAISE(FAIL, 'inventory_items.ip_address is legacy/read-only; use base_ip_reservations');
                END;
                """
            )


def _create_ip_reservation_guards(dialect: str, inspector) -> None:
    if not inspector.has_table("base_ip_reservations"):
        return
    if dialect == "postgresql":
        op.execute(
            """
            CREATE OR REPLACE FUNCTION base_ip_reservations_validate_pool()
            RETURNS trigger AS $$
            DECLARE
              pool_cidr TEXT;
            BEGIN
              IF NEW.pool_id IS NOT NULL THEN
                SELECT cidr INTO pool_cidr FROM base_ip_pools WHERE pool_id = NEW.pool_id;
                IF pool_cidr IS NULL THEN
                  RAISE EXCEPTION 'Invalid pool_id % for reservation', NEW.pool_id;
                END IF;
                IF NOT (NEW.ip_address << inet(pool_cidr)) THEN
                  RAISE EXCEPTION 'IP % is outside pool %', NEW.ip_address, pool_cidr;
                END IF;
              END IF;
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            """
        )
        op.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_base_ip_reservations_validate_pool
            BEFORE INSERT OR UPDATE ON base_ip_reservations
            FOR EACH ROW EXECUTE FUNCTION base_ip_reservations_validate_pool();
            """
        )
    else:
        # SQLite lacks inet operations; rely on FK + unique indexes only.
        pass

    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS base_ip_reservations_service_active_uidx
          ON base_ip_reservations(service_id)
          WHERE service_id IS NOT NULL AND status IN ('reserved', 'in_use');
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS base_ip_reservations_inventory_active_uidx
          ON base_ip_reservations(inventory_item_id)
          WHERE inventory_item_id IS NOT NULL AND status IN ('reserved', 'in_use');
        """
    )
    if dialect != "sqlite":
        op.create_foreign_key(
            "base_ip_reservations_pool_matches_base_fk",
            "base_ip_reservations",
            "base_ip_pools",
            ["base_id", "pool_id"],
            ["base_id", "pool_id"],
            source_schema=None,
            referent_schema=None,
        )


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    inspector = inspect(bind)

    _create_clients_debt_guards(dialect, inspector)
    _create_legacy_payments_guard(dialect, inspector)
    _create_ip_guards(dialect, inspector)
    _create_ip_reservation_guards(dialect, inspector)


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # Drop IP reservation helpers
    op.drop_index("base_ip_reservations_inventory_active_uidx", table_name="base_ip_reservations")
    op.drop_index("base_ip_reservations_service_active_uidx", table_name="base_ip_reservations")
    if dialect != "sqlite":
        op.drop_constraint(
            "base_ip_reservations_pool_matches_base_fk",
            "base_ip_reservations",
            type_="foreignkey",
        )
    if dialect == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS trg_base_ip_reservations_validate_pool ON base_ip_reservations")
        op.execute("DROP FUNCTION IF EXISTS base_ip_reservations_validate_pool")
    else:
        op.execute("DROP TRIGGER IF EXISTS trg_base_ip_reservations_validate_pool")

    # Drop IP guards
    if dialect == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS trg_client_services_ip_guard ON client_services")
        op.execute("DROP FUNCTION IF EXISTS client_services_ip_guard")
        op.execute("DROP TRIGGER IF EXISTS trg_inventory_items_ip_guard ON inventory_items")
        op.execute("DROP FUNCTION IF EXISTS inventory_items_ip_guard")
    else:
        op.execute("DROP TRIGGER IF EXISTS trg_client_services_ip_guard_insert")
        op.execute("DROP TRIGGER IF EXISTS trg_client_services_ip_guard_update")
        op.execute("DROP TRIGGER IF EXISTS trg_inventory_items_ip_guard_insert")
        op.execute("DROP TRIGGER IF EXISTS trg_inventory_items_ip_guard_update")

    # Drop legacy payments guards
    if dialect == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS trg_legacy_payments_read_only ON legacy_payments")
        op.execute("DROP FUNCTION IF EXISTS legacy_payments_read_only")
    else:
        op.execute("DROP TRIGGER IF EXISTS trg_legacy_payments_read_only")
        op.execute("DROP TRIGGER IF EXISTS trg_legacy_payments_read_only_update")
        op.execute("DROP TRIGGER IF EXISTS trg_legacy_payments_read_only_delete")

    # Drop clients debt guards
    if dialect == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS trg_clients_debt_columns_guard ON clients")
        op.execute("DROP FUNCTION IF EXISTS clients_debt_columns_guard")
    else:
        op.execute("DROP TRIGGER IF EXISTS trg_clients_debt_columns_guard_insert")
        op.execute("DROP TRIGGER IF EXISTS trg_clients_debt_columns_guard_update")
