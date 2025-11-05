import React from 'react'

export default function PaymentsSkeleton() {
  return (
    <div data-testid="payments-skeleton" className="space-y-6 animate-pulse">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="h-5 w-56 rounded bg-slate-200" />
        <div className="mt-3 h-4 w-72 rounded bg-slate-200" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-10 rounded bg-slate-200" />
            ))}
          </div>
          <div className="h-36 rounded bg-slate-200" />
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 h-5 w-48 rounded bg-slate-200" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-12 rounded bg-slate-200" />
          ))}
        </div>
      </div>
    </div>
  )
}
