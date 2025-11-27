import React, { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { buildApiUrl } from '../../services/apiClient.js'

const REQUIRED_COLUMNS = ['client_type', 'full_name', 'location', 'base_id']
const OPTIONAL_COLUMNS = [
  'external_code',
  'monthly_fee',
  'paid_months_ahead',
  'debt_months',
  'service_status',
]
const SERVICE_REQUIRED_COLUMNS = [
  'service_1_plan_id',
  'service_1_status',
  'service_1_billing_day',
  'service_1_zone_id',
  'service_1_ip_address',
  'service_1_custom_price',
]
const SERVICE_OPTIONAL_COLUMNS = [
  'service_1_antenna_ip',
  'service_1_modem_ip',
  'service_1_antenna_model',
  'service_1_modem_model',
  'service_2_plan_id',
  'service_2_status',
  'service_2_billing_day',
  'service_2_zone_id',
  'service_2_ip_address',
  'service_2_antenna_ip',
  'service_2_modem_ip',
  'service_2_antenna_model',
  'service_2_modem_model',
  'service_2_custom_price',
  'service_3_plan_id',
  'service_3_status',
  'service_3_billing_day',
  'service_3_zone_id',
  'service_3_ip_address',
  'service_3_antenna_ip',
  'service_3_modem_ip',
  'service_3_antenna_model',
  'service_3_modem_model',
  'service_3_custom_price',
]

const templateUrl = buildApiUrl('/clients/import/template')

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

  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null)
      setLocalError('')
    }
  }, [isOpen])

  const handleConfirmSummary = () => {
    if (typeof onConfirmSummary === 'function') {
      onConfirmSummary()
    }
  }

  const columnList = useMemo(
    () => [
      { title: 'Datos del cliente (obligatorias)', items: REQUIRED_COLUMNS },
      { title: 'Datos del cliente (opcionales)', items: OPTIONAL_COLUMNS },
      { title: 'Servicio principal', items: SERVICE_REQUIRED_COLUMNS },
      {
        title: 'Servicios adicionales (repetir service_{n}_...)',
        items: SERVICE_OPTIONAL_COLUMNS,
      },
    ],
    [],
  )

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
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'errores_importacion.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Importar clientes</h2>
            <p className="mt-1 text-sm text-slate-500">
              Descarga la plantilla, actualízala con tus datos y súbela en formato CSV.
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

        <form onSubmit={handleSubmit} className="px-6 py-5">
          <section className="space-y-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-700">Instrucciones rápidas</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>
                  Descarga la{' '}
                  <a
                    href={templateUrl}
                    className="font-semibold text-blue-600 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    plantilla de clientes
                  </a>{' '}
                  y ábrela en Excel o Google Sheets.
                </li>
                <li>Completa las columnas obligatorias y revisa la ortografía de los datos.</li>
                <li>
                  Cada fila debe incluir al menos un servicio usando las columnas <code>service_1_*</code>
                  (plan, estado, día de cobro, base y IP si aplica, equipo y precio personalizado).
                </li>
                <li>
                  Para servicios adicionales repite el bloque <code>service_2_*</code>, <code>service_3_*</code>
                  con sus datos completos.
                </li>
                <li>Exporta el archivo como CSV con codificación UTF-8.</li>
              </ol>
            </div>

            <div className="grid gap-3 rounded-md border border-slate-200 p-4 text-sm text-slate-600 md:grid-cols-2">
              {columnList.map((group) => (
                <div key={group.title}>
                  <p className="font-medium text-slate-700">{group.title}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {group.items.map((column) => (
                      <li key={column} className="text-xs uppercase tracking-wide text-slate-500">
                        {column.replace(/_/g, ' ')}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="client-import-file">
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
        </form>
      </div>
    </div>
  )
}
