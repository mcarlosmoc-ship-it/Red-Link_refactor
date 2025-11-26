import React from 'react'

export default function PageSkeleton() {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="h-6 w-40 rounded bg-slate-200" />
        <div className="h-8 w-24 rounded bg-slate-200" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-24 rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-12 rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
    </div>
  )
}
