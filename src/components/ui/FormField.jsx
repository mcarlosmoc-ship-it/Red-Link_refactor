import React from 'react'
import InfoTooltip from './InfoTooltip.jsx'

function clsx(...classes) {
  return classes.filter(Boolean).join(' ')
}

const STATUS_CLASSES = {
  default:
    'border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-200/70 text-slate-800 bg-white',
  success:
    'border-emerald-400 bg-emerald-50 text-emerald-900 focus:border-emerald-500 focus:ring-emerald-200/70',
  error:
    'border-red-400 bg-red-50/80 text-red-900 focus:border-red-500 focus:ring-red-200/80',
  disabled:
    'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed focus:border-slate-200 focus:ring-slate-200',
}

const MESSAGE_COLORS = {
  default: 'text-slate-500',
  success: 'text-emerald-700',
  error: 'text-red-700',
  disabled: 'text-slate-500',
}

export default function FormField({
  label,
  htmlFor,
  tooltip,
  message,
  status = 'default',
  className = '',
  children,
}) {
  const tone = STATUS_CLASSES[status] ?? STATUS_CLASSES.default
  const messageTone = MESSAGE_COLORS[status] ?? MESSAGE_COLORS.default

  return (
    <label className={clsx('grid gap-1 text-xs font-semibold text-slate-700', className)} htmlFor={htmlFor}>
      <span className="flex items-center gap-2 text-slate-800">
        <span>{label}</span>
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
      {React.cloneElement(children, {
        id: htmlFor,
        className: clsx(
          'rounded-md border px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-offset-1',
          tone,
          children.props.className,
        ),
        'aria-invalid': status === 'error' ? 'true' : undefined,
        disabled: status === 'disabled' ? true : children.props.disabled,
      })}
      {message && <span className={clsx('text-xs', messageTone)}>{message}</span>}
    </label>
  )
}
