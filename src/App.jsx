
import React, { useMemo, useState } from 'react'
import { Home, Users, DollarSign, BarChart2, Settings, Wifi, FileText, Bell, Eye, EyeOff, Plus, ClipboardList } from 'lucide-react'
import Button from './components/ui/Button.jsx'
import { Card, CardContent } from './components/ui/Card.jsx'
import StatCard from './components/dashboard/StatCard.jsx'
import EarningsCard from './components/dashboard/EarningsCard.jsx'
import { peso, today } from './utils/formatters.js'

export default function App(){
  const [route, setRoute] = useState('dashboard')
  const [showEarnings, setShowEarnings] = useState(false)
  const [periodLabel] = useState('Noviembre 2025')

  const LOCATIONS = ['Nuevo Amatenango', 'Zapotal', 'Naranjal', 'Belén', 'Lagunita']

  const [clients, setClients] = useState([
    { name: 'Juan Pérez', location: 'Nuevo Amatenango', base: 1, ip: '192.168.3.15', paidMonthsAhead: 0, debtMonths: 0, service: 'Activo' },
    { name: 'Ana Gómez', location: 'Belén', base: 1, ip: '192.168.3.33', paidMonthsAhead: 0, debtMonths: 0, service: 'Activo' },
    { name: 'María Gómez', location: 'Lagunita', base: 2, ip: '192.168.200.7', paidMonthsAhead: 0, debtMonths: 1, service: 'Activo' },
    { name: 'Pedro López', location: 'Zapotal', base: 2, ip: '192.168.200.29', paidMonthsAhead: 0, debtMonths: 2, service: 'Suspendido' },
    { name: 'José Ruiz', location: 'Naranjal', base: 1, ip: '192.168.3.44', paidMonthsAhead: 0, debtMonths: 1, service: 'Activo' },
  ])

  const [payments, setPayments] = useState([])
  const [resellers, setResellers] = useState([
    { name: 'Juan Rev', base: 2, location: 'Lagunita', deliveries: [{ id: 'E-001', date: '02/11/2025', qty: { h1: 20, h3: 10, d1: 15, w1: 8, d15: 4, m1: 2 }, settled: false }], settlements: [] },
    { name: 'María Rev', base: 1, location: 'Belén',   deliveries: [{ id: 'E-002', date: '10/11/2025', qty: { h1: 50, h3: 20, d1: 20, w1: 6, d15: 3, m1: 1 }, settled: false }], settlements: [] },
  ])

  const [expenses, setExpenses] = useState([
    { date: '05/11/2025', desc: 'Gasolina cobros', cat: 'Gasolina', amount: 350, base: 1 },
    { date: '08/11/2025', desc: 'Conectores RJ45', cat: 'Materiales', amount: 220, base: 2 },
  ])

  const [showExpense, setShowExpense] = useState(false)
  const [newExpense, setNewExpense] = useState({ date: '', desc: '', cat: '', amount: 0, base: 1 })
  const addExpense = () => {
    if (!newExpense.date || !newExpense.desc || !newExpense.cat || !newExpense.amount) return
    setExpenses(prev => [...prev, { ...newExpense }])
    setShowExpense(false)
    setNewExpense({ date: '', desc: '', cat: '', amount: 0, base: 1 })
  }

  const [baseCosts, setBaseCosts] = useState({ base1: 2900, base2: 3750 })
  const [voucherPrices, setVoucherPrices] = useState({ h1: 5, h3: 8, d1: 15, w1: 45, d15: 70, m1: 140 })

  const paidClients = useMemo(() => clients.filter(c => c.debtMonths === 0), [clients])
  const pendingClients = useMemo(() => clients.filter(c => c.debtMonths > 0), [clients])
  const totalClients = clients.length

  const resellerIncomeDemo = 4800
  const clientIncomeDemo = paidClients.length * 300
  const earningsDemo = clientIncomeDemo + resellerIncomeDemo - (baseCosts.base1 + baseCosts.base2) - expenses.reduce((a, e) => a + e.amount, 0)

  const debtLabel = (m) => (m <= 0 ? 'Al día' : m === 1 ? 'Debe 1 periodo' : `Debe ${m} periodos`)
  const newId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2,7).toUpperCase()}`

  const [payDialog, setPayDialog] = useState({ open: false, idx: null, months: 1 })
  const openPayDialog = (idx) => setPayDialog({ open: true, idx, months: 1 })
  const confirmQuickPay = () => {
    if (payDialog.idx === null) return
    setClients(prev => prev.map((c, i) => {
      if (i !== payDialog.idx) return c
      let months = payDialog.months
      let debt = c.debtMonths
      let ahead = c.paidMonthsAhead
      if (months >= debt) { months -= debt; debt = 0; ahead += months }
      else { debt = debt - months }
      return { ...c, debtMonths: debt, paidMonthsAhead: ahead, service: debt === 0 ? 'Activo' : c.service }
    }))
    setPayments(p => [...p, { date: today(), clientName: clients[payDialog.idx].name, months: payDialog.months, method: 'Rápido', note: `Pago rápido` }])
    setPayDialog({ open: false, idx: null, months: 1 })
    setRoute('clientes')
  }

  const [settle, setSettle] = useState({ open: false, rIndex: null, dIndex: null, deliveredLeft: null, paidPercent: 15, received: 0 })
  const openSettlement = (rIndex, dIndex) => {
    const del = resellers[rIndex].deliveries[dIndex]
    setSettle({ open: true, rIndex, dIndex, deliveredLeft: { ...del.qty }, paidPercent: 15, received: 0 })
  }
  const computeSettlement = () => {
    if (!settle.open || settle.rIndex === null || settle.dIndex === null) return { total: 0, resellerGain: 0, myGain: 0, expected: 0, diff: 0 }
    const prices = voucherPrices
    const qty = settle.deliveredLeft
    const soldValue = qty.h1*prices.h1 + qty.h3*prices.h3 + qty.d1*prices.d1 + qty.w1*prices.w1 + qty.d15*prices.d15 + qty.m1*prices.m1
    const resellerGain = Math.round((soldValue * settle.paidPercent)/100)
    const myGain = soldValue - resellerGain
    const expected = soldValue
    const diff = settle.received - expected
    return { total: soldValue, resellerGain, myGain, expected, diff }
  }
  const confirmSettlement = () => {
    if (settle.rIndex === null || settle.dIndex === null) return
    setResellers(prev => prev.map((r, ri) => {
      if (ri !== settle.rIndex) return r
      return {
        ...r,
        deliveries: r.deliveries.map((d, di) => di === settle.dIndex ? { ...d, settled: true } : d),
        settlements: [...r.settlements, { date: today(), total: computeSettlement().total, resellerGain: computeSettlement().resellerGain, myGain: computeSettlement().myGain, diff: computeSettlement().diff }]
      }
    }))
    setSettle({ open: false, rIndex: null, dIndex: null, paidPercent: 15, received: 0 })
  }

  const [addClientOpen, setAddClientOpen] = useState(false)
  const [newClient, setNewClient] = useState({ name: '', location: LOCATIONS[0], base: 1, ip: '', paidMonthsAhead: 0, debtMonths: 1, service: 'Activo' })
  const addClient = () => {
    if (!newClient.name || !newClient.ip) return
    setClients(prev => [...prev, newClient])
    setAddClientOpen(false)
    setNewClient({ name: '', location: LOCATIONS[0], base: 1, ip: '', paidMonthsAhead: 0, debtMonths: 1, service: 'Activo' })
  }

  const [fullPayOpen, setFullPayOpen] = useState(false)
  const [fullPay, setFullPay] = useState({ idx: 0, months: 1, method: 'Efectivo', note: '' })
  const openFullPay = (idx) => {
    const i = typeof idx === 'number' ? idx : 0
    setFullPay({ idx: i, months: 1, method: 'Efectivo', note: '' })
    setFullPayOpen(true)
  }
  const confirmFullPay = () => {
    setClients(prev => prev.map((c, i) => {
      if (i !== fullPay.idx) return c
      let months = fullPay.months
      let debt = c.debtMonths
      let ahead = c.paidMonthsAhead
      if (months >= debt) { months -= debt; debt = 0; ahead += months } else { debt = debt - months }
      return { ...c, debtMonths: debt, paidMonthsAhead: ahead, service: debt === 0 ? 'Activo' : c.service }
    }))
    setPayments(p => [...p, { date: today(), clientName: clients[fullPay.idx].name, months: fullPay.months, method: fullPay.method, note: fullPay.note }])
    setFullPayOpen(false)
    if (route !== 'pagos') setRoute('pagos')
  }

  const [newDeliveryOpen, setNewDeliveryOpen] = useState(false)
  const [newDelivery, setNewDelivery] = useState({ reseller: 0, qty: { h1:0, h3:0, d1:0, w1:0, d15:0, m1:0 } })
  const openNewDelivery = (presetReseller) => { setNewDelivery({ reseller: presetReseller ?? 0, qty: { h1:0, h3:0, d1:0, w1:0, d15:0, m1:0 } }); setNewDeliveryOpen(true) }
  const confirmNewDelivery = () => {
    setResellers(prev => prev.map((r, i) => i!==newDelivery.reseller ? r : ({ ...r, deliveries: [...r.deliveries, { id: newId('E'), date: today(), qty: { ...newDelivery.qty }, settled: false }] })))
    setNewDeliveryOpen(false)
    if (route !== 'revendedores') setRoute('revendedores')
  }

  const [historyOpen, setHistoryOpen] = useState({ open:false, idx:null })
  const openHistory = (idx) => setHistoryOpen({ open:true, idx })
  const toggleService = (idx) => setClients(prev => prev.map((c,i)=> i===idx ? { ...c, service: c.service==='Activo'?'Suspendido':'Activo'} : c))

  const Dashboard = () => {
    const [dashFilter, setDashFilter] = useState('pending')
    const renderDashTable = () => {
      if (dashFilter === 'paid') {
        return (<Card><CardContent>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Clientes al día</h2>
            <input type="text" placeholder="🔍 Buscar cliente o localidad..." className="border rounded-lg px-3 py-1 text-sm" />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700"><tr>
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2 text-left">Localidad</th>
              <th className="p-2 text-left">Periodo pagado</th>
            </tr></thead>
            <tbody>
              {clients.map((c,i)=> c.debtMonths===0 && (
                <tr key={i} className="border-b">
                  <td className="p-2">{c.name}</td>
                  <td className="p-2">{c.location}</td>
                  <td className="p-2 text-green-600 font-semibold">Pagó {periodLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>)
      }
      return (<Card><CardContent>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold">Clientes pendientes de pago</h2>
          <input type="text" placeholder="🔍 Buscar cliente o localidad..." className="border rounded-lg px-3 py-1 text-sm" />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700"><tr>
            <th className="p-2 text-left">Nombre</th>
            <th className="p-2 text-left">Localidad</th>
            <th className="p-2 text-left">Estado</th>
            <th className="p-2 text-left">Acción</th>
          </tr></thead>
          <tbody>
            {clients.map((c,i)=> c.debtMonths>0 && (
              <tr key={i} className="border-b">
                <td className="p-2">{c.name}</td>
                <td className="p-2">{c.location}</td>
                <td className="p-2 text-red-600 font-semibold">{debtLabel(c.debtMonths)}</td>
                <td className="p-2"><Button size="sm" className="bg-green-600 text-white" onClick={()=>openPayDialog(i)}>💵 Pagar</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>)
    }
    return (<>
      <h1 className="text-2xl font-bold mb-6">Panel Principal</h1>
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatCard
          title="Clientes al día"
          value={paidClients.length}
          icon={Users}
          trend={`Total clientes: ${totalClients}`}
          onClick={()=>setDashFilter('paid')}
        />
        <StatCard
          title="Pendientes de pago"
          value={pendingClients.length}
          icon={Bell}
          trend={`Periodo: ${periodLabel}`}
          onClick={()=>setDashFilter('pending')}
        />
        <StatCard
          title="Entregas abiertas"
          value={resellers.reduce((a,r)=>a+r.deliveries.filter(d=>!d.settled).length,0)}
          icon={ClipboardList}
          trend="Liquidaciones pendientes"
          onClick={()=>setRoute('revendedores')}
        />
        <div className="relative">
          <StatCard
            title="Ganancia estimada"
            value={showEarnings ? peso(earningsDemo) : '••••••'}
            icon={BarChart2}
            trend={`Periodo: ${periodLabel}`}
            onClick={()=>setRoute('reportes')}
          />
          <button
            type="button"
            className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:border-gray-300 hover:text-gray-700"
            onClick={(e)=>{ e.stopPropagation(); setShowEarnings(!showEarnings) }}
            aria-label={showEarnings ? 'Ocultar ganancias' : 'Mostrar ganancias'}
          >
            {showEarnings ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <Button onClick={()=>setAddClientOpen(true)}><Plus className="h-4 w-4 mr-2" />Agregar cliente</Button>
        <Button onClick={()=>openFullPay()}><DollarSign className="h-4 w-4 mr-2" />Registrar pago</Button>
        <Button onClick={()=>openNewDelivery()}><ClipboardList className="h-4 w-4 mr-2" />Entregar fichas</Button>
        <Button onClick={()=>setRoute('reportes')}>Ver reportes</Button>
      </div>

      <div className="mb-6">
        <EarningsCard
          earningsDemo={earningsDemo}
          clientIncomeDemo={clientIncomeDemo}
          resellerIncomeDemo={resellerIncomeDemo}
          baseCosts={baseCosts}
          expenses={expenses}
        />
      </div>

      {renderDashTable()}
    </>)
  }

  const Clientes = () => (<>
    <h1 className="text-2xl font-bold mb-6">Clientes</h1>
    <Card><CardContent>
      <div className="flex justify-between items-center mb-3">
        <input type="text" placeholder="🔍 Buscar por nombre, IP o localidad..." className="border rounded-lg px-3 py-2 text-sm w-72" />
        <div className="text-sm text-gray-500">Total: {totalClients} • Al día: {paidClients.length} • Pendientes: {pendingClients.length}</div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-700"><tr>
          <th className="p-2 text-left">Nombre</th>
          <th className="p-2 text-left">Base</th>
          <th className="p-2 text-left">Localidad</th>
          <th className="p-2 text-left">IP</th>
          <th className="p-2 text-left">Servicio</th>
          <th className="p-2 text-left">Pago</th>
          <th className="p-2 text-left">Acciones</th>
        </tr></thead>
        <tbody>
          {clients.map((c,i)=>(
            <tr key={i} className="border-b">
              <td className="p-2">{c.name}</td>
              <td className="p-2">Base {c.base}</td>
              <td className="p-2">{c.location}</td>
              <td className="p-2">{c.ip}</td>
              <td className={c.service==='Activo'?'p-2 text-green-600':'p-2 text-red-600'}>{c.service}</td>
              <td className={c.debtMonths>0?'p-2 text-red-600':'p-2 text-green-600'}>{debtLabel(c.debtMonths)}</td>
              <td className="p-2 flex gap-2">
                {c.debtMonths>0 && (<Button size="sm" onClick={()=>openPayDialog(i)}>💵 Pagar</Button>)}
                <Button size="sm" variant="ghost" onClick={()=>openHistory(i)}>Historial</Button>
                <Button size="sm" variant="ghost" onClick={()=>toggleService(i)}>{c.service==='Activo'?'Suspender':'Reactivar'}</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent></Card>
  </>)

  const Revendedores = () => (<>
    <h1 className="text-2xl font-bold mb-6">Revendedores</h1>
    {resellers.map((r,ri)=>(
      <Card key={ri} className="mb-4"><CardContent>
        <div className="flex justify-between items-center mb-2">
          <div>
            <div className="font-semibold">{r.name} • Base {r.base} • {r.location}</div>
            <div className="text-sm text-gray-500">Entregas abiertas: {r.deliveries.filter(d=>!d.settled).length} • Liquidaciones: {r.settlements.length}</div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={()=>openNewDelivery(ri)}><ClipboardList className="h-4 w-4 mr-1" />Nueva entrega</Button>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700"><tr>
              <th className="p-2 text-left">Folio</th>
              <th className="p-2 text-left">Fecha</th>
              <th className="p-2 text-left">1h</th>
              <th className="p-2 text-left">3h</th>
              <th className="p-2 text-left">1 día</th>
              <th className="p-2 text-left">1 semana</th>
              <th className="p-2 text-left">15 días</th>
              <th className="p-2 text-left">1 mes</th>
              <th className="p-2 text-left">Estado</th>
              <th className="p-2 text-left">Acción</th>
            </tr></thead>
            <tbody>
              {r.deliveries.map((d,di)=>(
                <tr key={d.id} className="border-b">
                  <td className="p-2">{d.id}</td>
                  <td className="p-2">{d.date}</td>
                  <td className="p-2">{d.qty.h1}</td>
                  <td className="p-2">{d.qty.h3}</td>
                  <td className="p-2">{d.qty.d1}</td>
                  <td className="p-2">{d.qty.w1}</td>
                  <td className="p-2">{d.qty.d15}</td>
                  <td className="p-2">{d.qty.m1}</td>
                  <td className={d.settled?'p-2 text-green-600':'p-2 text-yellow-600'}>{d.settled?'Liquidada':'Pendiente'}</td>
                  <td className="p-2">{!d.settled && (<Button size="sm" className="bg-green-600 text-white" onClick={()=>openSettlement(ri,di)}>Liquidar</Button>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
    ))}
  </>)

  const Pagos = () => (<>
    <h1 className="text-2xl font-bold mb-6">Pagos • {periodLabel}</h1>
    <Card><CardContent>
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm text-gray-500">Pendientes: {pendingClients.length} • Al día: {paidClients.length} • Total: {totalClients}</div>
        <Button onClick={()=>openFullPay()}><DollarSign className="h-4 w-4 mr-2" />Registrar pago (completo)</Button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-700"><tr>
          <th className="p-2 text-left">Cliente</th>
          <th className="p-2 text-left">Localidad</th>
          <th className="p-2 text-left">Estado</th>
          <th className="p-2 text-left">Acción</th>
        </tr></thead>
        <tbody>
          {clients.map((c,i)=>(
            <tr key={i} className="border-b">
              <td className="p-2">{c.name}</td>
              <td className="p-2">{c.location}</td>
              <td className={c.debtMonths>0?'p-2 text-red-600':'p-2 text-green-600'}>{debtLabel(c.debtMonths)}</td>
              <td className="p-2">{c.debtMonths>0 ? (<Button size="sm" onClick={()=>openPayDialog(i)}>💵 Pagar</Button>) : (<span className="text-gray-400">—</span>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent></Card>
  </>)

  const Reportes = () => (<>
    <h1 className="text-2xl font-bold mb-6">Reportes</h1>
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
      <Card><CardContent><p className="text-gray-600">Ingresos clientes</p><p className="text-3xl font-semibold">{peso(clientIncomeDemo)}</p></CardContent></Card>
      <Card><CardContent><p className="text-gray-600">Ingresos revendedores</p><p className="text-3xl font-semibold">{peso(resellerIncomeDemo)}</p></CardContent></Card>
      <Card><CardContent><p className="text-gray-600">Costos Internet</p><p className="text-3xl font-semibold">{peso(baseCosts.base1 + baseCosts.base2)}</p></CardContent></Card>
      <Card><CardContent><p className="text-gray-600">Gastos operativos</p><p className="text-3xl font-semibold">{peso(expenses.reduce((a,e)=>a+e.amount,0))}</p></CardContent></Card>
    </div>
    <Card><CardContent><h2 className="text-lg font-semibold mb-3">Ganancia estimada del mes</h2><p className="text-3xl font-bold">{peso(earningsDemo)}</p></CardContent></Card>
  </>)

  const Gastos = () => (<>
    <h1 className="text-2xl font-bold mb-6">Gastos</h1>
    <div className="mb-3"><Button onClick={()=>setShowExpense(true)}>➕ Nuevo gasto</Button></div>
    <Card><CardContent>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-700"><tr>
          <th className="p-2 text-left">Fecha</th>
          <th className="p-2 text-left">Descripción</th>
          <th className="p-2 text-left">Categoría</th>
          <th className="p-2 text-left">Monto</th>
          <th className="p-2 text-left">Base</th>
        </tr></thead>
        <tbody>
          {expenses.map((e,i)=>(
            <tr key={i} className="border-b">
              <td className="p-2">{e.date}</td>
              <td className="p-2">{e.desc}</td>
              <td className="p-2">{e.cat}</td>
              <td className="p-2">{peso(e.amount)}</td>
              <td className="p-2">Base {e.base}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent></Card>

    {showExpense && (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
          <h3 className="text-lg font-semibold mb-3">Nuevo gasto</h3>
          <div className="grid gap-3">
            <input className="border rounded-lg px-3 py-2" placeholder="Fecha (dd/mm/aaaa)" value={newExpense.date} onChange={e=>setNewExpense({ ...newExpense, date: e.target.value })} />
            <input className="border rounded-lg px-3 py-2" placeholder="Descripción" value={newExpense.desc} onChange={e=>setNewExpense({ ...newExpense, desc: e.target.value })} />
            <input className="border rounded-lg px-3 py-2" placeholder="Categoría" value={newExpense.cat} onChange={e=>setNewExpense({ ...newExpense, cat: e.target.value })} />
            <input className="border rounded-lg px-3 py-2" type="number" placeholder="Monto" value={newExpense.amount} onChange={e=>setNewExpense({ ...newExpense, amount: Number(e.target.value) })} />
            <select className="border rounded-lg px-3 py-2" value={newExpense.base} onChange={e=>setNewExpense({ ...newExpense, base: Number(e.target.value) })}>
              <option value={1}>Base 1</option>
              <option value={2}>Base 2</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="ghost" onClick={()=>setShowExpense(false)}>Cancelar</Button>
            <Button className="bg-green-600 text-white" onClick={addExpense}>Guardar</Button>
          </div>
        </div>
      </div>
    )}
  </>)

  const Config = () => (<>
    <h1 className="text-2xl font-bold mb-6">Configuración</h1>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card><CardContent>
        <h2 className="text-lg font-semibold mb-3">Costos por base</h2>
        <div className="grid gap-3">
          <label className="text-sm text-gray-600">Base 1 – Nuevo Amatenango</label>
          <input className="border rounded-lg px-3 py-2" type="number" value={baseCosts.base1} onChange={e=>setBaseCosts({ ...baseCosts, base1: Number(e.target.value) })} />
          <label className="text-sm text-gray-600">Base 2 – Lagunita</label>
          <input className="border rounded-lg px-3 py-2" type="number" value={baseCosts.base2} onChange={e=>setBaseCosts({ ...baseCosts, base2: Number(e.target.value) })} />
        </div>
      </CardContent></Card>
      <Card><CardContent>
        <h2 className="text-lg font-semibold mb-3">Precios de fichas</h2>
        <div className="grid grid-cols-2 gap-3">
          <label>1 hora</label><input className="border rounded-lg px-3 py-2" type="number" value={voucherPrices.h1} onChange={e=>setVoucherPrices({ ...voucherPrices, h1: Number(e.target.value) })} />
          <label>3 horas</label><input className="border rounded-lg px-3 py-2" type="number" value={voucherPrices.h3} onChange={e=>setVoucherPrices({ ...voucherPrices, h3: Number(e.target.value) })} />
          <label>1 día</label><input className="border rounded-lg px-3 py-2" type="number" value={voucherPrices.d1} onChange={e=>setVoucherPrices({ ...voucherPrices, d1: Number(e.target.value) })} />
          <label>1 semana</label><input className="border rounded-lg px-3 py-2" type="number" value={voucherPrices.w1} onChange={e=>setVoucherPrices({ ...voucherPrices, w1: Number(e.target.value) })} />
          <label>15 días</label><input className="border rounded-lg px-3 py-2" type="number" value={voucherPrices.d15} onChange={e=>setVoucherPrices({ ...voucherPrices, d15: Number(e.target.value) })} />
          <label>1 mes</label><input className="border rounded-lg px-3 py-2" type="number" value={voucherPrices.m1} onChange={e=>setVoucherPrices({ ...voucherPrices, m1: Number(e.target.value) })} />
        </div>
      </CardContent></Card>
    </div>
  </>)

  const Notifs = () => (<>
    <h1 className="text-2xl font-bold mb-6">Notificaciones</h1>
    <Card><CardContent><ul className="list-disc pl-5 text-sm text-gray-700">
      <li>Recordatorio: 8 clientes pendientes de pago ({periodLabel}).</li>
      <li>Revendedor Juan Rev con 1 entrega abierta.</li>
      <li>Gasto nuevo registrado: {peso(350)} (Gasolina).</li>
    </ul></CardContent></Card>
  </>)

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-64 bg-white border-r shadow-sm flex flex-col">
        <div className="p-4 text-xl font-semibold border-b">📡 Red-Link</div>
        <nav className="flex-1 p-3 space-y-2 text-gray-700">
          <Button variant="ghost" className="w-full justify-start" onClick={()=>setRoute('dashboard')}><Home className="mr-2 h-4 w-4" />Inicio</Button>
          <Button variant="ghost" className="w-full justify-start" onClick={()=>setRoute('clientes')}><Users className="mr-2 h-4 w-4" />Clientes</Button>
          <Button variant="ghost" className="w-full justify-start" onClick={()=>setRoute('revendedores')}><Wifi className="mr-2 h-4 w-4" />Revendedores</Button>
          <Button variant="ghost" className="w-full justify-start" onClick={()=>setRoute('pagos')}><DollarSign className="mr-2 h-4 w-4" />Pagos</Button>
          <Button variant="ghost" className="w-full justify-start" onClick={()=>setRoute('reportes')}><BarChart2 className="mr-2 h-4 w-4" />Reportes</Button>
          <Button variant="ghost" className="w-full justify-start" onClick={()=>setRoute('gastos')}><FileText className="mr-2 h-4 w-4" />Gastos</Button>
          <Button variant="ghost" className="w-full justify-start" onClick={()=>setRoute('config')}><Settings className="mr-2 h-4 w-4" />Configuración</Button>
          <Button variant="ghost" className="w-full justify-start" onClick={()=>setRoute('notifs')}><Bell className="mr-2 h-4 w-4" />Notificaciones</Button>
        </nav>
      </aside>

      <main className="flex-1 p-6 overflow-auto">
        {route === 'dashboard' && <Dashboard />}
        {route === 'clientes' && <Clientes />}
        {route === 'revendedores' && <Revendedores />}
        {route === 'pagos' && <Pagos />}
        {route === 'reportes' && <Reportes />}
        {route === 'gastos' && <Gastos />}
        {route === 'config' && <Config />}
        {route === 'notifs' && <Notifs />}
      </main>

      {payDialog.open && payDialog.idx !== null && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <h3 className="text-lg font-semibold mb-3">Confirmar pago</h3>
            <p className="mb-3 text-sm text-gray-600">¿Confirmas registrar el pago para <b>{clients[payDialog.idx].name}</b>?</p>
            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-1">Meses a pagar</label>
              <select className="border rounded-lg px-3 py-2 w-full" value={payDialog.months} onChange={e=>setPayDialog(prev=>({ ...prev, months: Number(e.target.value) }))}>
                {Array.from({ length: Math.max(1, clients[payDialog.idx].debtMonths) }, (_, i) => i + 1).map(v => (<option key={v} value={v}>{v} {v===1?'mes':'meses'}</option>))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={()=>setPayDialog({ open:false, idx:null, months:1 })}>Cancelar</Button>
              <Button className="bg-green-600 text-white" onClick={confirmQuickPay}>Confirmar pago</Button>
            </div>
          </div>
        </div>
      )}

      {fullPayOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5">
            <h3 className="text-lg font-semibold mb-3">Registrar pago</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="col-span-2">Cliente</label>
              <select className="border rounded px-2 py-2 col-span-2" value={fullPay.idx} onChange={e=>setFullPay(fp=>({ ...fp, idx: Number(e.target.value) }))}>
                {clients.map((c,i)=>(<option key={i} value={i}>{c.name} — {c.location} — {debtLabel(c.debtMonths)}</option>))}
              </select>
              <label>Meses</label>
              <input className="border rounded px-2 py-2" type="number" min={1} value={fullPay.months} onChange={e=>setFullPay(fp=>({ ...fp, months: Math.max(1, Number(e.target.value)) }))} />
              <label>Método</label>
              <select className="border rounded px-2 py-2" value={fullPay.method} onChange={e=>setFullPay(fp=>({ ...fp, method: e.target.value }))}>
                <option>Efectivo</option>
                <option>Transferencia</option>
                <option>Otro</option>
              </select>
              <label className="col-span-2">Nota</label>
              <input className="border rounded px-2 py-2 col-span-2" placeholder="Opcional" value={fullPay.note} onChange={e=>setFullPay(fp=>({ ...fp, note: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" onClick={()=>setFullPayOpen(false)}>Cancelar</Button>
              <Button className="bg-green-600 text-white" onClick={confirmFullPay}>Guardar</Button>
            </div>
          </div>
        </div>
      )}

      {newDeliveryOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-5">
            <h3 className="text-lg font-semibold mb-3">Nueva entrega de fichas</h3>
            <div className="grid grid-cols-6 gap-3 text-sm">
              <label className="col-span-6">Revendedor</label>
              <select className="border rounded px-2 py-2 col-span-6" value={newDelivery.reseller} onChange={e=>setNewDelivery(nd=>({ ...nd, reseller: Number(e.target.value) }))}>
                {resellers.map((r,i)=>(<option key={i} value={i}>{r.name} — Base {r.base} — {r.location}</option>))}
              </select>
              {(['h1','h3','d1','w1','d15','m1']).map((k)=> (
                <div key={k} className="col-span-3">
                  <label>{k.toUpperCase()}</label>
                  <input className="border rounded px-2 py-2 w-full" type="number" min={0} value={newDelivery.qty[k]} onChange={e=>setNewDelivery(nd=>({ ...nd, qty: { ...nd.qty, [k]: Number(e.target.value)||0 } }))} />
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" onClick={()=>setNewDeliveryOpen(false)}>Cancelar</Button>
              <Button className="bg-green-600 text-white" onClick={confirmNewDelivery}>Guardar</Button>
            </div>
          </div>
        </div>
      )}

      {historyOpen.open && historyOpen.idx !== null && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5">
            <h3 className="text-lg font-semibold mb-3">Historial de pagos — {clients[historyOpen.idx].name}</h3>
            <div className="max-h-80 overflow-auto text-sm">
              {payments.filter(p=>p.clientName===clients[historyOpen.idx].name).length===0
                ? <p className="text-gray-500">Sin pagos registrados.</p>
                : (<table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-700"><tr>
                      <th className="p-2 text-left">Fecha</th>
                      <th className="p-2 text-left">Meses</th>
                      <th className="p-2 text-left">Método</th>
                      <th className="p-2 text-left">Nota</th>
                    </tr></thead>
                    <tbody>
                      {payments.filter(p=>p.clientName===clients[historyOpen.idx].name).map((p,i)=>(
                        <tr key={i} className="border-b">
                          <td className="p-2">{p.date}</td>
                          <td className="p-2">{p.months}</td>
                          <td className="p-2">{p.method}</td>
                          <td className="p-2">{p.note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>)
              }
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" onClick={()=>setHistoryOpen({ open:false, idx:null })}>Cerrar</Button>
              <Button className="bg-green-600 text-white" onClick={()=>{ setHistoryOpen({ open:false, idx:null }); openFullPay() }}>Registrar pago</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
