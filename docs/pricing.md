# Planes y política de upgrades/downgrades

## Plan gratuito: Starter
- **Sitios incluidos:** Hasta 1 sitio activo.
- **Límite de vistas/mes:** 5,000 vistas mensuales acumuladas entre todos los sitios.
- **Integraciones soportadas:** 1 integración activa (por ejemplo, Google Analytics **o** un webhook básico).
- **Soporte:** Autogestión con base de conocimiento y respuestas asíncronas.

## Plan de pago: Pro (suscripción mensual)
- **Sitios incluidos:** Hasta 5 sitios activos con administración independiente.
- **Límite de vistas/mes:** 250,000 vistas mensuales con alertas preventivas al 80% y 90% de uso.
- **Integraciones soportadas:** Hasta 5 integraciones activas (mix entre Analytics, webhooks avanzados y CRM/ERP conectores estándar).
- **Ventajas adicionales:**
  - SLA de soporte con respuesta prioritaria (horario laboral, <12h).
  - Backups diarios con retención de 30 días y restauración bajo demanda.
  - Segmentación avanzada de audiencias y reglas de automatización en la plataforma.

## Lógica de upgrades y downgrades
- **Upgrade (Starter → Pro):**
  - Se activa inmediatamente al confirmar el pago.
  - El límite de vistas se recalcula de forma proporcional para el periodo de facturación actual (prorrateo) o se reinicia si el ciclo arranca con el upgrade.
  - Integraciones existentes se mantienen; el usuario puede activar integraciones adicionales hasta el tope del plan Pro.
- **Downgrade (Pro → Starter):**
  - Se programa para el final del ciclo de facturación vigente; no hay reembolsos de periodos ya consumidos.
  - Antes de la fecha efectiva, el sistema solicita al usuario elegir qué sitios e integraciones se conservarán para cumplir los límites de Starter.
  - Si al aplicar el cambio se exceden los límites (sitios, vistas proyectadas o integraciones), se bloquea la creación de nuevos recursos y se pausan integraciones sobrantes hasta que el usuario ajuste manualmente.
- **Sobreconsumos y avisos:**
  - En Starter, al superar el 100% de vistas se suspende la captura de datos y se invita a upgrade inmediato.
  - En Pro, se envían avisos al 80% y 90% del consumo; superar el 100% activa un recargo por tramo o la opción de subir de plan, según política comercial vigente.

## Ejemplos de transición
- Un workspace con 3 sitios en Pro que agenda un downgrade debe seleccionar 1 sitio para conservar; los otros 2 se archivan al aplicar el cambio.
- Un workspace en Starter que realiza upgrade a mitad de ciclo obtiene los límites de Pro desde el momento del pago; las alertas de consumo se recalculan con base en los nuevos topes.
