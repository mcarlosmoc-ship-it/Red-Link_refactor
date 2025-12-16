import React, { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { apiClient } from '../../services/apiClient.js'

const CLIENT_REQUIRED_COLUMNS = [
  { key: 'external_code', label: 'external_code' },
  { key: 'nombre', label: 'nombre' },
  { key: 'direccion', label: 'direccion' },
  { key: 'telefono', label: 'telefono' },
  { key: 'zona', label: 'zona' },
  { key: 'tipo_cliente', label: 'tipo_cliente' },
]

const SERVICE_COLUMNS = [
  { key: 'service_1_plan_id', label: 'service_1_plan_id' },
  { key: 'service_1_status', label: 'service_1_status' },
  { key: 'service_1_billing_day', label: 'service_1_billing_day' },
  { key: 'service_1_zone_id', label: 'service_1_zone_id' },
  { key: 'service_1_ip_address', label: 'service_1_ip_address' },
  { key: 'service_1_custom_price', label: 'service_1_custom_price' },
  { key: 'service_2_plan_id', label: 'service_2_plan_id' },
  { key: 'service_2_status', label: 'service_2_status' },
  { key: 'service_2_billing_day', label: 'service_2_billing_day' },
  { key: 'service_2_zone_id', label: 'service_2_zone_id' },
  { key: 'service_2_ip_address', label: 'service_2_ip_address' },
  { key: 'service_2_custom_price', label: 'service_2_custom_price' },
]

const OPTIONAL_COLUMNS = [
  { key: 'email', label: 'email' },
  { key: 'coordenadas', label: 'coordenadas' },
  { key: 'comentarios', label: 'comentarios' },
  { key: 'paid_months_ahead', label: 'paid_months_ahead (meses adelantados)' },
  { key: 'debt_months', label: 'debt_months (meses adeudados)' },
]

const COLUMN_PRESETS = [
  {
    key: 'basic',
    label: 'Básico',
    description: 'Contacto, coordenadas y notas',
    columns: ['email', 'coordenadas', 'comentarios'],
  },
  {
    key: 'services',
    label: 'Solo servicios',
    description: 'Enfoque en saldos e IPs',
    columns: ['paid_months_ahead', 'debt_months', 'coordenadas'],
  },
  {
    key: 'advanced',
    label: 'Avanzado',
    description: 'Todas las opcionales',
    columns: OPTIONAL_COLUMNS.map((column) => column.key),
  },
]

export default function ImportClientsModal({
  isOpen,
  onClose,
  onSubmit,
  isProcessing,
  summary,
  requiresConfirmation = false,
  onConfirmSummary,
}) {
  const [selectedFile, setSelectedFile] = useState(null)
  const [localError, setLocalError] = useState('')
  const optionalColumns = useMemo(() => OPTIONAL_COLUMNS, [])
  const [selectedColumns, setSelectedColumns] = useState(
    () => new Set(optionalColumns.map((column) => column.key)),
  )
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false)
  const [templateError, setTemplateError] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null)
      setLocalError('')
      setTemplateError('')
    }
  }, [isOpen])

  const handleConfirmSummary = () => {
    if (typeof onConfirmSummary === 'function') {
      onConfirmSummary()
    }
  }

  if (!isOpen) {
    return null
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!selectedFile) {
      setLocalError('Selecciona un archivo CSV para continuar.')
      return
    }
    setLocalError('')
    onSubmit(selectedFile)
  }

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] ?? null
    setSelectedFile(file)
    setLocalError('')
  }

  const handleToggleColumn = (key) => {
    setSelectedColumns((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const handleToggleAll = (checked) => {
    setSelectedColumns(new Set(checked ? optionalColumns.map((column) => column.key) : []))
  }

  const handleDownloadTemplate = async () => {
    setTemplateError('')
    setIsDownloadingTemplate(true)
    try {
      const columns = [
        ...CLIENT_REQUIRED_COLUMNS.map((column) => column.key),
        ...SERVICE_COLUMNS.map((column) => column.key),
        ...Array.from(selectedColumns),
      ]
      const { data } = await apiClient.get('/clients/import/template', {
        params: { columns },
        responseType: 'blob',
      })
        const blob = data instanceof globalThis.Blob ? data : new globalThis.Blob([data])
      const url = globalThis.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'plantilla_clientes.csv'
      link.click()
      globalThis.URL.revokeObjectURL(url)
    } catch (error) {
      setTemplateError(
        error?.message || 'No se pudo descargar la plantilla. Verifica tu sesión e inténtalo de nuevo.',
      )
    } finally {
      setIsDownloadingTemplate(false)
    }
  }

  const allOptionalSelected = selectedColumns.size === optionalColumns.length

  const applyPreset = (columns) => {
    setSelectedColumns(new Set(columns))
  }

  const isSummarySuccess = Boolean(summary && summary.failed_count === 0 && summary.created_count > 0)
  const shouldShowConfirmation = Boolean(requiresConfirmation && summary)
  const rowSummaries = Array.isArray(summary?.row_summaries) ? summary.row_summaries : []

  const handleDownloadErrors = () => {
    if (!summary?.errors?.length) return
    const header = ['row_number', 'message', 'field', 'detail']
    const rows = summary.errors.flatMap((error) => {
      const hasFields = error.field_errors && Object.keys(error.field_errors).length > 0
      if (!hasFields) {
        return [[error.row_number, error.message, '', '']]
      }
      return Object.entries(error.field_errors).map(([field, detail]) => [
        error.row_number,
        error.message,
        field,
        detail,
      ])
    })

      const csv = [header.join(','), ...rows.map((cells) => cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n')
      const blob = new globalThis.Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = globalThis.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'errores_importacion.csv'
    link.click()
      globalThis.URL.revokeObjectURL(url)
    }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
      <div className="flex h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Importar clientes</h2>
            <p className="mt-1 text-sm text-slate-500">
              Descarga la plantilla autenticada, actualízala con tus datos y súbela en formato CSV.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Cerrar"
            disabled={isProcessing}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <section className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <div className="flex flex-col gap-4 lg:flex-row">
                  <div className="space-y-3 lg:w-1/2">
                    <p className="font-medium text-slate-800">Instrucciones rápidas</p>
                    <ol className="list-decimal space-y-2 pl-5 text-slate-600">
                      <li>
                        Descarga la plantilla personalizada desde el botón (usa `GET /clients/import/template` con sesión
                        activa) y ábrela en Excel o Google Sheets.
                      </li>
                      <li>
                        Cada fila puede incluir hasta dos servicios utilizando columnas <code>service_1_*</code> y
                        <code>service_2_*</code>. Si necesitas más servicios, duplica la fila con el mismo cliente.
                      </li>
                      <li>
                        La importación agrupa automáticamente las filas que comparten cliente (por código externo o por
                        nombre y dirección) y creará todos los servicios listados.
                      </li>
                      <li>
                        Las columnas opcionales (contacto, coordenadas, comentarios y meses adelantados/adeudados)
                        puedes mostrarlas u ocultarlas al generar la plantilla.
                      </li>
                      <li>
                        Evita repetir IPs (principal, antena o módem): si la IP ya existe en el sistema o en otra fila del
                        archivo, la importación marcará error.
                      </li>
                      <li>Exporta el archivo como CSV con codificación UTF-8.</li>
                    </ol>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        onClick={handleDownloadTemplate}
                        disabled={isProcessing || isDownloadingTemplate}
                      >
                        {isDownloadingTemplate ? 'Descargando...' : 'Descargar plantilla'}
                      </Button>
                      <p className="text-xs text-slate-500">La descarga requiere sesión activa.</p>
                    </div>
                    {templateError && (
                      <p className="text-xs font-medium text-red-600">{templateError}</p>
                    )}
                  </div>

                  <div className="lg:w-1/2 rounded-md border border-slate-200 bg-white/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-800">
                        Columnas opcionales para la plantilla
                      </p>
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={allOptionalSelected}
                          onChange={(event) => handleToggleAll(event.target.checked)}
                        />
                        Seleccionar todas
                      </label>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {COLUMN_PRESETS.map((preset) => (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() => applyPreset(preset.columns)}
                          className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                          <span>{preset.label}</span>
                          <span className="text-[11px] font-normal text-slate-500">{preset.description}</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 space-y-3 text-sm text-slate-700">
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {optionalColumns.map((column) => (
                          <label key={column.key} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              checked={selectedColumns.has(column.key)}
                              onChange={() => handleToggleColumn(column.key)}
                            />
                            <span>{column.label}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500">
                        Usa valores decimales positivos para los meses adelantados o adeudados, igual que en Wisphub.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-700">
                <p className="font-medium text-slate-800">Columnas fijas de la plantilla</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Datos del cliente</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {CLIENT_REQUIRED_COLUMNS.map((column) => (
                        <span
                          key={column.key}
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700"
                        >
                          {column.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Datos de servicios</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {SERVICE_COLUMNS.map((column) => (
                        <span
                          key={column.key}
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700"
                        >
                          {column.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Usa la columna <code>service_1_plan_id</code> (u opciones similares) para cada servicio del cliente. Si el plan
                  requiere IP/base, completa <code>service_*_ip_address</code> y <code>service_*_zone_id</code>.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-800" htmlFor="client-import-file">
                  Archivo CSV
                </label>
                <input
                  id="client-import-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  disabled={isProcessing}
                />
                {selectedFile && (
                  <p className="text-xs text-slate-500">Archivo seleccionado: {selectedFile.name}</p>
                )}
                {localError && <p className="text-xs font-medium text-red-600">{localError}</p>}
              </div>

              {summary && (
                <div
                  className={`rounded-md border p-4 text-sm ${
                    isSummarySuccess
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-amber-200 bg-amber-50 text-amber-900'
                  }`}
                >
                  <p className="font-semibold">
                    {isSummarySuccess
                      ? 'Importación completada'
                      : 'Importación procesada con observaciones'}
                  </p>
                  <ul className="mt-2 space-y-1">
                    <li>Total de filas procesadas: {summary.total_rows}</li>
                    <li>Clientes creados: {summary.created_count}</li>
                    <li>Servicios creados: {summary.service_created_count ?? 0}</li>
                    <li>Filas con errores: {summary.failed_count}</li>
                  </ul>

                  {rowSummaries.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-medium">Detalle por fila</p>
                      <div className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white/70">
                        {rowSummaries.map((row) => (
                          <div key={`${row.row_number}-${row.status}`} className="p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold">
                                Fila {row.row_number}
                                {row.client_name ? ` • ${row.client_name}` : ''}
                              </p>
                              <span
                                className={`text-xs font-semibold uppercase tracking-wide ${
                                  row.status === 'created'
                                    ? 'text-emerald-700'
                                    : 'text-amber-700'
                                }`}
                              >
                                {row.status === 'created' ? 'creada' : 'con error'}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-slate-700">
                              Servicios creados: {row.services_created}
                            </p>
                            {row.error_message && (
                              <p className="mt-1 text-xs text-amber-800">Error: {row.error_message}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(summary.errors) && summary.errors.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">Detalles de errores</p>
                        <Button type="button" variant="ghost" onClick={handleDownloadErrors}>
                          Descargar CSV
                        </Button>
                      </div>
                      <ul className="space-y-2">
                        {summary.errors.map((error) => (
                          <li key={error.row_number} className="rounded border border-amber-200 bg-white/70 p-3 text-amber-900">
                            <p className="text-sm font-semibold">Fila {error.row_number}</p>
                            <p className="mt-1 text-sm">{error.message}</p>
                            {error.field_errors && Object.keys(error.field_errors).length > 0 && (
                              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                                {Object.entries(error.field_errors).map(([field, message]) => (
                                  <li key={field}>
                                    <span className="font-medium">{field}:</span> {message}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {shouldShowConfirmation && (
                <div className="mt-4 space-y-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div>
                    <p className="font-semibold">¿Deseas continuar con la importación?</p>
                    <p className="mt-1">
                      Se detectaron observaciones en el archivo. Puedes revisar y volver a importar un CSV
                      corregido o confirmar para regresar al panel con los clientes válidos.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <Button type="button" variant="ghost" onClick={onClose}>
                      Revisar nuevamente
                    </Button>
                    <Button type="button" onClick={handleConfirmSummary}>
                      Continuar
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </div>

          <div className="sticky bottom-0 border-t border-slate-200 bg-white px-6 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
              <Button type="button" variant="ghost" onClick={onClose} disabled={isProcessing}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isProcessing}>
                {isProcessing
                  ? 'Importando...'
                  : summary
                    ? 'Importar de nuevo'
                    : 'Importar clientes'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
