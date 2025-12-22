const normalizePeriodKey = (periodKey) => periodKey ?? 'current'

export const queryKeys = {
  clients: () => ['clients'],
  clientServices: () => ['client-services'],
  servicePlans: () => ['service-plans'],
  principalAccounts: () => ['account-management', 'principal-accounts'],
  clientAccounts: () => ['account-management', 'client-accounts'],
  payments: (periodKey) => ['payments', normalizePeriodKey(periodKey)],
  resellers: () => ['resellers'],
  expenses: () => ['expenses'],
  inventory: () => ['inventory'],
  clientReceipts: ({ clientId, limit = 6 } = {}) => ['client-receipts', clientId ?? 'none', limit],
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
