"""Importa cuentas principales, clientes y pagos desde un archivo Excel normalizado."""

from __future__ import annotations

import argparse
import os
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd


ALLOWED_PAYMENT_METHODS = {"Efectivo", "Transferencia", "Tarjeta", "Revendedor", "Otro"}
CLIENT_LIMIT_PER_PRINCIPAL = 5


@dataclass
class PrincipalSummary:
    created: int = 0
    updated: int = 0


@dataclass
class ClientSummary:
    created: int = 0
    skipped_existing: int = 0
    skipped_conflict: int = 0
    skipped_invalid: int = 0


@dataclass
class PaymentSummary:
    created: int = 0
    skipped_missing_client: int = 0
    skipped_invalid: int = 0


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Lee una hoja de cálculo normalizada y crea registros en la base de datos "
            "utilizando los modelos SQLAlchemy del proyecto."
        )
    )
    parser.add_argument("source", type=Path, help="Ruta del archivo Excel normalizado")
    parser.add_argument(
        "--database-url",
        dest="database_url",
        help="URL de la base de datos (si se omite se utiliza DATABASE_URL o SQLite local)",
    )
    parser.add_argument(
        "--conflict-report",
        dest="conflict_report",
        type=Path,
        default=Path("import_conflicts.csv"),
        help="Ruta del reporte CSV donde se listarán los conflictos detectados",
    )
    parser.add_argument(
        "--sample-size",
        dest="sample_size",
        type=int,
        default=5,
        help="Cantidad de registros aleatorios a mostrar para verificación",
    )
    return parser.parse_args()


def _load_sheet(workbook: Path, sheet_name: str) -> pd.DataFrame:
    try:
        return pd.read_excel(workbook, sheet_name=sheet_name)
    except ValueError as exc:
        raise ValueError(f"No se encontró la hoja '{sheet_name}' en {workbook}") from exc


def _prepare_principal_frame(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if "email_principal" not in df.columns:
        raise ValueError("La hoja principal_accounts debe contener la columna 'email_principal'.")
    df["email_principal"] = df["email_principal"].astype(str).str.strip()
    if "nota" in df.columns:
        df["nota"] = df["nota"].fillna("")
    if "fecha_alta" in df.columns:
        df["fecha_alta"] = pd.to_datetime(df["fecha_alta"], errors="coerce", utc=True)
    return df


def _prepare_client_frame(df: pd.DataFrame) -> pd.DataFrame:
    required = {"principal_email", "correo_cliente", "perfil", "nombre_cliente", "estatus"}
    df = df.copy()
    missing = required - set(df.columns)
    if missing:
        missing_cols = ", ".join(sorted(missing))
        raise ValueError(
            f"La hoja client_accounts debe contener las columnas requeridas: {missing_cols}."
        )
    for column in ["principal_email", "correo_cliente"]:
        df[column] = df[column].astype(str).str.strip()
    if "contrasena_cliente" in df.columns:
        df["contrasena_cliente"] = df["contrasena_cliente"].fillna("").astype(str)
    if "fecha_registro" in df.columns:
        df["fecha_registro"] = pd.to_datetime(df["fecha_registro"], errors="coerce", utc=True)
    if "fecha_proximo_pago" in df.columns:
        df["fecha_proximo_pago"] = pd.to_datetime(
            df["fecha_proximo_pago"], errors="coerce"
        ).dt.date
    return df


def _prepare_payment_frame(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    df = df.copy()
    for column in ["client_email"]:
        if column in df.columns:
            df[column] = df[column].astype(str).str.strip()
    if "fecha_pago" in df.columns:
        df["fecha_pago"] = pd.to_datetime(df["fecha_pago"], errors="coerce").dt.date
    if "monto" in df.columns:
        df["monto"] = pd.to_numeric(df["monto"], errors="coerce")
    return df


def _detect_client_conflicts(client_df: pd.DataFrame) -> Dict[str, List[str]]:
    conflicts: Dict[str, List[str]] = {}
    if client_df.empty:
        return conflicts
    grouped = client_df.groupby("principal_email")["correo_cliente"].apply(list)
    for principal_email, clients in grouped.items():
        if len(clients) > CLIENT_LIMIT_PER_PRINCIPAL:
            conflicts[principal_email] = clients
    return conflicts


def _write_conflict_report(conflicts: Dict[str, List[str]], destination: Path) -> None:
    if not conflicts:
        return
    rows = []
    for principal_email, clients in conflicts.items():
        for correo in clients:
            rows.append(
                {
                    "principal_email": principal_email,
                    "correo_cliente": correo,
                    "motivo": "excede el máximo de clientes permitidos",
                }
            )
    report_df = pd.DataFrame(rows)
    destination.parent.mkdir(parents=True, exist_ok=True)
    report_df.to_csv(destination, index=False)
    print(
        f"Conflictos detectados. Revise y resuelva manualmente el archivo {destination.as_posix()}"
    )


def _coerce_decimal(value: object) -> Optional[Decimal]:
    if pd.isna(value):
        return None
    try:
        return Decimal(str(value))
    except (ValueError, ArithmeticError):
        return None


def _ensure_allowed_payment_method(value: Optional[str]) -> str:
    if not value or not isinstance(value, str):
        return "Otro"
    value = value.strip()
    return value if value in ALLOWED_PAYMENT_METHODS else "Otro"


def _create_principals(
    session,
    principal_df: pd.DataFrame,
) -> Tuple[PrincipalSummary, Dict[str, "PrincipalAccount"]]:
    from sqlalchemy.orm import Session

    from ..models.client_account import PrincipalAccount

    assert isinstance(session, Session)

    summary = PrincipalSummary()
    principals: Dict[str, PrincipalAccount] = {}

    for row in principal_df.itertuples(index=False):
        email = getattr(row, "email_principal", None)
        if not email:
            continue
        email = str(email).strip()
        if not email:
            continue
        existing = (
            session.query(PrincipalAccount)
            .filter(PrincipalAccount.email_principal == email)
            .one_or_none()
        )
        fecha_alta = getattr(row, "fecha_alta", None)
        nota = getattr(row, "nota", None)
        if existing:
            principals[email] = existing
            if nota and nota != (existing.nota or ""):
                existing.nota = nota
                summary.updated += 1
            continue
        principal = PrincipalAccount(
            email_principal=email,
            nota=nota or None,
        )
        if pd.notna(fecha_alta):
            fecha_alta_dt = pd.to_datetime(fecha_alta, errors="coerce", utc=True)
            if pd.notna(fecha_alta_dt):
                principal.fecha_alta = fecha_alta_dt.to_pydatetime()
        session.add(principal)
        session.flush()
        principals[email] = principal
        summary.created += 1
    return summary, principals


def _create_clients(
    session,
    client_df: pd.DataFrame,
    principals: Dict[str, "PrincipalAccount"],
    conflicts: Dict[str, List[str]],
) -> Tuple[ClientSummary, Dict[str, "ClientAccount"]]:
    from sqlalchemy.orm import Session

    from ..models.client_account import ClientAccount

    assert isinstance(session, Session)

    summary = ClientSummary()
    clients: Dict[str, ClientAccount] = {}

    conflicting_principals = set(conflicts)

    for row in client_df.itertuples(index=False):
        principal_email = getattr(row, "principal_email", "").strip()
        correo_cliente = getattr(row, "correo_cliente", "").strip()
        if not principal_email or not correo_cliente:
            summary.skipped_invalid += 1
            continue
        if principal_email in conflicting_principals:
            summary.skipped_conflict += 1
            continue
        principal = principals.get(principal_email)
        if principal is None:
            summary.skipped_invalid += 1
            continue
        existing = (
            session.query(ClientAccount)
            .filter(ClientAccount.correo_cliente == correo_cliente)
            .one_or_none()
        )
        if existing:
            clients[correo_cliente] = existing
            summary.skipped_existing += 1
            continue
        cliente = ClientAccount(
            principal_account_id=principal.id,
            correo_cliente=correo_cliente,
            perfil=getattr(row, "perfil", "").strip(),
            nombre_cliente=getattr(row, "nombre_cliente", "").strip(),
            estatus=getattr(row, "estatus", "").strip() or "Activo",
        )
        password_value = getattr(row, "contrasena_cliente", "")
        if not password_value:
            summary.skipped_invalid += 1
            continue
        cliente.contrasena_cliente = str(password_value)

        fecha_registro = getattr(row, "fecha_registro", None)
        if pd.notna(fecha_registro):
            fecha_registro_dt = pd.to_datetime(fecha_registro, errors="coerce", utc=True)
            if pd.notna(fecha_registro_dt):
                cliente.fecha_registro = fecha_registro_dt.to_pydatetime()
        fecha_proximo = getattr(row, "fecha_proximo_pago", None)
        if pd.notna(fecha_proximo):
            fecha_proximo_dt = pd.to_datetime(fecha_proximo, errors="coerce")
            if pd.notna(fecha_proximo_dt):
                cliente.fecha_proximo_pago = fecha_proximo_dt.date()

        session.add(cliente)
        session.flush()
        clients[correo_cliente] = cliente
        summary.created += 1

    return summary, clients


def _create_payments(
    session,
    payment_df: pd.DataFrame,
    clients: Dict[str, "ClientAccount"],
) -> PaymentSummary:
    from sqlalchemy.orm import Session

    from ..models.client_account import ClientAccountPayment

    assert isinstance(session, Session)

    summary = PaymentSummary()
    if payment_df.empty:
        return summary

    for row in payment_df.itertuples(index=False):
        client_email = getattr(row, "client_email", "").strip()
        if not client_email:
            summary.skipped_invalid += 1
            continue
        client = clients.get(client_email)
        if client is None:
            summary.skipped_missing_client += 1
            continue
        monto = _coerce_decimal(getattr(row, "monto", None))
        fecha_pago = getattr(row, "fecha_pago", None)
        if monto is None or pd.isna(fecha_pago):
            summary.skipped_invalid += 1
            continue
        fecha_pago_dt = pd.to_datetime(fecha_pago, errors="coerce")
        if pd.isna(fecha_pago_dt):
            summary.skipped_invalid += 1
            continue
        payment = ClientAccountPayment(
            client_account_id=client.id,
            monto=monto,
            fecha_pago=fecha_pago_dt.date(),
            periodo_correspondiente=getattr(row, "periodo_correspondiente", None),
            metodo_pago=_ensure_allowed_payment_method(getattr(row, "metodo_pago", None)),
            notas=getattr(row, "notas", None),
        )
        session.add(payment)
        summary.created += 1
    return summary


def _print_summary(
    principal_summary: PrincipalSummary,
    client_summary: ClientSummary,
    payment_summary: PaymentSummary,
) -> None:
    print("==== Resumen de importación ====")
    print(f"Cuentas principales creadas: {principal_summary.created}")
    print(f"Cuentas principales actualizadas: {principal_summary.updated}")
    print(f"Clientes creados: {client_summary.created}")
    print(f"Clientes existentes omitidos: {client_summary.skipped_existing}")
    print(f"Clientes omitidos por conflicto: {client_summary.skipped_conflict}")
    print(f"Clientes omitidos por datos inválidos: {client_summary.skipped_invalid}")
    print(f"Pagos creados: {payment_summary.created}")
    print(f"Pagos omitidos (sin cliente): {payment_summary.skipped_missing_client}")
    print(f"Pagos omitidos (datos inválidos): {payment_summary.skipped_invalid}")


def _print_random_samples(session, sample_size: int) -> None:
    from sqlalchemy import func

    from ..models.client_account import ClientAccount, ClientAccountPayment, PrincipalAccount

    def _sample(model):
        total = session.query(model).count()
        if total == 0:
            return []
        size = min(sample_size, total)
        return session.query(model).order_by(func.random()).limit(size).all()

    principals = _sample(PrincipalAccount)
    clients = _sample(ClientAccount)
    payments = _sample(ClientAccountPayment)

    print("==== Muestras aleatorias ====")
    if principals:
        print("Principales:")
        for principal in principals:
            print(f" - {principal.email_principal} | Nota: {principal.nota or '-'} | Alta: {principal.fecha_alta}")
    if clients:
        print("Clientes:")
        for client in clients:
            print(
                f" - {client.correo_cliente} | Principal: {client.principal_account.email_principal} "
                f"| Perfil: {client.perfil} | Registro: {client.fecha_registro} "
                f"| Próximo pago: {client.fecha_proximo_pago}"
            )
    if payments:
        print("Pagos:")
        for payment in payments:
            print(
                f" - {payment.client_account.correo_cliente} | Monto: {payment.monto} "
                f"| Fecha: {payment.fecha_pago} | Método: {payment.metodo_pago}"
            )


def main() -> None:
    args = _parse_args()

    if args.database_url:
        os.environ.setdefault("DATABASE_URL", args.database_url)

    from ..database import session_scope

    principal_df = _prepare_principal_frame(_load_sheet(args.source, "principal_accounts"))
    client_df = _prepare_client_frame(_load_sheet(args.source, "client_accounts"))
    payment_df = _prepare_payment_frame(_load_sheet(args.source, "payments"))

    conflicts = _detect_client_conflicts(client_df)
    _write_conflict_report(conflicts, args.conflict_report)

    with session_scope() as session:
        principal_summary, principals = _create_principals(session, principal_df)
        client_summary, clients = _create_clients(session, client_df, principals, conflicts)
        payment_summary = _create_payments(session, payment_df, clients)
        _print_summary(principal_summary, client_summary, payment_summary)
        _print_random_samples(session, args.sample_size)


if __name__ == "__main__":
    main()
