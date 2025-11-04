export const CLIENT_IP_RANGES = {
  residential: {
    1: { prefix: '192.168.3.', start: 1, end: 254 },
    2: { prefix: '192.168.200.', start: 1, end: 254 },
  },
  tokenAntenna: {
    1: { prefix: '192.168.4.', start: 1, end: 254 },
    2: { prefix: '192.168.90.', start: 1, end: 254 },
  },
  tokenModem: {
    1: { prefix: '192.168.5.', start: 1, end: 254 },
    2: { prefix: '192.168.91.', start: 1, end: 254 },
  },
}

export const CLIENT_IP_FIELDS_BY_TYPE = {
  residential: [
    { name: 'ip', label: 'Dirección IP', placeholder: '192.168.3.10', rangeKey: 'residential' },
  ],
  token: [
    { name: 'antennaIp', label: 'IP de la antena', placeholder: '192.168.4.10', rangeKey: 'tokenAntenna' },
    { name: 'modemIp', label: 'IP del módem', placeholder: '192.168.5.10', rangeKey: 'tokenModem' },
  ],
}

export const CLIENT_ANTENNA_MODELS = ['LiteBeam', 'Loco M5']

const buildIpOptions = () =>
  Object.fromEntries(
    Object.entries(CLIENT_IP_RANGES).map(([rangeKey, baseRanges]) => [
      rangeKey,
      Object.fromEntries(
        Object.entries(baseRanges).map(([base, { prefix, start, end }]) => [
          base,
          Array.from({ length: end - start + 1 }, (_, index) => `${prefix}${start + index}`),
        ]),
      ),
    ]),
  )

export const CLIENT_IP_OPTIONS = buildIpOptions()

export const createAssignedIpIndex = (clients) => {
  const result = {}

  clients.forEach((client) => {
    const type = client.type ?? 'residential'
    const baseKey = String(client.base ?? 1)
    const ipFields = CLIENT_IP_FIELDS_BY_TYPE[type] ?? []

    ipFields.forEach(({ name, rangeKey }) => {
      const value = client[name]
      if (!value) return
      if (!result[rangeKey]) result[rangeKey] = {}
      if (!result[rangeKey][baseKey]) result[rangeKey][baseKey] = new Set()
      result[rangeKey][baseKey].add(value)
    })
  })

  return result
}

export const getAvailableIpsByRange = (assignedIndex) => {
  const result = {}

  Object.entries(CLIENT_IP_OPTIONS).forEach(([rangeKey, baseOptions]) => {
    result[rangeKey] = {}

    Object.entries(baseOptions).forEach(([baseKey, options]) => {
      const used = assignedIndex?.[rangeKey]?.[baseKey] ?? new Set()
      result[rangeKey][baseKey] = options.filter((ip) => !used.has(ip))
    })
  })

  return result
}
