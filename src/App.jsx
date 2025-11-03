import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import BackofficeLayout from './layouts/BackofficeLayout.jsx'
import DashboardPage from './pages/Dashboard.jsx'
import ClientsPage from './pages/Clients.jsx'
import ResellersPage from './pages/Resellers.jsx'
import PaymentsPage from './pages/Payments.jsx'
import ExpensesPage from './pages/Expenses.jsx'
import SettingsPage from './pages/Settings.jsx'
import ReportsPage from './pages/Reports.jsx'
import InventoryPage from './pages/Inventory.jsx'

export default function App() {
  return (
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
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
