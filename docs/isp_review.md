# Revisión del módulo ISP (Clientes, Servicios e Importación)

## Estado actual

- **Modelo de clientes**: `Client` guarda tipo, nombre, dirección, zona/base, códigos externos y estados de servicio, con relaciones a servicios, pagos y contactos. Usa zonas como alias de base (`base_id`).
- **Modelo de servicios**: `ClientService` enlaza plan y cliente, incluye estado operativo, día de corte, zona/base opcional, IPs (principal/antena/módem), equipo, notas y metadatos. Expone `effective_price` combinando precio del plan y personalizado.
- **Planes y categorías**: `ServicePlan` cubre categorías (internet/streaming/hotspot/POS), precios, requisitos de IP/base y límite de capacidad, además de estado activo/inactivo.
- **Agrupación multi-servicio**: la importación agrupa filas por `external_code` o por `nombre + dirección`, valida que los datos del cliente sean coherentes entre filas y crea varios `ClientService` bajo el mismo cliente.
- **Validación de IPs**: durante la importación se recopilan IPs existentes y se reservan por fila para evitar duplicados entre archivo y base de datos; se rechazan repeticiones en cualquier campo de IP.
- **Plantilla de importación**: el backend genera CSV con columnas fijas en orden predefinido y filas de ejemplo; permite ocultar columnas opcionales (email, coordenadas, comentarios) y alinea alias en español/inglés.
- **Importación masiva**: el backend exige columnas obligatorias de cliente y servicio, normaliza encabezados, verifica zonas, planes activos, decimalidad, IP únicas y combina filas en clientes; devuelve resumen por fila y acumulados.
- **UI de importación**: el modal actual descarga plantilla autenticada (POST a `/clients/import/template`), permite marcar columnas opcionales, incluye instrucciones, scroll interno, footer fijo, resumen de resultados y descarga de CSV de errores.

## Oportunidades de mejora

- **Estandarizar plantilla**: mover la descarga a un endpoint GET con `responseType: 'blob'`, eliminar campos duplicados en el frontend (service_*) y exponer solo columnas críticas por defecto para reducir ruido.
- **Modelo 1 fila = 1 servicio**: ya aplicado en backend y UI, pero puede reforzarse documentando en la plantilla y validando que no existan columnas dinámicas; rechazar encabezados desconocidos o que sugieran `service_1`, `service_2`.
- **Validaciones de referencia**: endurecer controles cuando un plan requiere IP/base (rechazar faltantes en importación y en altas manuales), y agregar verificación de capacidad antes de consolidar lotes.
- **Experiencia de importación**: simplificar bloques de columnas en el modal (mostrar solo esenciales, ocultar opciones avanzadas bajo acordeón), preservar selección de columnas vía preferencia de usuario y mostrar progreso por etapas (validación ↔ creación).
- **Panel operativo**: incluir en la lista de clientes una vista compacta del servicio principal (plan, estado, IP) y filtros por zona/base/plan/estado del servicio para alinearlo con soluciones como Splynx o WispHub.
- **Plantilla descargable**: ofrecer presets de columnas (básico/avanzado/solo servicios) y traducciones; incluir leyendas de ejemplos alineadas a validaciones (formato de IP, días de corte 1–31, estados permitidos).
- **Gestión de errores**: enriquecer el CSV de errores con códigos de fallo y sugerencias; en UI, resaltar filas con IP duplicada o plan inexistente con badges diferenciados.

## Propuestas de implementación

- **Backend importación**
  - Ajustar endpoint de plantilla a `GET /clients/import/template` con autenticación y query `columns` para permitir descarga directa.
  - Validar lista blanca de columnas y rechazar cualquier encabezado `service_\d+` o no mapeado; mantener alias multilenguaje.
  - Reforzar validación de requisitos del plan (IP/base/capacidad) antes de crear cada servicio en el importador.
  - Conservar agrupación por `external_code` o `nombre+dirección`, manteniendo una única fila por servicio.
- **Frontend modal**
  - Contenedor con scroll y footer fijo (ya presente); refinar diseño para mostrar columnas esenciales por defecto y mover avanzadas a acordeón.
  - Usar `GET` autenticado para descargar la plantilla y permitir presets de columnas (básico/avanzado/personalizado).
  - Mantener resumen por fila y descarga de errores; añadir indicadores de progreso y botones siempre visibles.
- **Plantilla estándar**
  - Columnas fijas: código externo, nombre, dirección, teléfono, zona/base, tipo de cliente, plan, precio personalizado, día de corte, estado del servicio, IP principal/antena/módem, modelo de router/equipo.
  - Opcionales: email, coordenadas, comentarios, metadatos específicos por tipo de servicio.
  - Ejemplos con múltiples servicios del mismo cliente en filas separadas.
- **Modelo modular futuro (ISP + Cyber + Tienda)**
  - **Base única**: mantener una sola BD compartiendo tabla `clients` y catálogos comunes (zonas, planes, usuarios), con módulos aislados por prefijo de tablas y permisos.
  - **ISP**: actual `client_services` + `service_plans`, reforzando categorías para internet/streaming/hotspot y métricas de capacidad.
  - **Cyber**: tabla `cyber_sessions` vinculada a `clients` y opcionalmente a `service_plans` tipo token; registrar tiempo, equipo, consumo y tarifas.
  - **Ventas/POS**: tablas `pos_products`, `pos_orders`, `pos_order_items`, `pos_payments` reutilizando `clients` como compradores; integrar inventario existente.
  - **Integración**: capa de dominio por módulo, servicios y routers separados en backend (FastAPI routers por prefijo), y frontend con rutas/estados por feature para evitar acoplamiento.

## Cambios rápidos vs. refactor

- **Cambios fáciles**: convertir plantilla a GET con descarga de blob, ocultar columnas opcionales por defecto en el modal, añadir presets y badges en el resumen de errores, mejorar textos de plantilla.
- **Requieren refactor**: validación estricta de columnas (lista blanca con rechazo de dinámicas), centralizar reglas de requisitos de plan/IP/base en un servicio compartido para importación y altas manuales, y preparar módulos adicionales con prefijos de tabla y routers dedicados.
- **Listo/adecuado**: agrupación por cliente en importación, validación de unicidad de IPs, modelo 1 fila = 1 servicio y UI con scroll + footer fijo ya cumplen con el estándar base.
