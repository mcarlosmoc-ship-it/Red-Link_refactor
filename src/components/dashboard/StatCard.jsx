import React from 'react'
import { Card, CardContent } from '../ui/Card.jsx'

export default function StatCard({
  title,
  value,
  icon,
  trend,
  className = '',
  valueClassName = '',
  titleClassName = '',
  trendClassName: trendClassNameProp = '',
  ...cardProps
}) {
  const { onClick, onKeyDown, role, tabIndex, ...restCardProps } = cardProps
  const clickable = typeof onClick === 'function'
  const IconComponent = icon

  const renderIcon = () => {
    if (!IconComponent) return null
    if (React.isValidElement(IconComponent)) return IconComponent
    if (typeof IconComponent === 'function') {
      return <IconComponent className="h-6 w-6" />
    }
    return null
  }

  const trendColorClass =
    trend && typeof trend === 'string'
      ? trend.trim().startsWith('-')
        ? 'text-red-600'
        : trend.trim().startsWith('+')
          ? 'text-emerald-600'
          : 'text-gray-500'
      : 'text-gray-500'

  const combinedTrendClassName = `${trendColorClass} ${trendClassNameProp}`.trim()

  const handleKeyDown = (event) => {
    if (!clickable) {
      onKeyDown?.(event)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick(event)
    }

    onKeyDown?.(event)
  }

  return (
    <Card
      {...restCardProps}
      onClick={onClick}
      onKeyDown={clickable ? handleKeyDown : onKeyDown}
      role={clickable ? role ?? 'button' : role}
      tabIndex={clickable ? tabIndex ?? 0 : tabIndex}
      className={`group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ${clickable ? 'cursor-pointer' : ''} ${className}`.trim()}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-50/0 via-blue-50/0 to-blue-100/40 opacity-0 transition group-hover:opacity-100"
      />
      <CardContent className="relative z-10 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide text-slate-500 ${titleClassName}`.trim()}>{title}</p>
            <p className={`mt-3 text-3xl font-semibold tracking-tight text-slate-900 ${valueClassName}`.trim()}>{value}</p>
            {trend && (
              <p className={`mt-3 text-sm font-semibold ${combinedTrendClassName}`}>
                {trend}
              </p>
            )}
          </div>
          {IconComponent && (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 transition group-hover:bg-blue-500/20 group-hover:text-blue-700">
              {renderIcon()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
