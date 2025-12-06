import {
  getCurrentPeriodKey,
  addMonthsToPeriod,
  diffPeriods,
  parsePeriodKey,
} from '../../utils/formatters.js'
import { PERIOD_HISTORY_MONTHS } from '../constants.js'

const isValidPeriod = (periodKey) => Boolean(parsePeriodKey(periodKey))
const withFallback = (candidate, fallback) => (isValidPeriod(candidate) ? candidate : fallback)

export const createInitialPeriods = () => {
  const current = getCurrentPeriodKey()
  return {
    current,
    selected: current,
    lastUpdate: current,
    historyStart: addMonthsToPeriod(current, -(PERIOD_HISTORY_MONTHS - 1)),
  }
}

export const syncPeriods = (existingPeriods) => {
  const previous = existingPeriods ?? createInitialPeriods()
  const actualCurrent = getCurrentPeriodKey()
  const current = withFallback(previous.current, actualCurrent)
  const lastUpdate = withFallback(previous.lastUpdate, current)
  const monthsSinceUpdate = diffPeriods(lastUpdate, actualCurrent)

  const desiredHistoryStart =
    addMonthsToPeriod(actualCurrent, -(PERIOD_HISTORY_MONTHS - 1)) ?? actualCurrent
  const previousHistoryStart = withFallback(previous.historyStart, desiredHistoryStart)
  const normalizedHistoryStart = previousHistoryStart
    ? diffPeriods(desiredHistoryStart, previousHistoryStart) > 0
      ? desiredHistoryStart
      : previousHistoryStart
    : desiredHistoryStart

  if (monthsSinceUpdate <= 0) {
    const selected = withFallback(previous.selected, actualCurrent)
    const shouldClampSelected = diffPeriods(actualCurrent, selected) > 0

    return {
      ...previous,
      current,
      lastUpdate,
      historyStart: normalizedHistoryStart,
      selected: shouldClampSelected ? actualCurrent : selected,
    }
  }

  return {
    current,
    selected: actualCurrent,
    lastUpdate: actualCurrent,
    historyStart: normalizedHistoryStart,
  }
}

export const selectPeriod = (existingPeriods, periodKey) => {
  const periods = existingPeriods ?? createInitialPeriods()
  const start = withFallback(periods.historyStart, getCurrentPeriodKey())
  const end = withFallback(periods.current, start)

  let next = withFallback(periodKey, null) ?? withFallback(periods.selected, end)

  if (diffPeriods(start, next) < 0) {
    next = start
  }

  if (diffPeriods(next, end) < 0) {
    next = end
  }

  return {
    ...periods,
    selected: next,
  }
}

export const goToPreviousPeriod = (existingPeriods) => {
  const periods = existingPeriods ?? createInitialPeriods()
  const selected = withFallback(periods.selected, periods.current)
  const historyStart = withFallback(periods.historyStart, periods.current)

  if (!selected || !historyStart) {
    return periods
  }

  if (diffPeriods(historyStart, selected) <= 0) {
    return periods
  }

  const previous = addMonthsToPeriod(selected, -1)
  const normalizedPrevious =
    previous && diffPeriods(historyStart, previous) > 0 ? previous : historyStart

  return {
    ...periods,
    selected: normalizedPrevious,
  }
}

export const goToNextPeriod = (existingPeriods) => {
  const periods = existingPeriods ?? createInitialPeriods()
  const selected = withFallback(periods.selected, periods.current)
  const current = withFallback(periods.current, selected)

  if (!selected || !current) {
    return periods
  }

  if (diffPeriods(selected, current) <= 0) {
    return periods
  }

  const next = addMonthsToPeriod(selected, 1)
  const normalizedNext = next && diffPeriods(next, current) < 0 ? current : next

  return {
    ...periods,
    selected: normalizedNext,
  }
}
