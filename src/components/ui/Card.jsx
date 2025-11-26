import React from 'react'

function clsx(...xs) {
  return xs.filter(Boolean).join(' ')
}

export function Card({ className = '', ...props }) {
  return <div className={clsx('bg-white rounded-lg shadow', className)} {...props} />
}

export function CardContent({ className = '', ...props }) {
  return <div className={clsx('p-4', className)} {...props} />
}

export function CardHeader({ className = '', ...props }) {
  return <div className={clsx('p-4 pb-0', className)} {...props} />
}

export function CardTitle({ className = '', ...props }) {
  return <h3 className={clsx('text-lg font-semibold leading-tight', className)} {...props} />
}

export function CardDescription({ className = '', ...props }) {
  return <p className={clsx('text-sm text-slate-600', className)} {...props} />
}
