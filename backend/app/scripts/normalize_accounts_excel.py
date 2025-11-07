"""Utilities for normalising legacy Excel exports before importing them."""

from __future__ import annotations

import argparse
import unicodedata
from pathlib import Path
from typing import Dict, Iterable, List

import pandas as pd

DEFAULT_COLUMN_MAPPING: Dict[str, str] = {
    "correo_principal": "email_principal",
    "email_principal": "email_principal",
    "correo_de_contacto": "email_principal",
    "nota": "nota",
    "nota_principal": "nota",
    "notas": "nota",
    "fecha_alta": "fecha_alta",
    "fecha_de_alta": "fecha_alta",
    "correo_cliente": "correo_cliente",
    "email_cliente": "correo_cliente",
    "contrasena": "contrasena_cliente",
    "contrasena_cliente": "contrasena_cliente",
    "contraseña": "contrasena_cliente",
    "contraseña_cliente": "contrasena_cliente",
    "perfil": "perfil",
    "nombre_cliente": "nombre_cliente",
    "nombre": "nombre_cliente",
    "fecha_registro": "fecha_registro",
    "fecha_de_registro": "fecha_registro",
    "fecha_proximo_pago": "fecha_proximo_pago",
    "fecha_próximo_pago": "fecha_proximo_pago",
    "fecha_proximo": "fecha_proximo_pago",
    "estatus": "estatus",
    "estatus_cliente": "estatus",
    "monto": "monto",
    "monto_pago": "monto",
    "importe": "monto",
    "fecha_pago": "fecha_pago",
    "periodo": "periodo_correspondiente",
    "periodo_correspondiente": "periodo_correspondiente",
    "metodo_pago": "metodo_pago",
    "método_pago": "metodo_pago",
    "notas_pago": "notas",
    "nota_pago": "notas",
    "comentarios": "notas",
}

PRINCIPAL_COLUMNS: List[str] = ["email_principal", "nota", "fecha_alta"]
CLIENT_COLUMNS: List[str] = [
    "principal_email",
    "correo_cliente",
    "contrasena_cliente",
    "perfil",
    "nombre_cliente",
    "fecha_registro",
    "fecha_proximo_pago",
    "estatus",
]
PAYMENT_COLUMNS: List[str] = [
    "client_email",
    "monto",
    "fecha_pago",
    "periodo_correspondiente",
    "metodo_pago",
    "notas",
]


def _normalise_label(value: str) -> str:
    value = value.strip().lower().replace(" ", "_")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return value


def _rename_columns(df: pd.DataFrame, mapping: Dict[str, str]) -> pd.DataFrame:
    columns = {}
    for column in df.columns:
        key = _normalise_label(str(column))
        if key in mapping:
            columns[column] = mapping[key]
    return df.rename(columns=columns)


def _drop_empty_rows(df: pd.DataFrame, subset: Iterable[str]) -> pd.DataFrame:
    subset = [col for col in subset if col in df.columns]
    if not subset:
        return df
    return df.dropna(axis=0, how="all", subset=subset)


def _prepare_principals(df: pd.DataFrame) -> pd.DataFrame:
    data = df[[col for col in ("email_principal", "nota", "fecha_alta") if col in df.columns]]
    data = _drop_empty_rows(data, ["email_principal"])
    data = data.drop_duplicates(subset=["email_principal"], keep="first")
    if "fecha_alta" in data.columns:
        data["fecha_alta"] = pd.to_datetime(data["fecha_alta"], errors="coerce")
    return data.reindex(columns=[col for col in PRINCIPAL_COLUMNS if col in data.columns])


def _prepare_clients(df: pd.DataFrame) -> pd.DataFrame:
    required_columns = {
        "email_principal": "principal_email",
        "correo_cliente": "correo_cliente",
        "contrasena_cliente": "contrasena_cliente",
        "perfil": "perfil",
        "nombre_cliente": "nombre_cliente",
        "fecha_registro": "fecha_registro",
        "fecha_proximo_pago": "fecha_proximo_pago",
        "estatus": "estatus",
    }
    data = df[[column for column in required_columns if column in df.columns]].rename(
        columns=required_columns
    )
    data = _drop_empty_rows(data, ["principal_email", "correo_cliente"])
    data = data.drop_duplicates(subset=["correo_cliente"], keep="first")
    if "fecha_registro" in data.columns:
        data["fecha_registro"] = pd.to_datetime(data["fecha_registro"], errors="coerce")
    if "fecha_proximo_pago" in data.columns:
        data["fecha_proximo_pago"] = pd.to_datetime(
            data["fecha_proximo_pago"], errors="coerce"
        ).dt.date
    return data.reindex(columns=[col for col in CLIENT_COLUMNS if col in data.columns])


def _prepare_payments(df: pd.DataFrame) -> pd.DataFrame:
    required_columns = {
        "correo_cliente": "client_email",
        "monto": "monto",
        "fecha_pago": "fecha_pago",
        "periodo_correspondiente": "periodo_correspondiente",
        "metodo_pago": "metodo_pago",
        "notas": "notas",
    }
    columns = [column for column in required_columns if column in df.columns]
    if not columns:
        return pd.DataFrame(columns=PAYMENT_COLUMNS)
    data = df[columns].rename(columns=required_columns)
    data = _drop_empty_rows(data, ["client_email", "monto", "fecha_pago"])
    if "fecha_pago" in data.columns:
        data["fecha_pago"] = pd.to_datetime(data["fecha_pago"], errors="coerce").dt.date
    if "monto" in data.columns:
        data["monto"] = pd.to_numeric(data["monto"], errors="coerce")
    return data.reindex(columns=[col for col in PAYMENT_COLUMNS if col in data.columns])


def normalise_workbook(
    source: Path, *, sheet: str | int = 0, column_mapping: Dict[str, str] | None = None
) -> Dict[str, pd.DataFrame]:
    mapping = DEFAULT_COLUMN_MAPPING.copy()
    if column_mapping:
        mapping.update({
            _normalise_label(key): value for key, value in column_mapping.items()
        })
    raw_df = pd.read_excel(source, sheet_name=sheet)
    renamed = _rename_columns(raw_df, mapping)
    principal_df = _prepare_principals(renamed)
    client_df = _prepare_clients(renamed)
    payment_df = _prepare_payments(renamed)
    return {
        "principal_accounts": principal_df,
        "client_accounts": client_df,
        "payments": payment_df,
    }


def write_workbook(data: Dict[str, pd.DataFrame], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(destination, engine="openpyxl") as writer:
        for sheet_name, dataframe in data.items():
            dataframe.to_excel(writer, sheet_name=sheet_name, index=False)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Normaliza una hoja de cálculo heredada para que coincida con las tablas "
            "principal_accounts, client_accounts y payments."
        )
    )
    parser.add_argument("source", type=Path, help="Ruta del archivo de Excel de origen")
    parser.add_argument(
        "destination",
        type=Path,
        help="Ruta del archivo Excel normalizado que se generará",
    )
    parser.add_argument(
        "--sheet",
        help="Nombre o índice de la hoja a procesar",
        default=0,
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    data = normalise_workbook(args.source, sheet=args.sheet)
    write_workbook(data, args.destination)
    principals = len(data["principal_accounts"])
    clients = len(data["client_accounts"])
    payments = len(data["payments"])
    print(
        "Archivo normalizado creado en", args.destination.as_posix(),
        "- Principales:", principals,
        "Clientes:", clients,
        "Pagos:", payments,
    )


if __name__ == "__main__":
    main()
