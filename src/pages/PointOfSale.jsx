import React from 'react'

export default function PointOfSalePage() {
  return (
    <div className="space-y-4 p-6">
      <header className="space-y-1">
        <p className="text-sm font-semibold text-slate-500">Módulo de ventas</p>
        <h1 className="text-2xl font-bold text-slate-900">Punto de venta</h1>
      </header>
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-slate-600 shadow-sm">
        <p className="text-sm leading-relaxed">
          El módulo de ventas se ha reiniciado. Aquí podrás construir nuevamente la experiencia de punto de venta desde cero.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Añade tus componentes y flujos personalizados para gestionar tickets, cobros y catálogos según tus necesidades.
        </p>
      </div>
    </div>
  )
}
