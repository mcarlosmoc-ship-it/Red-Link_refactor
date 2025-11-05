const normalizePeriodKey = (periodKey) => periodKey ?? 'current'

export const queryKeys = {
  clients: () => ['clients'],
  payments: (periodKey) => ['payments', normalizePeriodKey(periodKey)],
  resellers: () => ['resellers'],
  expenses: () => ['expenses'],
  inventory: () => ['inventory'],
  metrics: ({ periodKey, statusFilter, searchTerm, currentPeriod }) => [
    'metrics',
    normalizePeriodKey(periodKey),
    statusFilter ?? 'all',
    searchTerm ?? '',
    normalizePeriodKey(currentPeriod),
  ],
}

export default queryKeys
