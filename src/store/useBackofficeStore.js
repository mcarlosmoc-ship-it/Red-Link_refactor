989|   recordPayment: async ({ clientId, serviceId, amount, months, method, note, periodKey, paidOn }) => {
990|     const state = get()
991|     const client = state.clients.find((item) => String(item.id) === String(clientId))
992|     if (!client) {
993|       throw new Error('Cliente no encontrado')
994|     }
995| 
996|     const availableServices = Array.isArray(client.services) ? client.services : []
997|     const normalizedServiceId = serviceId ?? availableServices[0]?.id ?? null
998| 
999|     const service = availableServices.find(
1000|       (item) => String(item.id) === String(normalizedServiceId),
1001|     )
1002| 
1003|     if (availableServices.length > 0 && !service) {
1004|       throw new Error('Selecciona un servicio válido para registrar el pago')
1005|     }
1006| 
1007|     const monthlyFee = service?.price ?? client?.monthlyFee ?? CLIENT_PRICE
1008|     const normalizedAmount = normalizeDecimal(amount, 0)
1009|     const normalizedMonths = normalizeDecimal(months, 0)
1010| 
1011|     const computedAmount = normalizedAmount > 0 ? normalizedAmount : normalizedMonths * monthlyFee
1012| 
1013|     const payload = {
1014|       client_id: client.id,
1015|       period_key: periodKey ?? state.periods?.selected ?? state.periods?.current,
1016|       paid_on: paidOn ?? today(),
1017|       amount: computedAmount,
1018|       method: method ?? 'Efectivo',
1019|       note: note ?? '',
1020|       months_paid: normalizedMonths, // Ensure months_paid is added to payload
1021|     }
1022| 
1023|     if (service?.id) {
1024|       payload.client_service_id = service.id
1025|     }
1026| 
1027|     await runMutation({
1028|       set,
1029|       resources: 'payments',
1030|       action: async () => {
1031|         await apiClient.post('/payments', payload)
1032|       },
1033|     })
1034| 
1035|     invalidateQuery(queryKeys.clients())
1036|     invalidateQuery(queryKeys.payments(periodKey ?? state.periods?.selected ?? state.periods?.current))
1037|     invalidateQuery(['metrics'])
1038| 
1039|     await Promise.all([
1040|       get().loadClients({ force: true, retries: 1 }),
1041|       get().loadPayments({ force: true, retries: 1, periodKey }),
1042|       get().loadMetrics({ force: true, retries: 1, periodKey }),
1043|     ])
1044|   },