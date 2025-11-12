import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import Button from '../ui/Button.jsx'

const CATEGORY_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'internet', label: 'Internet' },
  { id: 'streaming', label: 'Streaming' },
  { id: 'other', label: 'Otros' },
]

const resolveCategory = (plan) => {
  const rawCategory =
    plan?.category ?? plan?.serviceType ?? plan?.service_type ?? ''
  if (!rawCategory) {
    return 'other'
  }
  const normalized = String(rawCategory).toLowerCase()
  if (normalized.includes('internet') || normalized.includes('hotspot')) {
    return 'internet'
  }
  if (normalized.includes('stream')) {
    return 'streaming'
  }
  return 'other'
}

export default function AssignExtraServicesModal({
  isOpen,
  onClose,
  onApply,
  servicePlans = [],
  initialSelection = [],
  clientName = 'cliente',
  isProcessing = false,
  excludedPlanIds = [],
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [selectedPlanIds, setSelectedPlanIds] = useState(() => new Set())

  useEffect(() => {
    if (!isOpen) {
      return
    }
    setSearchTerm('')
    setActiveCategory('all')
    setSelectedPlanIds(new Set(initialSelection.map((value) => String(value))))
  }, [initialSelection, isOpen])

  const activePlans = useMemo(
    () =>
      servicePlans.filter(
        (plan) => plan && plan.isActive !== false && plan.is_active !== false,
      ),
    [servicePlans],
  )

  const planLookup = useMemo(() => {
    const map = new Map()
    activePlans.forEach((plan) => {
      map.set(String(plan.id), plan)
    })
    return map
  }, [activePlans])

  const excludedIdsSet = useMemo(() => {
    if (!excludedPlanIds || excludedPlanIds.length === 0) {
      return new Set()
    }
    return new Set(excludedPlanIds.map((value) => String(value)))
  }, [excludedPlanIds])

  const selectedPlans = useMemo(() => {
    return Array.from(selectedPlanIds).map((planId) => {
      const plan = planLookup.get(planId)
      return {
        id: planId,
        name: plan?.name ?? `Plan ${planId}`,
        category: plan ? resolveCategory(plan) : 'other',
        description: plan?.description ?? '',
      }
    })
  }, [planLookup, selectedPlanIds])

  const filteredPlans = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    return activePlans.filter((plan) => {
      const planId = String(plan.id)
      if (selectedPlanIds.has(planId) || excludedIdsSet.has(planId)) {
        return false
      }
      const category = resolveCategory(plan)
      if (activeCategory !== 'all' && category !== activeCategory) {
        return false
      }
      if (!normalizedSearch) {
        return true
      }
      const name = String(plan?.name ?? '').toLowerCase()
      return name.includes(normalizedSearch)
    })
  }, [activePlans, activeCategory, excludedIdsSet, searchTerm, selectedPlanIds])

  const handleRemovePlan = (planId) => {
    setSelectedPlanIds((prev) => {
      const next = new Set(prev)
      next.delete(planId)
      return next
    })
  }

  if (!isOpen) {
    return null
  }

  const handleAddPlan = (planId) => {
    setSelectedPlanIds((prev) => {
      const next = new Set(prev)
      next.add(planId)
      return next
    })
  }

  const handleApply = (event) => {
    event.preventDefault()
    if (isProcessing) {
      return
    }
    const payload = Array.from(selectedPlanIds)
    onApply(payload)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold text-slate-900">
              Servicios adicionales para {clientName}
            </h2>
            <p className="text-xs text-slate-500">
              Selecciona los servicios extra que necesita el cliente.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleApply} className="flex h-full flex-col">
          <div className="space-y-4 border-b border-slate-200 px-4 py-4">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Servicios seleccionados
              </h3>
              {selectedPlans.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Aún no seleccionas servicios para este cliente.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {selectedPlans.map((plan) => (
                    <li key={plan.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs">
                      <span className="font-semibold text-slate-700">{plan.name}</span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-500">
                        {plan.category}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemovePlan(plan.id)}
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Quitar ${plan.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar servicio…"
                className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {CATEGORY_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setActiveCategory(filter.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    activeCategory === filter.id
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4">
            {filteredPlans.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No hay servicios para mostrar con los filtros seleccionados.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filteredPlans.map((plan) => {
                  const planId = String(plan.id)
                  const category = resolveCategory(plan)
                  return (
                    <li key={planId} className="py-3">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => handleAddPlan(planId)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-slate-900">{plan.name}</p>
                          <p className="text-xs text-slate-500 capitalize">{category}</p>
                          {plan.description ? (
                            <p className="text-xs text-slate-400">{plan.description}</p>
                          ) : null}
                        </div>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isProcessing}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isProcessing}>
              {isProcessing ? 'Guardando…' : 'Aplicar cambios'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
