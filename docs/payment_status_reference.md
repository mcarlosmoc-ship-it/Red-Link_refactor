# Lógica unificada de estados de pago

## Definiciones funcionales
- **Pendiente (`pending`)**: el cliente tiene deuda generada (monto adeudado > 0 o meses de deuda > 0); aplica siempre que la mensualidad efectiva sea mayor que 0.
- **Vencimiento pronto (`due_soon`)**: sin deuda actual, pero la cobertura/prepago es menor a 1 mes por adelantado (umbral configurable en `DUE_SOON_THRESHOLD_MONTHS`).
- **Pagado (`paid`)**: sin deuda y con al menos 1 mes de cobertura/prepago; también incluye casos de cortesía (tarifa efectiva = 0).

## Ejemplo de coincidencia entre resumen y tabla
- **Cliente Ana**
  - Mensualidad efectiva: $500.
  - Deuda: 1 mes pendiente (sin pagos registrados para el periodo actual).
  - Resultado: `pending`.
  - Efecto:
    - El resumen del tablero incrementa "Pendientes" en +1 y suma $500 a "Monto adeudado".
    - La tabla de Adeudos y Pagos muestra a Ana con saldo $500 y estado Pendiente.

## Caso extremo (pago adelantado)
- **Cliente Bruno**
  - Mensualidad efectiva: $600.
  - Deuda: 0 meses, $0 adeudado.
  - Pago adelantado: 2 meses (`paidMonthsAhead = 2`).
  - Resultado: `paid` (no aparece en Pendientes ni en Por vencer; queda al día porque supera el umbral de 1 mes).
