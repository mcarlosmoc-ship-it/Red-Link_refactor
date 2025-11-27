# Roadmap

## Features candidatos con impacto y esfuerzo estimados

| Feature candidato | Impacto esperado | Esfuerzo estimado |
| --- | --- | --- |
| Editor visual para bloques y enlaces con vista previa | Alto | Medio-Alto |
| Plantilla inicial de landing responsiva (hero, CTA, footer) | Medio | Bajo |
| Métricas de clics y conversiones con agregación diaria | Alto | Medio |
| Gestión de contenidos versión simple (draft/publish, duplicar página) | Medio-Alto | Medio |
| Integración de formularios con envío a API/Correo | Medio | Medio |
| Roles básicos (admin/editor) con control de acceso por sección | Medio | Medio-Alto |
| Exportación/backup de contenido en JSON | Medio | Bajo |
| Automatización de despliegue a entorno de staging | Medio-Alto | Medio |

## Entregables priorizados (3–5)

1. Editor visual básico para construir páginas de enlaces (bloques, vista previa y guardado).
2. Plantilla inicial de landing responsiva con secciones reutilizables.
3. Métricas de clics y conversiones con panel de insights.
4. Gestión simple de contenidos (draft/publish, duplicar página).
5. Automatización de despliegue a entorno de staging.

## Plan de hitos semanales con criterios de "listo" (DoD)

### Semana 1 — Editor visual básico
- Alcance: creación/edición de bloques (texto, botón, enlace), vista previa en vivo y guardado de la página.
- DoD:
  - UI permite agregar/editar/eliminar bloques sin errores JS/console.
  - Contenido se persiste en backend o storage mock con recarga correcta.
  - Pruebas manuales cubren flujo de creación y guardado; se registran en checklist.

### Semana 2 — Plantilla inicial de landing responsiva
- Alcance: hero, sección de beneficios, llamada a la acción y footer adaptables a móvil/escritorio.
- DoD:
  - Plantilla en librería de componentes reutilizable y documentada.
  - Puntos de quiebre validados en viewport móvil (375px) y desktop (1440px).
  - Lighthouse local con performance y accesibilidad ≥90 en la landing.

### Semana 3 — Métricas de clics y conversiones
- Alcance: captura de clics en enlaces, agregación diaria y panel con gráficos simples.
- DoD:
  - Eventos se envían a endpoint y se almacenan con timestamp y URL.
  - Panel muestra totales diarios y CTR por enlace; datos se actualizan al recargar.
  - Pruebas unitarias para normalización/agregación de datos con cobertura ≥80% en módulo de métricas.

### Semana 4 — Gestión simple de contenidos
- Alcance: estados draft/publish, duplicar página y listado filtrable por estado.
- DoD:
  - Cambio de estado actualiza UI y persiste en base/archivo.
  - Duplicar página copia bloques y metadatos, asignando nuevo ID.
  - E2E básico cubre crear → publicar → duplicar → filtrar.

### Semana 5 — Automatización de despliegue a staging
- Alcance: pipeline CI para build, tests y despliegue automático a entorno de staging.
- DoD:
  - Workflow CI/CD corre build + tests en cada PR y despliega en main.
  - Variables/secrets documentadas y cargadas en entorno seguro.
  - Deploy genera URL accesible y se registra en artefacto/log del pipeline.
