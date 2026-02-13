import { useState, useMemo, useEffect } from 'react'
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, BarChart, Bar } from 'recharts'
import { TrendingUp, DollarSign, AlertTriangle, Package, Users, Activity, Bot, Settings, X, Clock, RefreshCw, ChevronDown, ArrowRight } from 'lucide-react'
import { useTransactions } from '../hooks/useTransactions'
import { useCustomers } from '../hooks/useCustomers'
import { useProducts } from '../hooks/useProducts'
import { usePredictionRun, useMLDemand, useMLRiskScores, useMLCashFlow, useMLInventory } from '../hooks/usePredictions'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorAlert from '../components/ErrorAlert'
import {
  formatLargeNumber,
  formatCurrency,
  groupByMonth,
  groupByCategory,
  getTopCustomersWithRisk,
  generateAIInsights,
  formatPercentage
} from '../utils/dataProcessing'

export default function ExecutiveDashboard() {
  const [showPrediction, setShowPrediction] = useState(false)

  // Fetch data from Supabase
  const { data: transactions, isLoading: loadingTransactions, error: transactionsError, refetch: refetchTransactions } = useTransactions()
  const { data: customers, isLoading: loadingCustomers, error: customersError } = useCustomers()
  const { data: products, isLoading: loadingProducts, error: productsError } = useProducts()
  const { data: predictionRun } = usePredictionRun()
  const { data: mlDemandData } = useMLDemand(predictionRun?.id)
  const { data: mlRiskData } = useMLRiskScores(predictionRun?.id)
  const { data: mlCashFlowData } = useMLCashFlow(predictionRun?.id)
  const { data: mlInventoryData } = useMLInventory(predictionRun?.id)

  // Handle loading state
  if (loadingTransactions || loadingCustomers || loadingProducts) {
    return <LoadingSpinner message="Loading dashboard data..." />
  }

  // Handle error state
  if (transactionsError) {
    return <ErrorAlert error={transactionsError} retry={refetchTransactions} title="Failed to Load Transactions" />
  }
  if (customersError || productsError) {
    return <ErrorAlert error={customersError || productsError} title="Failed to Load Data" />
  }

  // Handle no data
  if (!transactions || transactions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No Data Available</h3>
          <p className="text-gray-500">There are no transactions in the database yet.</p>
        </div>
      </div>
    )
  }

  return <DashboardContent
    transactions={transactions}
    customers={customers || []}
    products={products || []}
    showPrediction={showPrediction}
    setShowPrediction={setShowPrediction}
    mlDemandData={mlDemandData}
    mlRiskData={mlRiskData}
    mlCashFlowData={mlCashFlowData}
    mlInventoryData={mlInventoryData}
    predictionRun={predictionRun}
  />
}

function MLSettingsModal({ isOpen, onClose, predictionRun }) {
  const [intervalHours, setIntervalHours] = useState(1)
  const [loading, setLoading] = useState(false)
  const [runningNow, setRunningNow] = useState(false)
  const [message, setMessage] = useState('')
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

  // Fetch current schedule on open
  useEffect(() => {
    if (!isOpen) return
    setMessage('')
    fetch(`${supabaseUrl}/functions/v1/update-prediction-schedule`, { method: 'GET' })
      .then(r => r.json())
      .then(data => {
        if (data.interval_hours) setIntervalHours(data.interval_hours)
      })
      .catch(() => {})
  }, [isOpen, supabaseUrl])

  const handleSave = async () => {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/update-prediction-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval_hours: intervalHours })
      })
      const data = await res.json()
      if (data.success) {
        setMessage(`Schedule updated: predictions will run every ${intervalHours} hour${intervalHours > 1 ? 's' : ''}.`)
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } catch (err) {
      setMessage(`Failed to update: ${err.message}`)
    }
    setLoading(false)
  }

  const handleRunNow = async () => {
    setRunningNow(true)
    setMessage('')
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/run-predictions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      })
      const data = await res.json()
      if (data.success) {
        setMessage(`AI pipeline completed: ${data.total_predictions} predictions generated. Refresh page to see results.`)
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } catch (err) {
      setMessage(`Failed: ${err.message}`)
    }
    setRunningNow(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold">AI Prediction Settings</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Last Run Info */}
          {predictionRun && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                <strong>Last AI Run:</strong> {new Date(predictionRun.run_at).toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">
                {predictionRun.total_predictions} predictions | Avg confidence: {predictionRun.avg_confidence}%
              </p>
            </div>
          )}

          {/* Interval Setting */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Clock className="w-4 h-4 inline mr-1" />
              Auto-run interval (hours)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1"
                max="24"
                value={intervalHours}
                onChange={(e) => setIntervalHours(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
              />
              <span className="text-lg font-bold text-purple-600 w-12 text-center">{intervalHours}h</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              AI predictions will auto-run every {intervalHours} hour{intervalHours > 1 ? 's' : ''}
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
            >
              {loading ? 'Saving...' : 'Save Schedule'}
            </button>
            <button
              onClick={handleRunNow}
              disabled={runningNow}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-1"
            >
              <RefreshCw className={`w-4 h-4 ${runningNow ? 'animate-spin' : ''}`} />
              {runningNow ? 'Running...' : 'Run Now'}
            </button>
          </div>

          {/* Status Message */}
          {message && (
            <div className={`p-3 rounded-lg text-sm ${message.startsWith('Error') || message.startsWith('Failed') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DashboardContent({ transactions, customers, products, showPrediction, setShowPrediction, mlDemandData, mlRiskData, mlCashFlowData, mlInventoryData, predictionRun }) {
  const [showSettings, setShowSettings] = useState(false)
  const [activeDrilldown, setActiveDrilldown] = useState(null) // 'revenue' | 'margin' | 'outstanding' | 'risk' | 'inventory' | 'cashflow'
  const [selectedCategory, setSelectedCategory] = useState(null) // Pie chart click
  const [selectedCustomer, setSelectedCustomer] = useState(null) // Scatter chart click

  // Calculate KPIs
  const kpis = useMemo(() => {
    const totalRevenue = transactions.reduce((sum, t) => sum + (t.total_amount || 0), 0)
    const totalOutstanding = transactions.reduce((sum, t) => sum + (t.outstanding_amount || 0), 0)
    const totalCost = transactions.reduce((sum, t) => {
      const product = products.find(p => p.product_code === t.product_code)
      return sum + (product ? (product.cost_price || 0) * (t.quantity_liters || 0) : 0)
    }, 0)

    const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0

    const highRiskCustomers = mlRiskData && mlRiskData.length > 0
      ? mlRiskData.filter(r => r.risk_level === 'High').length
      : new Set(
          transactions.filter(t => t.payment_status === 'Overdue' || t.payment_status === 'Partial').map(t => t.customer_code)
        ).size

    let predictedCashInflow
    if (mlCashFlowData && mlCashFlowData.length > 0) {
      predictedCashInflow = parseFloat(mlCashFlowData[0].most_likely_inflow) || 0
    } else {
      const grouped = groupByMonth(transactions)
      predictedCashInflow = (grouped.slice(-1)[0]?.revenue || 0) * 1.1
    }

    let inventoryAtRisk
    if (mlInventoryData && mlInventoryData.length > 0) {
      const atRiskItems = mlInventoryData.filter(i => parseFloat(i.stockout_probability) > 0.3)
      inventoryAtRisk = atRiskItems.length
    } else {
      inventoryAtRisk = Math.round(totalOutstanding * 0.15)
    }

    return {
      totalRevenue,
      grossMargin,
      totalCost,
      outstanding: totalOutstanding,
      highRiskCustomers,
      inventoryAtRisk,
      predictedCashInflow,
      hasMLData: !!(mlRiskData?.length || mlCashFlowData?.length || mlInventoryData?.length)
    }
  }, [transactions, products, mlRiskData, mlCashFlowData, mlInventoryData])

  // Monthly revenue data
  const monthlyData = useMemo(() => {
    const grouped = groupByMonth(transactions)

    if (grouped.length > 0) {
      if (mlDemandData && mlDemandData.length > 0) {
        const mlMonthly = {}
        mlDemandData.forEach(p => {
          const month = p.prediction_month.substring(0, 7)
          if (!mlMonthly[month]) mlMonthly[month] = 0
          mlMonthly[month] += parseFloat(p.predicted_revenue) || 0
        })

        const predictions = Object.entries(mlMonthly)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, revenue]) => ({
            month, revenue: 0, predicted: Math.round(revenue), isPrediction: true, isML: true
          }))

        return [...grouped, ...predictions]
      }

      const lastMonth = grouped[grouped.length - 1]
      const lastDate = new Date(lastMonth.month)
      const predictions = []
      for (let i = 1; i <= 3; i++) {
        const nextDate = new Date(lastDate)
        nextDate.setMonth(nextDate.getMonth() + i)
        predictions.push({
          month: nextDate.toISOString().substring(0, 7),
          revenue: 0,
          predicted: Math.round(lastMonth.revenue * Math.pow(1.08, i)),
          isPrediction: true, isML: false
        })
      }
      return [...grouped, ...predictions]
    }
    return grouped
  }, [transactions, mlDemandData])

  // Category profitability
  const categoryData = useMemo(() => {
    return groupByCategory(transactions, products)
  }, [transactions, products])

  // Top customers with risk
  const topCustomers = useMemo(() => {
    return getTopCustomersWithRisk(transactions, customers, 10)
  }, [transactions, customers])

  // AI Insights
  const insights = useMemo(() => {
    return generateAIInsights(transactions, customers, {
      riskScores: mlRiskData,
      demandPredictions: mlDemandData,
      cashFlowForecasts: mlCashFlowData,
      inventoryForecasts: mlInventoryData
    })
  }, [transactions, customers, mlRiskData, mlDemandData, mlCashFlowData, mlInventoryData])

  // Drilldown data for KPI cards
  const drilldownData = useMemo(() => {
    if (!activeDrilldown) return null

    if (activeDrilldown === 'revenue') {
      // Revenue by product category
      const productMap = {}
      products.forEach(p => { productMap[p.product_code] = p })
      const catRevenue = {}
      transactions.forEach(t => {
        const p = productMap[t.product_code]
        const cat = p ? p.category : 'Unknown'
        if (!catRevenue[cat]) catRevenue[cat] = { revenue: 0, count: 0, qty: 0 }
        catRevenue[cat].revenue += parseFloat(t.total_amount) || 0
        catRevenue[cat].count++
        catRevenue[cat].qty += parseFloat(t.quantity_liters) || 0
      })
      return {
        title: 'Revenue Breakdown by Category',
        type: 'table',
        headers: ['Category', 'Revenue', 'Orders', 'Quantity (L)'],
        rows: Object.entries(catRevenue)
          .sort(([, a], [, b]) => b.revenue - a.revenue)
          .map(([cat, d]) => [cat, formatCurrency(d.revenue), d.count.toLocaleString(), Math.round(d.qty).toLocaleString()])
      }
    }

    if (activeDrilldown === 'margin') {
      // Margin by product
      const productMap = {}
      products.forEach(p => { productMap[p.product_code] = p })
      const prodMargins = {}
      transactions.forEach(t => {
        const p = productMap[t.product_code]
        if (!p) return
        const code = p.product_code
        if (!prodMargins[code]) prodMargins[code] = { name: p.product_name, revenue: 0, cost: 0 }
        prodMargins[code].revenue += parseFloat(t.total_amount) || 0
        prodMargins[code].cost += (parseFloat(p.cost_price) || 0) * (parseFloat(t.quantity_liters) || 0)
      })
      return {
        title: 'Gross Margin by Product',
        type: 'table',
        headers: ['Product', 'Revenue', 'Cost', 'Margin %'],
        rows: Object.values(prodMargins)
          .map(d => ({ ...d, margin: d.revenue > 0 ? ((d.revenue - d.cost) / d.revenue * 100) : 0 }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10)
          .map(d => [d.name, formatCurrency(d.revenue), formatCurrency(d.cost), d.margin.toFixed(1) + '%'])
      }
    }

    if (activeDrilldown === 'outstanding') {
      // Outstanding by customer
      const custOutstanding = {}
      transactions.filter(t => (parseFloat(t.outstanding_amount) || 0) > 0).forEach(t => {
        if (!custOutstanding[t.customer_code]) custOutstanding[t.customer_code] = { outstanding: 0, count: 0 }
        custOutstanding[t.customer_code].outstanding += parseFloat(t.outstanding_amount) || 0
        custOutstanding[t.customer_code].count++
      })
      const custMap = {}
      customers.forEach(c => { custMap[c.customer_code] = c.customer_name })
      return {
        title: 'Outstanding Receivables by Customer',
        type: 'table',
        headers: ['Customer', 'Outstanding', 'Pending Invoices', 'Status'],
        rows: Object.entries(custOutstanding)
          .sort(([, a], [, b]) => b.outstanding - a.outstanding)
          .slice(0, 10)
          .map(([code, d]) => [
            custMap[code] || code,
            formatCurrency(d.outstanding),
            d.count.toString(),
            d.outstanding > 1000000 ? 'Critical' : d.outstanding > 500000 ? 'Watch' : 'Normal'
          ])
      }
    }

    if (activeDrilldown === 'risk') {
      // High-risk customer details
      if (mlRiskData && mlRiskData.length > 0) {
        const highRisk = mlRiskData.filter(r => r.risk_level === 'High' || r.risk_level === 'Medium')
          .sort((a, b) => parseFloat(b.risk_score) - parseFloat(a.risk_score))
          .slice(0, 10)
        return {
          title: 'High & Medium Risk Customers',
          type: 'table',
          headers: ['Customer', 'Risk Score', 'Risk Level', 'Outstanding', 'Delay Probability'],
          rows: highRisk.map(r => [
            r.customer_name || r.customer_code,
            parseFloat(r.risk_score).toFixed(0) + '/100',
            r.risk_level,
            formatCurrency(parseFloat(r.total_outstanding) || 0),
            (parseFloat(r.payment_delay_probability) * 100).toFixed(0) + '%'
          ])
        }
      }
      // Fallback
      const atRisk = [...new Set(transactions.filter(t => t.payment_status === 'Overdue' || t.payment_status === 'Partial').map(t => t.customer_code))]
      const custMap = {}
      customers.forEach(c => { custMap[c.customer_code] = c.customer_name })
      return {
        title: 'At-Risk Customers (Overdue/Partial)',
        type: 'table',
        headers: ['Customer', 'Status'],
        rows: atRisk.slice(0, 10).map(code => [custMap[code] || code, 'Requires Follow-up'])
      }
    }

    if (activeDrilldown === 'inventory') {
      if (mlInventoryData && mlInventoryData.length > 0) {
        const atRisk = mlInventoryData
          .filter(i => parseFloat(i.stockout_probability) > 0.3)
          .sort((a, b) => parseFloat(b.stockout_probability) - parseFloat(a.stockout_probability))
        return {
          title: 'Products at Stockout Risk',
          type: 'table',
          headers: ['Product', 'Stockout Prob', 'Days Until Stockout', 'Recommendation'],
          rows: atRisk.map(i => [
            i.product_name || i.product_code,
            (parseFloat(i.stockout_probability) * 100).toFixed(0) + '%',
            Math.round(parseFloat(i.days_until_stockout)).toString(),
            i.recommendation || 'Reorder soon'
          ])
        }
      }
      return { title: 'Inventory Risk', type: 'message', content: 'Run AI predictions to see detailed stockout risk analysis.' }
    }

    if (activeDrilldown === 'cashflow') {
      if (mlCashFlowData && mlCashFlowData.length > 0) {
        return {
          title: 'Cash Flow Forecast Details',
          type: 'table',
          headers: ['Month', 'Most Likely', 'Best Case', 'Worst Case', 'Collection Rate'],
          rows: mlCashFlowData.map(cf => [
            cf.forecast_month.substring(0, 7),
            formatCurrency(parseFloat(cf.most_likely_inflow) || 0),
            formatCurrency(parseFloat(cf.best_case_inflow) || 0),
            formatCurrency(parseFloat(cf.worst_case_inflow) || 0),
            ((parseFloat(cf.collection_rate) || 0) * 100).toFixed(1) + '%'
          ])
        }
      }
      return { title: 'Cash Flow Prediction', type: 'message', content: 'Run AI predictions to see detailed cash flow forecasting.' }
    }

    return null
  }, [activeDrilldown, transactions, products, customers, mlRiskData, mlInventoryData, mlCashFlowData])

  // Category drilldown data for pie chart click
  const categoryDrilldownData = useMemo(() => {
    if (!selectedCategory) return null
    const productMap = {}
    products.forEach(p => { productMap[p.product_code] = p })
    const catTxns = transactions.filter(t => {
      const p = productMap[t.product_code]
      return p && p.category === selectedCategory
    })
    // Group by product within category
    const prodStats = {}
    catTxns.forEach(t => {
      const p = productMap[t.product_code]
      if (!prodStats[p.product_code]) prodStats[p.product_code] = { name: p.product_name, revenue: 0, qty: 0, orders: 0 }
      prodStats[p.product_code].revenue += parseFloat(t.total_amount) || 0
      prodStats[p.product_code].qty += parseFloat(t.quantity_liters) || 0
      prodStats[p.product_code].orders++
    })
    // Monthly trend for this category
    const monthlyTrend = {}
    catTxns.forEach(t => {
      const m = t.transaction_date.substring(0, 7)
      monthlyTrend[m] = (monthlyTrend[m] || 0) + (parseFloat(t.total_amount) || 0)
    })
    return {
      products: Object.values(prodStats).sort((a, b) => b.revenue - a.revenue),
      trend: Object.entries(monthlyTrend).sort(([a], [b]) => a.localeCompare(b)).map(([month, revenue]) => ({ month, revenue: Math.round(revenue) })),
      totalRevenue: catTxns.reduce((s, t) => s + (parseFloat(t.total_amount) || 0), 0),
      totalOrders: catTxns.length
    }
  }, [selectedCategory, transactions, products])

  // Customer drilldown data for scatter chart click
  const customerDrilldownData = useMemo(() => {
    if (!selectedCustomer) return null
    const custTxns = transactions.filter(t => t.customer_code === selectedCustomer.code)
    const productMap = {}
    products.forEach(p => { productMap[p.product_code] = p })
    // Recent transactions
    const recent = [...custTxns].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)).slice(0, 8)
    // Product mix
    const prodMix = {}
    custTxns.forEach(t => {
      const p = productMap[t.product_code]
      const name = p ? p.product_name : t.product_code
      prodMix[name] = (prodMix[name] || 0) + (parseFloat(t.total_amount) || 0)
    })
    // Payment status breakdown
    const payStatus = {}
    custTxns.forEach(t => {
      payStatus[t.payment_status] = (payStatus[t.payment_status] || 0) + 1
    })
    return {
      recentTxns: recent,
      productMix: Object.entries(prodMix).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value: Math.round(value) })),
      paymentStatus: payStatus,
      totalRevenue: custTxns.reduce((s, t) => s + (parseFloat(t.total_amount) || 0), 0),
      totalOutstanding: custTxns.reduce((s, t) => s + (parseFloat(t.outstanding_amount) || 0), 0),
      totalOrders: custTxns.length
    }
  }, [selectedCustomer, transactions, products])

  const COLORS = ['#1E3A8A', '#14B8A6', '#F59E0B', '#EF4444'];

  const handleKPIClick = (type) => {
    setSelectedCategory(null)
    setSelectedCustomer(null)
    setActiveDrilldown(activeDrilldown === type ? null : type)
  }

  const handlePieClick = (data) => {
    setActiveDrilldown(null)
    setSelectedCustomer(null)
    setSelectedCategory(selectedCategory === data.name ? null : data.name)
  }

  const handleScatterClick = (data) => {
    if (!data || !data.activePayload) return
    const customer = data.activePayload[0]?.payload
    if (!customer) return
    setActiveDrilldown(null)
    setSelectedCategory(null)
    setSelectedCustomer(selectedCustomer?.code === customer.code ? null : customer)
  }

  // KPI Card Component
  const KPICard = ({ icon: Icon, label, value, subtitle, color, drilldownType }) => (
    <div
      className={`kpi-card kpi-card-${color} cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg ${activeDrilldown === drilldownType ? 'ring-2 ring-purple-500 shadow-lg' : ''}`}
      onClick={() => handleKPIClick(drilldownType)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-3 rounded-lg ${
          color === 'green' ? 'bg-green-100' :
          color === 'amber' ? 'bg-yellow-100' : 'bg-red-100'
        }`}>
          <Icon className={`w-6 h-6 ${
            color === 'green' ? 'text-green-600' :
            color === 'amber' ? 'text-yellow-600' : 'text-red-600'
          }`} />
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${activeDrilldown === drilldownType ? 'rotate-180 text-purple-600' : ''}`} />
      </div>
      <div className="text-sm font-medium text-gray-600 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mb-1">{value}</div>
      {subtitle && <div className="text-sm text-gray-500">{subtitle}</div>}
      <div className="text-xs text-purple-500 mt-2 font-medium">Click to drill down</div>
    </div>
  );

  // Drilldown Panel Component
  const DrilldownPanel = ({ data }) => {
    if (!data) return null
    return (
      <div className="bg-white rounded-xl shadow-lg border border-purple-200 p-6 mb-6 animate-in slide-in-from-top">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-purple-900 flex items-center gap-2">
            <ArrowRight className="w-5 h-5 text-purple-600" />
            {data.title}
          </h3>
          <button onClick={() => setActiveDrilldown(null)} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        {data.type === 'message' ? (
          <p className="text-gray-600 text-sm">{data.content}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-purple-50">
                  {data.headers.map((h, i) => (
                    <th key={i} className={`py-3 px-4 text-sm font-semibold text-purple-900 ${i > 0 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, ri) => (
                  <tr key={ri} className="border-b hover:bg-purple-50 transition-colors">
                    {row.map((cell, ci) => (
                      <td key={ci} className={`py-3 px-4 text-sm ${ci > 0 ? 'text-right font-mono' : 'font-medium'}`}>
                        {cell === 'Critical' ? <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-semibold">{cell}</span> :
                         cell === 'Watch' ? <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold">{cell}</span> :
                         cell === 'High' ? <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-semibold">{cell}</span> :
                         cell === 'Medium' ? <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold">{cell}</span> :
                         cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <MLSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} predictionRun={predictionRun} />

      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Executive Dashboard</h1>
            <p className="text-gray-600">Click any card or chart element to drill down into details</p>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
          >
            <Settings className="w-4 h-4" />
            AI Settings
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <KPICard
          icon={DollarSign}
          label="Total Revenue (15M)"
          value={formatLargeNumber(kpis.totalRevenue)}
          subtitle="Year to Date"
          color={kpis.totalRevenue > 200000000 ? 'green' : 'amber'}
          drilldownType="revenue"
        />
        <KPICard
          icon={TrendingUp}
          label="Gross Margin"
          value={formatPercentage(kpis.grossMargin)}
          subtitle="Healthy margin"
          color={kpis.grossMargin > 25 ? 'green' : kpis.grossMargin > 15 ? 'amber' : 'red'}
          drilldownType="margin"
        />
        <KPICard
          icon={AlertTriangle}
          label="Outstanding Receivables"
          value={formatLargeNumber(kpis.outstanding)}
          subtitle={`${((kpis.outstanding / kpis.totalRevenue) * 100).toFixed(1)}% of revenue`}
          color={kpis.outstanding < 35000000 ? 'green' : kpis.outstanding < 40000000 ? 'amber' : 'red'}
          drilldownType="outstanding"
        />
        <KPICard
          icon={Users}
          label="High-Risk Customers"
          value={kpis.highRiskCustomers}
          subtitle="Require attention"
          color={kpis.highRiskCustomers < 5 ? 'green' : kpis.highRiskCustomers < 10 ? 'amber' : 'red'}
          drilldownType="risk"
        />
        <KPICard
          icon={Package}
          label={kpis.hasMLData ? "Products at Stockout Risk" : "Inventory at Risk"}
          value={kpis.hasMLData ? `${kpis.inventoryAtRisk} products` : formatLargeNumber(kpis.inventoryAtRisk)}
          subtitle={kpis.hasMLData ? "Stockout probability > 30%" : "Slow-moving stock"}
          color={kpis.hasMLData ? (kpis.inventoryAtRisk === 0 ? 'green' : kpis.inventoryAtRisk < 5 ? 'amber' : 'red') : (kpis.inventoryAtRisk < 5000000 ? 'green' : 'amber')}
          drilldownType="inventory"
        />
        <KPICard
          icon={Activity}
          label="Predicted Cash Inflow"
          value={formatLargeNumber(kpis.predictedCashInflow)}
          subtitle="Next month (Feb 2026)"
          color="green"
          drilldownType="cashflow"
        />
      </div>

      {/* KPI Drilldown Panel */}
      {drilldownData && <DrilldownPanel data={drilldownData} />}

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Revenue Trend */}
        <div className="chart-container">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Revenue Trend</h3>
            <button
              onClick={() => setShowPrediction(!showPrediction)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                showPrediction
                  ? 'bg-primary text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {showPrediction ? 'Show Actual' : 'Show Forecast'}
            </button>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => value.substring(5)}
              />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => formatLargeNumber(value)} />
              <Tooltip
                formatter={(value) => formatCurrency(value)}
                labelFormatter={(label) => `Month: ${label}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#1E3A8A"
                strokeWidth={2}
                name="Actual Revenue"
                dot={{ r: 4 }}
              />
              {showPrediction && (
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="#14B8A6"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="AI Forecast"
                  dot={{ r: 4 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Profitability by Category — CLICKABLE */}
        <div className="chart-container">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Profitability by Product Category</h3>
            {selectedCategory && (
              <button
                onClick={() => setSelectedCategory(null)}
                className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear selection
              </button>
            )}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
                onClick={handlePieClick}
                cursor="pointer"
              >
                {categoryData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                    opacity={selectedCategory && selectedCategory !== entry.name ? 0.3 : 1}
                    stroke={selectedCategory === entry.name ? '#7C3AED' : 'none'}
                    strokeWidth={selectedCategory === entry.name ? 3 : 0}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(value)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="text-xs text-purple-500 text-center mt-1 font-medium">Click a slice to see product details</div>
        </div>
      </div>

      {/* Category Drilldown Panel */}
      {selectedCategory && categoryDrilldownData && (
        <div className="bg-white rounded-xl shadow-lg border border-purple-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-purple-900 flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-purple-600" />
              {selectedCategory} — Category Breakdown
            </h3>
            <button onClick={() => setSelectedCategory(null)} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-3 bg-blue-50 rounded-lg text-center">
              <div className="text-xs text-gray-500">Total Revenue</div>
              <div className="text-lg font-bold text-blue-900">{formatLargeNumber(categoryDrilldownData.totalRevenue)}</div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-center">
              <div className="text-xs text-gray-500">Total Orders</div>
              <div className="text-lg font-bold text-green-900">{categoryDrilldownData.totalOrders}</div>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg text-center">
              <div className="text-xs text-gray-500">Products</div>
              <div className="text-lg font-bold text-purple-900">{categoryDrilldownData.products.length}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Product table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-purple-50">
                    <th className="text-left py-2 px-3 text-sm font-semibold text-purple-900">Product</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-purple-900">Revenue</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-purple-900">Orders</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-purple-900">Qty (L)</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryDrilldownData.products.map((p, i) => (
                    <tr key={i} className="border-b hover:bg-purple-50">
                      <td className="py-2 px-3 text-sm font-medium">{p.name}</td>
                      <td className="py-2 px-3 text-sm text-right font-mono">{formatCurrency(p.revenue)}</td>
                      <td className="py-2 px-3 text-sm text-right">{p.orders}</td>
                      <td className="py-2 px-3 text-sm text-right">{Math.round(p.qty).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Monthly trend chart */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Monthly Trend — {selectedCategory}</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={categoryDrilldownData.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v) => v.substring(5)} />
                  <YAxis tickFormatter={(v) => formatLargeNumber(v)} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => formatCurrency(v)} />
                  <Bar dataKey="revenue" fill="#7C3AED" name="Revenue" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Top Customers - Risk vs Revenue — CLICKABLE */}
        <div className="chart-container">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Top 10 Customers – Risk vs Revenue</h3>
            {selectedCustomer && (
              <button
                onClick={() => setSelectedCustomer(null)}
                className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear selection
              </button>
            )}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }} onClick={handleScatterClick}>
              <CartesianGrid />
              <XAxis
                type="number"
                dataKey="revenue"
                name="Revenue"
                tickFormatter={(value) => formatLargeNumber(value)}
                label={{ value: 'Revenue', position: 'insideBottom', offset: -10 }}
              />
              <YAxis
                type="number"
                dataKey="riskScore"
                name="Risk Score"
                domain={[0, 100]}
                label={{ value: 'Payment Risk Score', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(value, name) => {
                  if (name === 'Revenue') return formatCurrency(value);
                  if (name === 'Risk Score') return value.toFixed(0);
                  return formatCurrency(value);
                }}
                labelFormatter={(label, payload) => {
                  if (payload && payload[0]) return payload[0].payload.name;
                  return label;
                }}
              />
              <Scatter name="Customers" data={topCustomers} fill="#1E3A8A" cursor="pointer">
                {topCustomers.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.riskScore > 60 ? '#EF4444' : entry.riskScore > 30 ? '#F59E0B' : '#22C55E'}
                    opacity={selectedCustomer && selectedCustomer.code !== entry.code ? 0.3 : 1}
                    stroke={selectedCustomer?.code === entry.code ? '#7C3AED' : 'none'}
                    strokeWidth={selectedCustomer?.code === entry.code ? 3 : 0}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <div className="text-xs text-purple-500 text-center mt-1 font-medium">Click a dot to see customer details</div>
        </div>

        {/* AI Insights */}
        <div className="chart-container">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">AI Insights</h3>
            {kpis.hasMLData && (
              <span className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 text-xs font-semibold rounded-full">
                <Bot className="w-3 h-3" /> AI-Powered
              </span>
            )}
          </div>
          <div className="space-y-3">
            {insights.map((insight, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border-l-4 ${
                  insight.type === 'success'
                    ? 'bg-green-50 border-green-500'
                    : insight.type === 'warning'
                    ? 'bg-yellow-50 border-yellow-500'
                    : 'bg-blue-50 border-blue-500'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <Bot
                    className={`w-5 h-5 mt-0.5 ${
                      insight.type === 'success'
                        ? 'text-green-600'
                        : insight.type === 'warning'
                        ? 'text-yellow-600'
                        : 'text-blue-600'
                    }`}
                  />
                  <p className="text-sm text-gray-700">{insight.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Customer Drilldown Panel */}
      {selectedCustomer && customerDrilldownData && (
        <div className="bg-white rounded-xl shadow-lg border border-purple-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-purple-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              {selectedCustomer.name} — Customer Details
            </h3>
            <button onClick={() => setSelectedCustomer(null)} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Customer KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="p-3 bg-blue-50 rounded-lg text-center">
              <div className="text-xs text-gray-500">Total Revenue</div>
              <div className="text-lg font-bold text-blue-900">{formatLargeNumber(customerDrilldownData.totalRevenue)}</div>
            </div>
            <div className="p-3 bg-red-50 rounded-lg text-center">
              <div className="text-xs text-gray-500">Outstanding</div>
              <div className="text-lg font-bold text-red-900">{formatLargeNumber(customerDrilldownData.totalOutstanding)}</div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-center">
              <div className="text-xs text-gray-500">Total Orders</div>
              <div className="text-lg font-bold text-green-900">{customerDrilldownData.totalOrders}</div>
            </div>
            <div className="p-3 bg-yellow-50 rounded-lg text-center">
              <div className="text-xs text-gray-500">Risk Score</div>
              <div className="text-lg font-bold text-yellow-900">{selectedCustomer.riskScore}/100</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Product Mix */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Product Mix</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={customerDrilldownData.productMix.slice(0, 6)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => formatLargeNumber(v)} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => formatCurrency(v)} />
                  <Bar dataKey="value" fill="#1E3A8A" name="Revenue" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Recent Transactions */}
            <div className="overflow-x-auto">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Recent Transactions</h4>
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-600">Date</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-gray-600">Amount</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customerDrilldownData.recentTxns.map((t, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2 px-3 text-xs">{t.transaction_date}</td>
                      <td className="py-2 px-3 text-xs text-right font-mono">{formatCurrency(parseFloat(t.total_amount))}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          t.payment_status === 'Paid' ? 'bg-green-100 text-green-800' :
                          t.payment_status === 'Overdue' ? 'bg-red-100 text-red-800' :
                          t.payment_status === 'Partial' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>{t.payment_status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment Status Summary */}
          <div className="mt-4 flex gap-3">
            {Object.entries(customerDrilldownData.paymentStatus).map(([status, count]) => (
              <div key={status} className={`px-3 py-2 rounded-lg text-sm font-medium ${
                status === 'Paid' ? 'bg-green-100 text-green-800' :
                status === 'Overdue' ? 'bg-red-100 text-red-800' :
                status === 'Partial' ? 'bg-yellow-100 text-yellow-800' :
                'bg-blue-100 text-blue-800'
              }`}>
                {status}: {count}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
