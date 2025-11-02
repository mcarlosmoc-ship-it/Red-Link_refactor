import React from 'react'
import { Card, CardContent } from '../ui/Card.jsx'

export default function StatCard({ title, value, icon, trend, className = '', ...cardProps }) {
  const clickable = typeof cardProps.onClick === 'function'
  const IconComponent = icon

  const renderIcon = () => {
    if (!IconComponent) return null
    if (React.isValidElement(IconComponent)) return IconComponent
    if (typeof IconComponent === 'function') {
      return <IconComponent className="h-6 w-6" />
    }
    return null
  }

  const trendClass = trend && typeof trend === 'string'
    ? trend.trim().startsWith('-')
      ? 'text-red-600'
      : trend.trim().startsWith('+')
        ? 'text-emerald-600'
        : 'text-gray-500'
    : 'text-gray-500'

  return (
    <Card
      {...cardProps}
      className={`transition-shadow duration-200 ${clickable ? 'cursor-pointer hover:shadow-lg' : ''} ${className}`.trim()}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
            {trend && (
              <p className={`mt-2 text-sm font-medium ${trendClass}`}>
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
