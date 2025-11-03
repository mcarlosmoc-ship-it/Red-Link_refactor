const PERIOD_KEY_PATTERN = /^\d{4}-\d{2}$/

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

export const today = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const formatDate = (value) => {
  if (!value) return ''

  const candidate = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(candidate.getTime())) return ''

  return dateFormatter.format(candidate)
}

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

const isValidPeriodKey = (value) => {
  if (typeof value !== 'string' || !PERIOD_KEY_PATTERN.test(value)) {
    return false
  }

  const month = Number.parseInt(value.slice(5), 10)
  return month >= 1 && month <= 12
}

const addMonthCandidate = (container, year, month) => {
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return
  }

  const monthKey = String(month).padStart(2, '0')
  const periodKey = `${year}-${monthKey}`

  if (!container.includes(periodKey)) {
    container.push(periodKey)
  }
}

const normalizeSlashDateParts = (value) => {
  const [first, second, year] = value.split('/')
  const firstNumber = Number.parseInt(first, 10)
  const secondNumber = Number.parseInt(second, 10)
  const yearNumber = Number.parseInt(year, 10)

  if (
    !Number.isFinite(firstNumber) ||
    !Number.isFinite(secondNumber) ||
    !Number.isFinite(yearNumber)
  ) {
    return null
  }

  return { dayCandidate: firstNumber, monthCandidate: secondNumber, year: yearNumber }
}

const isValidDateComposition = (year, month, day) => {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return false
  }

  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  )
}

export const getPeriodFromDateString = (value) => {
  if (!value) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value.slice(0, 7)
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
    const normalized = normalizeSlashDateParts(value)

    if (!normalized) {
      return null
    }

    const { dayCandidate, monthCandidate, year } = normalized
    const candidates = []

    if (isValidDateComposition(year, monthCandidate, dayCandidate)) {
      addMonthCandidate(candidates, year, monthCandidate)
    }

    if (isValidDateComposition(year, dayCandidate, monthCandidate)) {
      addMonthCandidate(candidates, year, dayCandidate)
    }

    if (candidates.length === 1) {
      return candidates[0]
    }

    if (candidates.length > 1) {
      return candidates
    }
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
  if (!isValidPeriodKey(startPeriod) || !isValidPeriodKey(endPeriod)) {
    return []
  }

  if (diffPeriods(startPeriod, endPeriod) < 0) {
    return []
  }

  const range = []
  let current = startPeriod

  while (true) {
    range.push(current)

    if (current === endPeriod) {
      break
    }

    const next = addMonthsToPeriod(current, 1)

    if (next === current) {
      break
    }

    current = next
  }

  return range
}
