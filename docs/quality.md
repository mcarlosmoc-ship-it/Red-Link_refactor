# Definición de Hecho (DoD)

- **Pruebas básicas**: ejecuta los linters y el conjunto de pruebas rápidas/unidad antes de pedir revisión. Documenta cualquier excepción.
- **Manejo de errores**: cada flujo principal debe mostrar mensajes claros ante fallos y ofrecer acciones de recuperación o reintento.
- **Accesibilidad mínima**: usa etiquetas descriptivas, mensajes visibles para estados vacíos o de error y controles accesibles con teclado.
- **Tiempos de carga objetivo**: las vistas críticas deben mostrar contenido o esqueleto interactivo en menos de 2 segundos en dispositivos de referencia.

## Checklist para Pull Requests

- [ ] El lint se ejecutó sin errores.
- [ ] Las pruebas rápidas/unitarias relevantes se ejecutaron y pasaron.
- [ ] Se adjuntaron capturas de pantalla o grabaciones cuando hubo cambios visibles en la interfaz.
- [ ] La documentación aplicable (notas o archivos en `docs/`) se actualizó.
