# Investigación de usabilidad

## Preguntas de entrevista (5–10)
1. ¿Qué objetivo principal buscas lograr cuando usas Red-Link y cómo sabes que lo conseguiste?
2. ¿Qué tan fácil te resulta encontrar las funciones clave (pagos, transferencias, reportes) en la interfaz actual?
3. ¿En qué momento sientes mayor fricción o dudas durante un flujo típico (por ejemplo, enviar dinero o descargar un comprobante)?
4. ¿Qué información o feedback echas de menos cuando realizas una acción crítica (confirmaciones, estados, alertas)?
5. ¿Cómo describirías tu nivel de confianza al usar Red-Link para transacciones frecuentes y por qué?
6. ¿Qué tan clara te resulta la terminología usada en la aplicación y dónde genera confusión?
7. ¿Qué dispositivo usas con más frecuencia y qué diferencias percibes en la experiencia entre ellos?
8. ¿Qué tan útil encuentras las notificaciones actuales y qué mejorarías?

## Tareas observables (3)
1. Iniciar sesión y localizar el saldo disponible.
2. Realizar una transferencia a un nuevo destinatario y descargar el comprobante.
3. Configurar una alerta o notificación para movimientos mayores a un umbral definido.

## Métricas recolectadas
- Tiempo por tarea (mediana):
  - Tarea 1: 45 s
  - Tarea 2: 2 min 10 s
  - Tarea 3: 1 min 35 s
- Bugs encontrados: 3 (un error en validación de datos del destinatario, un loop al reintentar descarga de comprobante, un tooltip que no se cierra al editar alertas).
- NPS rápido (0–10): 7, con verbatim que menciona facilidad en tareas simples pero fricción en configuraciones avanzadas.

## Hallazgos
- La localización del saldo es rápida, pero los usuarios tardan en notar botones secundarios dentro del flujo de transferencia.
- La creación de nuevos destinatarios requiere validación más clara de campos obligatorios y errores se muestran tarde.
- La descarga de comprobantes funciona, pero algunos usuarios se quedan en pantallas intermedias sin feedback de progreso.
- Configurar alertas no es intuitivo: los límites numéricos no se validan en tiempo real y hay problemas con tooltips persistentes.

## Acciones siguientes
- Priorizar mejoras de visibilidad para botones secundarios y feedback de progreso en flujos críticos.
- Implementar validaciones inline para formularios de destinatarios y umbrales de alertas.
- Revisar y depurar el comportamiento de tooltips para evitar superposiciones persistentes.
- Re-evaluar NPS tras aplicar las correcciones, enfocando entrevistas en los flujos de configuración.
