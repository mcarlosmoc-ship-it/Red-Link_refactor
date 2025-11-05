import React from 'react'

export default function ClientsSkeleton() {
  return (
    <div data-testid="clients-skeleton" className="space-y-6 animate-pulse">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-5 w-48 rounded bg-slate-200" />
          <div className="h-4 w-64 rounded bg-slate-200" />
        </div>
        <div className="h-10 w-40 rounded-full bg-slate-200" />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-10 w-40 rounded bg-slate-200" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-14 rounded bg-slate-200" />
          ))}
        </div>
      </div>
    </div>
  )
}
