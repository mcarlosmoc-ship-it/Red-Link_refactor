# Flujo MVP

## Resumen rápido (4–6 pasos)
1. **Registro o ingreso del usuario.**
2. **Configuración del perfil inicial (datos básicos y preferencias).**
3. **Creación de la primera publicación/contenido.**
4. **Revisión previa y confirmación.**
5. **Publicación y feedback inmediato.**

## Detalle de pasos
| Paso | Entradas clave | Salidas esperadas | Estados de error básicos |
| --- | --- | --- | --- |
| 1. Registro o ingreso | Email/usuario, contraseña o login social | Sesión autenticada, token válido | Credenciales inválidas, bloqueo tras intentos fallidos, error de red/autenticación |
| 2. Configuración del perfil | Nombre y foto opcional, preferencias básicas, consentimiento de términos | Perfil creado/actualizado, preferencias guardadas | Campos requeridos vacíos, formato de imagen inválido, rechazo de términos |
| 3. Creación de la primera publicación | Título, texto/medios, visibilidad | Borrador guardado local o en backend | Validación fallida (sin título/contenido), error de carga de medios, pérdida de sesión |
| 4. Revisión y confirmación | Borrador existente, ajustes finales (etiquetas, visibilidad) | Publicación en cola lista para enviar | Conflicto de versión del borrador, error al aplicar cambios finales |
| 5. Publicación y feedback | Acción de publicar, conexión activa | Publicación visible y confirmación al usuario | Error de red/timeout, duplicidad de envío, falla al escribir en base de datos |

## KPI de éxito
- **Tiempo a la primera publicación:** ≥85% de usuarios nuevos crean y publican su primer contenido en menos de 5 minutos desde el registro.
