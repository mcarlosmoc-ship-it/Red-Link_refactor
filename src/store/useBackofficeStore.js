export const useBackofficeStore = {
  recordPayment: async ({ clientId, serviceId, amount, months, method, note, periodKey, paidOn }) => {
    const state = get();
    const client = state.clients.find((item) => String(item.id) === String(clientId));
    if (!client) {
      throw new Error('Cliente no encontrado');
    }

    const availableServices = Array.isArray(client.services) ? client.services : [];
    const normalizedServiceId = serviceId ?? availableServices[0]?.id ?? null;

    const service = availableServices.find(
      (item) => String(item.id) === String(normalizedServiceId),
    );

    if (availableServices.length > 0 && !service) {
      throw new Error('Selecciona un servicio válido para registrar el pago');
    }

    const monthlyFee = service?.price ?? client?.monthlyFee ?? CLIENT_PRICE;
    const normalizedAmount = normalizeDecimal(amount, 0);
    const normalizedMonths = normalizeDecimal(months, 0);

    const computedAmount = normalizedAmount > 0 ? normalizedAmount : normalizedMonths * monthlyFee;

    const payload = {
      client_id: client.id,
      period_key: periodKey ?? state.periods?.selected ?? state.periods?.current,
      paid_on: paidOn ?? today(),
      amount: computedAmount,
      method: method ?? 'Efectivo',
      note: note ?? '',
      months_paid: normalizedMonths, // Ensure months_paid is added to payload
    };

    if (service?.id) {
      payload.client_service_id = service.id;
    }

    await runMutation({
      set,
      resources: 'payments',
      action: async () => {
        await apiClient.post('/payments', payload);
      },
    });

    invalidateQuery(queryKeys.clients());
    invalidateQuery(queryKeys.payments(periodKey ?? state.periods?.selected ?? state.periods?.current));
    invalidateQuery(['metrics']);

    await Promise.all([
      get().loadClients({ force: true, retries: 1 }),
      get().loadPayments({ force: true, retries: 1, periodKey }),
      get().loadMetrics({ force: true, retries: 1, periodKey }),
    ]);
  },
};