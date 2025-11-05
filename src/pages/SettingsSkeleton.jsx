import React from 'react'

export default function SettingsSkeleton() {
  return (
    <div data-testid="settings-skeleton" className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-5 w-48 rounded bg-slate-200" />
        <div className="h-4 w-72 rounded bg-slate-200" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 h-4 w-32 rounded bg-slate-200" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, fieldIndex) => (
                <div key={fieldIndex} className="h-10 rounded bg-slate-200" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
