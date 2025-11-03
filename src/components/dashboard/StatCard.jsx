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
      className={`transition-shadow duration-200 ${clickable ? 'cursor-pointer hover:shadow-lg' : ''} ${className}`.trim()}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={`text-sm font-medium text-gray-500 ${titleClassName}`.trim()}>{title}</p>
            <p className={`mt-2 text-3xl font-semibold text-gray-900 ${valueClassName}`.trim()}>{value}</p>
            {trend && (
              <p className={`mt-2 text-sm font-medium ${combinedTrendClassName}`}>
                {trend}
              </p>
            )}
          </div>
          {IconComponent && (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              {renderIcon()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
