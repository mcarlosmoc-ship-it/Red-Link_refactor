import React from 'react'

function clsx(...xs) {
  return xs.filter(Boolean).join(' ')
}

const VARIANT_CLASSES = {
  primary:
    'bg-blue-600 text-white shadow-sm hover:bg-blue-700 focus-visible:ring-blue-500/40 disabled:bg-blue-400 disabled:text-white',
  secondary:
    'bg-slate-100 text-slate-700 shadow-sm hover:bg-slate-200 focus-visible:ring-slate-400/40 disabled:bg-slate-200 disabled:text-slate-400',
  ghost:
    'bg-transparent text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-400/40 disabled:text-slate-400',
  danger:
    'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-500/40 disabled:bg-red-400 disabled:text-white',
  outline:
    'border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-slate-400 hover:text-slate-800 focus-visible:ring-slate-400/40 disabled:text-slate-400 disabled:border-slate-200',
}

const SIZE_CLASSES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm font-medium',
  lg: 'px-5 py-2.5 text-base font-semibold',
}

export default function Button({ className = '', variant = 'primary', size = 'md', ...props }) {
  const base =
    'inline-flex items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80'
  const variantClasses = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.primary
  const sizeClasses = SIZE_CLASSES[size] ?? SIZE_CLASSES.md

  return <button className={clsx(base, sizeClasses, variantClasses, className)} {...props} />
}
