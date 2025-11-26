import React, { Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import PageSkeleton from './components/layout/PageSkeleton.jsx'
import {
  loadBackofficeLayout,
  loadClientsPage,
  loadDashboardPage,
  loadExpensesPage,
  loadInventoryPage,
  loadPaymentsPage,
  loadPointOfSalePage,
  loadReportsPage,
  loadResellersPage,
  loadSettingsPage,
} from './routes/routeLoaders.js'

const BackofficeLayout = React.lazy(loadBackofficeLayout)
const DashboardPage = React.lazy(loadDashboardPage)
const ClientsPage = React.lazy(loadClientsPage)
const ResellersPage = React.lazy(loadResellersPage)
const PaymentsPage = React.lazy(loadPaymentsPage)
const ExpensesPage = React.lazy(loadExpensesPage)
const SettingsPage = React.lazy(loadSettingsPage)
const ReportsPage = React.lazy(loadReportsPage)
const InventoryPage = React.lazy(loadInventoryPage)
const PointOfSalePage = React.lazy(loadPointOfSalePage)

export default function App() {
  return (
    <Suspense fallback={<PageSkeleton />}> 
      <Routes>
        <Route path="/" element={<BackofficeLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="resellers" element={<ResellersPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="ventas" element={<PointOfSalePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}
