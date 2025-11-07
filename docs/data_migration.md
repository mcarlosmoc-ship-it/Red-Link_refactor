# Importación de cuentas desde Excel

Este flujo permite preparar hojas heredadas y migrarlas a las tablas `principal_accounts`,
`client_accounts` y `payments` del backend.

## 1. Normalizar la hoja de cálculo

Utiliza el script `normalize_accounts_excel.py` para transformar la exportación heredada en
un libro con tres pestañas.

```bash
cd backend
python -m backend.app.scripts.normalize_accounts_excel \
  ../datos/original.xlsx \
  ../datos/normalizado.xlsx
```

El archivo generado contendrá las hojas:

- **principal_accounts**: columnas `email_principal`, `nota`, `fecha_alta` (opcional).
- **client_accounts**: columnas `principal_email`, `correo_cliente`, `contrasena_cliente`,
  `perfil`, `nombre_cliente`, `fecha_registro`, `fecha_proximo_pago`, `estatus`.
- **payments**: columnas `client_email`, `monto`, `fecha_pago`, `periodo_correspondiente`,
  `metodo_pago`, `notas`.

> **Nota:** Si la exportación original usa encabezados distintos, el script aplica un mapeo
> flexible (por ejemplo `Correo Principal`, `Contraseña Cliente`, etc.). Si detectas nuevos
> encabezados, puedes ampliar el diccionario de columnas en el propio script.

## 2. Importar a la base de datos

Una vez validado el archivo normalizado, ejecuta el importador:

```bash
cd backend
python -m backend.app.scripts.import_accounts_from_excel \
  ../datos/normalizado.xlsx \
  --database-url "sqlite:///../clients.db"
```

- Usa `--database-url` para apuntar a otra instancia (por ejemplo PostgreSQL en producción).
- El parámetro `--conflict-report` permite indicar dónde guardar los conflictos detectados
  (por defecto `import_conflicts.csv` en el directorio actual).

### Límite de cinco clientes por cuenta principal

Antes de importar, el script comprueba cuántos clientes están asociados a cada correo
principal. Si una cuenta supera los **cinco clientes permitidos**, todos los clientes de esa
cuenta se omiten y se registra un reporte CSV con la lista de correos afectados. Revisa el
archivo, ajusta la asignación y vuelve a ejecutar el proceso.

## 3. Verificación posterior a la migración

Al finalizar la importación el script muestra un resumen y varias muestras aleatorias de
cuentas principales, clientes y pagos. Contrasta estos valores con la información real (por
 ejemplo consultando el panel administrativo) para confirmar que fechas, montos y estados
 coinciden.

Si necesitas revisar más registros, incrementa el valor de `--sample-size`.
