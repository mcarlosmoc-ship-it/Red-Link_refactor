import React from 'react'

export default function ReportsSkeleton() {
  return (
    <div data-testid="reports-skeleton" className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-5 w-48 rounded bg-slate-200" />
        <div className="h-4 w-64 rounded bg-slate-200" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 h-4 w-40 rounded bg-slate-200" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, itemIndex) => (
                <div key={itemIndex} className="h-10 rounded bg-slate-200" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
