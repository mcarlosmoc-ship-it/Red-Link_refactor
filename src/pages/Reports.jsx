import React from 'react'
import FinancialSummary from '../components/reports/FinancialSummary.jsx'

export default function ReportsPage() {
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
