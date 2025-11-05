import {
  getCurrentPeriodKey,
  addMonthsToPeriod,
  diffPeriods,
} from '../../utils/formatters.js'
import { PERIOD_HISTORY_MONTHS } from '../constants.js'

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
  const lastUpdate = previous.lastUpdate ?? previous.current ?? actualCurrent
  const monthsSinceUpdate = diffPeriods(lastUpdate, actualCurrent)

  const desiredHistoryStart = addMonthsToPeriod(actualCurrent, -(PERIOD_HISTORY_MONTHS - 1))
  const normalizedHistoryStart =
    diffPeriods(desiredHistoryStart, previous.historyStart ?? desiredHistoryStart) > 0
      ? desiredHistoryStart
      : previous.historyStart ?? desiredHistoryStart

  if (monthsSinceUpdate <= 0) {
    const selected = previous.selected ?? actualCurrent
    const shouldClampSelected = diffPeriods(actualCurrent, selected) > 0

    return {
      ...previous,
      current: actualCurrent,
      lastUpdate,
      historyStart: normalizedHistoryStart,
      selected: shouldClampSelected ? actualCurrent : selected,
    }
  }

  return {
    current: actualCurrent,
    selected: actualCurrent,
    lastUpdate: actualCurrent,
    historyStart: normalizedHistoryStart,
  }
}

export const selectPeriod = (existingPeriods, periodKey) => {
  const periods = existingPeriods ?? createInitialPeriods()
  const start = periods.historyStart
  const end = periods.current

  let next = periodKey ?? periods.selected ?? end

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

  if (diffPeriods(periods.historyStart, periods.selected) <= 0) {
    return periods
  }

  const previous = addMonthsToPeriod(periods.selected, -1)
  const normalizedPrevious =
    diffPeriods(periods.historyStart, previous) > 0 ? previous : periods.historyStart

  return {
    ...periods,
    selected: normalizedPrevious,
  }
}

export const goToNextPeriod = (existingPeriods) => {
  const periods = existingPeriods ?? createInitialPeriods()

  if (diffPeriods(periods.selected, periods.current) <= 0) {
    return periods
  }

  const next = addMonthsToPeriod(periods.selected, 1)
  const normalizedNext = diffPeriods(next, periods.current) < 0 ? periods.current : next

  return {
    ...periods,
    selected: normalizedNext,
  }
}
