const normalizePeriodKey = (periodKey) => periodKey ?? 'current'

export const queryKeys = {
  clients: () => ['clients'],
  clientServices: () => ['client-services'],
  principalAccounts: () => ['principal-accounts'],
  clientAccounts: () => ['client-accounts'],
  payments: (periodKey) => ['payments', normalizePeriodKey(periodKey)],
  resellers: () => ['resellers'],
  expenses: () => ['expenses'],
  inventory: () => ['inventory'],
  posProducts: ({ includeInactive = false } = {}) => [
    'pos',
    'products',
    includeInactive ? 'all' : 'active',
  ],
  posSales: ({ limit = 10 } = {}) => ['pos', 'sales', limit],
  metrics: ({ periodKey, statusFilter, searchTerm, currentPeriod }) => [
    'metrics',
    normalizePeriodKey(periodKey),
    statusFilter ?? 'all',
    searchTerm ?? '',
    normalizePeriodKey(currentPeriod),
  ],
}

export default queryKeys
