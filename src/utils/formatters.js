const currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
})

const dateFormatter = new Intl.DateTimeFormat('es-MX')
const periodLabelFormatter = new Intl.DateTimeFormat('es-MX', {
  month: 'long',
  year: 'numeric',
})

export const peso = (value) => currencyFormatter.format(value ?? 0)

export const today = () => dateFormatter.format(new Date())

export const toPeriodKey = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export const parsePeriodKey = (periodKey) => {
  if (typeof periodKey !== 'string') {
    return new Date()
  }

  const [yearPart, monthPart] = periodKey.split('-')
  const year = Number(yearPart)
  const month = Number(monthPart)

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return new Date()
  }

  return new Date(year, Math.min(Math.max(month - 1, 0), 11), 1)
}

export const getCurrentPeriodKey = () => toPeriodKey(new Date())

export const addMonthsToPeriod = (periodKey, months) => {
  const baseDate = parsePeriodKey(periodKey)
  const result = new Date(baseDate.getFullYear(), baseDate.getMonth() + months, 1)
  return toPeriodKey(result)
}

export const diffPeriods = (fromPeriod, toPeriod) => {
  const fromDate = parsePeriodKey(fromPeriod)
  const toDate = parsePeriodKey(toPeriod)

  return (
    (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
    (toDate.getMonth() - fromDate.getMonth())
  )
}

export const periodToIndex = (periodKey) => {
  const date = parsePeriodKey(periodKey)
  return date.getFullYear() * 12 + date.getMonth()
}

export const getPeriodFromDateString = (value) => {
  if (!value) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value.slice(0, 7)
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
    const [, month, year] = value.split('/')
    return `${year}-${String(month).padStart(2, '0')}`
  }

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return null

  const parsed = new Date(timestamp)
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`
}

export const formatPeriodLabel = (periodKey) => {
  const label = periodLabelFormatter.format(parsePeriodKey(periodKey))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export const periodRange = (startPeriod, endPeriod) => {
  const range = []
  let current = startPeriod

  while (diffPeriods(current, endPeriod) >= 0) {
    range.push(current)
    current = addMonthsToPeriod(current, 1)
  }

  return range
}
