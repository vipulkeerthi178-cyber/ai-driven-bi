import { useState, useMemo, useEffect, useCallback } from 'react'
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter } from 'recharts'
import { TrendingUp, DollarSign, AlertTriangle, Package, Users, Activity, Bot, Settings, X, Clock, RefreshCw } from 'lucide-react'
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
        setMessage(`ML pipeline completed: ${data.total_predictions} predictions generated. Refresh page to see results.`)
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
            <h2 className="text-lg font-semibold">ML Prediction Settings</h2>
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
                <strong>Last ML Run:</strong> {new Date(predictionRun.run_at).toLocaleString()}
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
              ML predictions will auto-run every {intervalHours} hour{intervalHours > 1 ? 's' : ''}
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

  // Calculate KPIs
  const kpis = useMemo(() => {
    const totalRevenue = transactions.reduce((sum, t) => sum + (t.total_amount || 0), 0)
    const totalOutstanding = transactions.reduce((sum, t) => sum + (t.outstanding_amount || 0), 0)
    const totalCost = transactions.reduce((sum, t) => {
      const product = products.find(p => p.product_code === t.product_code)
      return sum + (product ? (product.cost_price || 0) * (t.quantity_liters || 0) : 0)
    }, 0)

    const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0

    // High-risk customers from ML or fallback
    const highRiskCustomers = mlRiskData && mlRiskData.length > 0
      ? mlRiskData.filter(r => r.risk_level === 'High').length
      : new Set(
          transactions.filter(t => t.payment_status === 'Overdue' || t.payment_status === 'Partial').map(t => t.customer_code)
        ).size

    // Predicted cash inflow from ML or fallback
    let predictedCashInflow
    if (mlCashFlowData && mlCashFlowData.length > 0) {
      predictedCashInflow = parseFloat(mlCashFlowData[0].most_likely_inflow) || 0
    } else {
      const grouped = groupByMonth(transactions)
      predictedCashInflow = (grouped.slice(-1)[0]?.revenue || 0) * 1.1
    }

    // Inventory at risk from ML stockout data or fallback
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
      outstanding: totalOutstanding,
      highRiskCustomers,
      inventoryAtRisk,
      predictedCashInflow,
      hasMLData: !!(mlRiskData?.length || mlCashFlowData?.length || mlInventoryData?.length)
    }
  }, [transactions, products, mlRiskData, mlCashFlowData, mlInventoryData])

  // Monthly revenue data — use ML predictions when available
  const monthlyData = useMemo(() => {
    const grouped = groupByMonth(transactions)

    if (grouped.length > 0) {
      // Try ML predictions first
      if (mlDemandData && mlDemandData.length > 0) {
        // Aggregate ML demand predictions by month → total predicted revenue
        const mlMonthly = {}
        mlDemandData.forEach(p => {
          const month = p.prediction_month.substring(0, 7)
          if (!mlMonthly[month]) mlMonthly[month] = 0
          mlMonthly[month] += parseFloat(p.predicted_revenue) || 0
        })

        const predictions = Object.entries(mlMonthly)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, revenue]) => ({
            month,
            revenue: 0,
            predicted: Math.round(revenue),
            isPrediction: true,
            isML: true
          }))

        return [...grouped, ...predictions]
      }

      // Fallback: hardcoded growth
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
          isPrediction: true,
          isML: false
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

  // AI Insights — powered by ML prediction data
  const insights = useMemo(() => {
    return generateAIInsights(transactions, customers, {
      riskScores: mlRiskData,
      demandPredictions: mlDemandData,
      cashFlowForecasts: mlCashFlowData,
      inventoryForecasts: mlInventoryData
    })
  }, [transactions, customers, mlRiskData, mlDemandData, mlCashFlowData, mlInventoryData])

  const COLORS = ['#1E3A8A', '#14B8A6', '#F59E0B', '#EF4444'];

  // KPI Card Component
  const KPICard = ({ icon: Icon, label, value, subtitle, color }) => (
    <div className={`kpi-card kpi-card-${color}`}>
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
      </div>
      <div className="text-sm font-medium text-gray-600 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mb-1">{value}</div>
      {subtitle && <div className="text-sm text-gray-500">{subtitle}</div>}
    </div>
  );

  return (
    <div>
      <MLSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} predictionRun={predictionRun} />

      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Executive Dashboard</h1>
            <p className="text-gray-600">Business health, risks, and growth at a glance</p>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
          >
            <Settings className="w-4 h-4" />
            ML Settings
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <KPICard
          icon={DollarSign}
          label="Total Revenue (15M)"
          value={formatLargeNumber(kpis.totalRevenue)}
          subtitle="Year to Date"
          color={kpis.totalRevenue > 200000000 ? 'green' : 'amber'}
        />
        <KPICard
          icon={TrendingUp}
          label="Gross Margin"
          value={formatPercentage(kpis.grossMargin)}
          subtitle="Healthy margin"
          color={kpis.grossMargin > 25 ? 'green' : kpis.grossMargin > 15 ? 'amber' : 'red'}
        />
        <KPICard
          icon={AlertTriangle}
          label="Outstanding Receivables"
          value={formatLargeNumber(kpis.outstanding)}
          subtitle={`${((kpis.outstanding / kpis.totalRevenue) * 100).toFixed(1)}% of revenue`}
          color={kpis.outstanding < 35000000 ? 'green' : kpis.outstanding < 40000000 ? 'amber' : 'red'}
        />
        <KPICard
          icon={Users}
          label="High-Risk Customers"
          value={kpis.highRiskCustomers}
          subtitle="Require attention"
          color={kpis.highRiskCustomers < 5 ? 'green' : kpis.highRiskCustomers < 10 ? 'amber' : 'red'}
        />
        <KPICard
          icon={Package}
          label={kpis.hasMLData ? "Products at Stockout Risk" : "Inventory at Risk"}
          value={kpis.hasMLData ? `${kpis.inventoryAtRisk} products` : formatLargeNumber(kpis.inventoryAtRisk)}
          subtitle={kpis.hasMLData ? "Stockout probability > 30%" : "Slow-moving stock"}
          color={kpis.hasMLData ? (kpis.inventoryAtRisk === 0 ? 'green' : kpis.inventoryAtRisk < 5 ? 'amber' : 'red') : (kpis.inventoryAtRisk < 5000000 ? 'green' : 'amber')}
        />
        <KPICard
          icon={Activity}
          label="Predicted Cash Inflow"
          value={formatLargeNumber(kpis.predictedCashInflow)}
          subtitle="Next month (Feb 2026)"
          color="green"
        />
      </div>

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
                tickFormatter={(value) => value.substring(5)} // Show only MM
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

        {/* Profitability by Category */}
        <div className="chart-container">
          <h3 className="text-lg font-semibold mb-4">Profitability by Product Category</h3>
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
              >
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Top Customers - Risk vs Revenue */}
        <div className="chart-container">
          <h3 className="text-lg font-semibold mb-4">Top 10 Customers – Risk vs Revenue</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
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
                  if (payload && payload[0]) {
                    return payload[0].payload.name;
                  }
                  return label;
                }}
              />
              <Scatter name="Customers" data={topCustomers} fill="#1E3A8A">
                {topCustomers.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.riskScore > 60 ? '#EF4444' : entry.riskScore > 30 ? '#F59E0B' : '#22C55E'}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <div className="mt-2 text-xs text-gray-500 text-center">
            Bubble size represents outstanding amount
          </div>
        </div>

        {/* AI Insights */}
        <div className="chart-container">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">AI Insights</h3>
            {kpis.hasMLData && (
              <span className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 text-xs font-semibold rounded-full">
                <Bot className="w-3 h-3" /> ML-Powered
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
    </div>
  );
}
