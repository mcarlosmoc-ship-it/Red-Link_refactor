# Pendientes del panel operativo (Dashboard + Clientes)

## Dashboard
- **KPIs consolidados y accesos rápidos (validado).** El dashboard ya presenta accesos rápidos hacia adeudos/servicios y mantiene los KPIs consolidados descritos en el alcance. 【F:src/pages/Dashboard.jsx†L1209-L1255】
- **Flujos operativos y consistencia (validado).** El smoke de pagos ahora cubre el endpoint `GET /metrics/consistency/payments` y confirma los logs básicos de `POST /payments` y las actualizaciones en el store. 【F:tests/paymentSmokeFlow.test.js†L15-L105】【F:src/store/useBackofficeStore.js†L1041-L1066】

- **Validaciones según plan (completado).** La asignación/edición valida requisitos de IP, base, equipo y credenciales usando `resolvePlanRequirements`, y el backend rechaza payloads sin equipo o credenciales cuando el plan lo exige. 【F:src/utils/serviceFormValidation.js†L93-L141】【F:src/features/clients/ServicesAssignments.jsx†L14-L196】【F:backend/app/services/client_contracts.py†L17-L93】【F:backend/tests/test_client_services.py†L1-L86】
- **Plantilla y flujo de importación.** El modal ahora descarga mediante `GET /clients/import/template`, mantiene la documentación de 1 fila = 1 servicio y agrega presets de columnas (básico/avanzado/solo servicios). 【F:docs/plan_operativo_clientes.md†L50-L58】【F:src/components/clients/ImportClientsModal.jsx†L62-L166】
- **Vista operativa en la lista (completado).** La tabla muestra plan/estado/base/IP del servicio principal y agrega filtro "con/sin servicio" para acercarse a Wisphub/Splynx. 【F:src/features/clients/ClientsList.jsx†L30-L364】【F:tests/clientsList.test.jsx†L5-L28】
- **Feedback en acciones masivas (completado).** Al ejecutar asignaciones, suspensiones o eliminaciones masivas ahora se muestra un reporte por cliente con éxitos/errores y la selección queda bloqueada mientras corren las mutaciones. 【F:docs/plan_operativo_clientes.md†L65-L68】【F:src/features/clients/ClientsList.jsx†L1-L214】【F:src/pages/Clients.jsx†L401-L576】
