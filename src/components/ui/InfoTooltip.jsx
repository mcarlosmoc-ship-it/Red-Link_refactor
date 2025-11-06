import React, { useId, useMemo, useState } from 'react'
import { Info } from 'lucide-react'

function clsx(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function InfoTooltip({ text, className = '', iconClassName = '' }) {
  const tooltipId = useId()
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const isVisible = isHovered || isFocused

  const tooltipPlacementClass = useMemo(
    () =>
      'top-full mt-2 left-1/2 -translate-x-1/2 sm:left-auto sm:-translate-x-0 sm:right-0 sm:top-full sm:mt-2',
    [],
  )

  return (
    <span className={clsx('relative inline-flex', className)}>
      <button
        type="button"
        aria-describedby={tooltipId}
        className={clsx(
          'inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition',
          'hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2',
          iconClassName,
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onTouchStart={() => setIsFocused((prev) => !prev)}
      >
        <Info aria-hidden="true" className="h-3.5 w-3.5" />
        <span className="sr-only">Mostrar ayuda</span>
      </button>
      <span
        role="tooltip"
        id={tooltipId}
        aria-hidden={isVisible ? 'false' : 'true'}
        className={clsx(
          'pointer-events-none absolute z-20 w-60 max-w-xs rounded-md border border-slate-200 bg-slate-900/95 px-3 py-2 text-left text-xs font-medium text-white shadow-lg transition-opacity duration-150',
          tooltipPlacementClass,
          isVisible ? 'opacity-100' : 'opacity-0'
        )}
      >
        {text}
      </span>
    </span>
  )
}
