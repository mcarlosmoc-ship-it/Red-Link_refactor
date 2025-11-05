import React from 'react'
import FinancialSummary from '../components/reports/FinancialSummary.jsx'
import { useBackofficeStore } from '../store/useBackofficeStore.js'
import { useBackofficeRefresh } from '../contexts/BackofficeRefreshContext.jsx'
import ReportsSkeleton from './ReportsSkeleton.jsx'

export default function ReportsPage() {
  const initializeStatus = useBackofficeStore((state) => state.status.initialize)
  const { isRefreshing } = useBackofficeRefresh()
  const shouldShowSkeleton = Boolean(initializeStatus?.isLoading) || isRefreshing

  if (shouldShowSkeleton) {
    return <ReportsSkeleton />
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="reports-heading" className="space-y-4">
        <div>
          <h2 id="reports-heading" className="text-lg font-semibold text-slate-900">
            Reportes
          </h2>
          <p className="text-sm text-slate-500">
            Analiza el rendimiento financiero para tomar decisiones informadas.
          </p>
        </div>

        <FinancialSummary />
      </section>
    </div>
  )
}
