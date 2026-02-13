import { useState, useMemo } from 'react';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, Package, MapPin, Calendar, Bot } from 'lucide-react';
import { useTransactions } from '../hooks/useTransactions';
import { useProducts } from '../hooks/useProducts';
import { usePredictionRun, useMLDemand } from '../hooks/usePredictions';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorAlert from '../components/ErrorAlert';
import { formatCurrency, formatLargeNumber } from '../utils/dataProcessing';

export default function SalesIntelligence() {
  const { data: transactionsData, isLoading: loadingTxn, error: errorTxn, refetch } = useTransactions();
  const { data: productsData, isLoading: loadingProd, error: errorProd } = useProducts();
  const { data: predictionRun } = usePredictionRun();
  const { data: mlDemandData } = useMLDemand(predictionRun?.id);

  if (loadingTxn || loadingProd) {
    return <LoadingSpinner message="Loading sales data..." />;
  }
  if (errorTxn || errorProd) {
    return <ErrorAlert error={errorTxn || errorProd} retry={refetch} title="Failed to Load Sales Data" />;
  }
  if (!transactionsData || !productsData) {
    return <LoadingSpinner message="Loading sales data..." />;
  }

  return <SalesIntelligenceContent transactionsData={transactionsData} productsData={productsData} mlDemandData={mlDemandData} predictionRun={predictionRun} />;
}

function SalesIntelligenceContent({ transactionsData, productsData, mlDemandData, predictionRun }) {
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedPeriod, setSelectedPeriod] = useState('12');

  // Filter transactions based on selections
  const filteredTransactions = useMemo(() => {
    let filtered = transactionsData;

    if (selectedRegion !== 'All') {
      filtered = filtered.filter(t => t.region === selectedRegion);
    }

    if (selectedCategory !== 'All') {
      const productCodesInCategory = productsData
        .filter(p => p.category === selectedCategory)
        .map(p => p.product_code);
      filtered = filtered.filter(t => productCodesInCategory.includes(t.product_code));
    }

    // Filter by period (last N months)
    const monthsAgo = parseInt(selectedPeriod);
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsAgo);
    filtered = filtered.filter(t => new Date(t.transaction_date) >= cutoffDate);

    return filtered;
  }, [selectedRegion, selectedCategory, selectedPeriod, transactionsData, productsData]);

  // Sales by Region
  const salesByRegion = useMemo(() => {
    const regionStats = {};

    transactionsData.forEach(t => {
      const region = t.region || 'Unknown';
      if (!regionStats[region]) {
        regionStats[region] = { revenue: 0, count: 0 };
      }
      regionStats[region].revenue += parseFloat(t.total_amount) || 0;
      regionStats[region].count += 1;
    });

    return Object.entries(regionStats)
      .map(([region, stats]) => ({
        region,
        revenue: Math.round(stats.revenue),
        transactions: stats.count
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [transactionsData]);

  // Sales by Salesperson
  const salesBySalesperson = useMemo(() => {
    const salesStats = {};

    filteredTransactions.forEach(t => {
      const person = t.salesperson || 'Unassigned';
      if (!salesStats[person]) {
        salesStats[person] = { revenue: 0, count: 0 };
      }
      salesStats[person].revenue += parseFloat(t.total_amount) || 0;
      salesStats[person].count += 1;
    });

    return Object.entries(salesStats)
      .map(([name, stats]) => ({
        name,
        revenue: Math.round(stats.revenue),
        transactions: stats.count,
        avgDeal: Math.round(stats.revenue / stats.count)
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredTransactions]);

  // Product-wise Sales Trend
  const productSalesTrend = useMemo(() => {
    const monthlyByProduct = {};

    filteredTransactions.forEach(t => {
      const month = t.transaction_date.substring(0, 7);
      const product = productsData.find(p => p.product_code === t.product_code);
      const category = product ? product.category : 'Unknown';

      if (!monthlyByProduct[month]) {
        monthlyByProduct[month] = {};
      }

      if (!monthlyByProduct[month][category]) {
        monthlyByProduct[month][category] = 0;
      }

      monthlyByProduct[month][category] += parseFloat(t.total_amount) || 0;
    });

    return Object.entries(monthlyByProduct)
      .map(([month, categories]) => ({
        month,
        ...categories
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredTransactions, productsData]);

  // Demand Prediction — use ML data if available, else fallback
  const demandPrediction = useMemo(() => {
    // ML-powered predictions
    if (mlDemandData && mlDemandData.length > 0) {
      // Group ML predictions by product (take next month only for the table)
      const productPredictions = {};
      mlDemandData.forEach(p => {
        const code = p.product_code;
        if (!code) return;
        if (!productPredictions[code]) {
          productPredictions[code] = {
            productName: p.product_name,
            category: p.category,
            predictedNextMonth: Math.round(parseFloat(p.predicted_quantity) || 0),
            predictedRevenue: Math.round(parseFloat(p.predicted_revenue) || 0),
            confidence: Math.round((parseFloat(p.confidence_score) || 0) * 100),
            trend: p.trend_direction === 'up' ? 'up' : 'down',
            growthRate: parseFloat(p.growth_rate) || 0,
            model: p.model_used,
            isML: true
          };
        }
      });

      // Calculate avg monthly sale from transaction data for each product
      productsData.forEach(product => {
        if (productPredictions[product.product_code]) {
          const productTxns = transactionsData.filter(t => t.product_code === product.product_code);
          const totalQty = productTxns.reduce((sum, t) => sum + (parseFloat(t.quantity_liters) || 0), 0);
          const months = new Set(productTxns.map(t => t.transaction_date.substring(0, 7))).size || 1;
          productPredictions[product.product_code].avgMonthlySale = Math.round(totalQty / months);
        }
      });

      return Object.values(productPredictions)
        .sort((a, b) => b.avgMonthlySale - a.avgMonthlySale)
        .slice(0, 10);
    }

    // Fallback: client-side calculation
    const productStats = {};
    productsData.forEach(product => {
      const productTxns = transactionsData.filter(t => t.product_code === product.product_code);
      if (productTxns.length > 0) {
        const totalQty = productTxns.reduce((sum, t) => sum + (parseFloat(t.quantity_liters) || 0), 0);
        const months = new Set(productTxns.map(t => t.transaction_date.substring(0, 7))).size;
        const avgMonthly = totalQty / months;
        const sortedTxns = [...productTxns].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
        const midpoint = Math.floor(sortedTxns.length / 2);
        const firstHalfAvg = sortedTxns.slice(0, midpoint).reduce((s, t) => s + (parseFloat(t.quantity_liters) || 0), 0) / midpoint;
        const secondHalfAvg = sortedTxns.slice(midpoint).reduce((s, t) => s + (parseFloat(t.quantity_liters) || 0), 0) / (sortedTxns.length - midpoint);
        const growthFactor = firstHalfAvg > 0 ? Math.min(Math.max(secondHalfAvg / firstHalfAvg, 0.85), 1.25) : 1.1;
        productStats[product.product_code] = {
          productName: product.product_name,
          category: product.category,
          avgMonthlySale: Math.round(avgMonthly),
          predictedNextMonth: Math.round(avgMonthly * growthFactor),
          confidence: Math.min(95, Math.round(70 + (productTxns.length / transactionsData.length) * 500)),
          trend: growthFactor > 1 ? 'up' : 'down',
          isML: false
        };
      }
    });
    return Object.values(productStats).sort((a, b) => b.avgMonthlySale - a.avgMonthlySale).slice(0, 10);
  }, [transactionsData, productsData, mlDemandData]);

  // KPIs
  const kpis = useMemo(() => {
    const totalRevenue = filteredTransactions.reduce((sum, t) => sum + (parseFloat(t.total_amount) || 0), 0);
    const totalTransactions = filteredTransactions.length;
    const avgDealSize = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
    const uniqueCustomers = new Set(filteredTransactions.map(t => t.customer_code)).size;

    return {
      totalRevenue,
      totalTransactions,
      avgDealSize,
      uniqueCustomers
    };
  }, [filteredTransactions]);

  const regions = useMemo(() => ['All', ...new Set(transactionsData.map(t => t.region).filter(Boolean))], [transactionsData]);
  const categories = useMemo(() => ['All', ...new Set(productsData.map(p => p.category).filter(Boolean))], [productsData]);
  const periods = [
    { value: '3', label: 'Last 3 Months' },
    { value: '6', label: 'Last 6 Months' },
    { value: '12', label: 'Last 12 Months' },
    { value: '999', label: 'All Time' }
  ];

  const COLORS = ['#1E3A8A', '#14B8A6', '#F59E0B', '#EF4444'];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Sales Intelligence & Demand Prediction</h1>
        <p className="text-gray-600">Comprehensive sales analytics and future demand forecasting</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Calendar className="w-5 h-5 mr-2" />
          Filters
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Region</label>
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              {regions.map(region => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Product Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Time Period</label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              {periods.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-primary">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-8 h-8 text-primary" />
          </div>
          <div className="text-sm text-gray-600 mb-1">Total Revenue</div>
          <div className="text-2xl font-bold">{formatLargeNumber(kpis.totalRevenue)}</div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-secondary">
          <div className="flex items-center justify-between mb-2">
            <Package className="w-8 h-8 text-secondary" />
          </div>
          <div className="text-sm text-gray-600 mb-1">Total Orders</div>
          <div className="text-2xl font-bold">{kpis.totalTransactions.toLocaleString()}</div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-warning">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-8 h-8 text-warning" />
          </div>
          <div className="text-sm text-gray-600 mb-1">Active Customers</div>
          <div className="text-2xl font-bold">{kpis.uniqueCustomers}</div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-success">
          <div className="flex items-center justify-between mb-2">
            <MapPin className="w-8 h-8 text-success" />
          </div>
          <div className="text-sm text-gray-600 mb-1">Avg Deal Size</div>
          <div className="text-2xl font-bold">{formatLargeNumber(kpis.avgDealSize)}</div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Sales by Region */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Sales by Region</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={salesByRegion}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="region" />
              <YAxis tickFormatter={(value) => formatLargeNumber(value)} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="revenue" fill="#1E3A8A" name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Salesperson Leaderboard */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Salesperson Leaderboard</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">#</th>
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Name</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-gray-700">Revenue</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-gray-700">Orders</th>
                  <th className="text-right py-2 px-3 text-sm font-semibold text-gray-700">Avg Deal</th>
                </tr>
              </thead>
              <tbody>
                {salesBySalesperson.slice(0, 5).map((person, idx) => (
                  <tr key={person.name} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3 text-sm">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        idx === 0 ? 'bg-yellow-100 text-yellow-800' :
                        idx === 1 ? 'bg-gray-100 text-gray-800' :
                        idx === 2 ? 'bg-orange-100 text-orange-800' :
                        'bg-blue-50 text-blue-800'
                      }`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-sm font-medium">{person.name}</td>
                    <td className="py-2 px-3 text-sm text-right">{formatLargeNumber(person.revenue)}</td>
                    <td className="py-2 px-3 text-sm text-right">{person.transactions}</td>
                    <td className="py-2 px-3 text-sm text-right">{formatLargeNumber(person.avgDeal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Product-wise Sales Trend */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Product-wise Sales Trend</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={productSalesTrend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(value) => formatLargeNumber(value)} />
            <Tooltip formatter={(value) => formatCurrency(value)} />
            <Legend />
            <Area type="monotone" dataKey="Engine Oil" stackId="1" stroke={COLORS[0]} fill={COLORS[0]} />
            <Area type="monotone" dataKey="Industrial Lubricants" stackId="1" stroke={COLORS[1]} fill={COLORS[1]} />
            <Area type="monotone" dataKey="Grease" stackId="1" stroke={COLORS[2]} fill={COLORS[2]} />
            <Area type="monotone" dataKey="Specialty Oils" stackId="1" stroke={COLORS[3]} fill={COLORS[3]} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Demand Prediction */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">AI Demand Prediction - Top 10 Products</h3>
          {demandPrediction[0]?.isML && (
            <span className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 text-xs font-semibold rounded-full">
              <Bot className="w-3 h-3" /> AI-Powered (Linear Regression)
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Product</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Category</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Avg Monthly Sale</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Predicted Next Month</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Confidence</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Trend</th>
              </tr>
            </thead>
            <tbody>
              {demandPrediction.map((item, idx) => (
                <tr key={idx} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-medium">{item.productName}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{item.category}</td>
                  <td className="py-3 px-4 text-sm text-right">{item.avgMonthlySale.toLocaleString()} L</td>
                  <td className="py-3 px-4 text-sm text-right font-semibold text-primary">
                    {item.predictedNextMonth.toLocaleString()} L
                  </td>
                  <td className="py-3 px-4 text-sm text-right">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      item.confidence >= 85 ? 'bg-green-100 text-green-800' :
                      item.confidence >= 75 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {item.confidence}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {item.trend === 'up' ? (
                      <TrendingUp className="w-5 h-5 text-green-600 inline" />
                    ) : (
                      <TrendingUp className="w-5 h-5 text-red-600 inline transform rotate-180" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
          <p className="text-sm text-gray-700">
            {demandPrediction[0]?.isML ? (
              <>
                <strong>AI Insight:</strong> Predictions generated using Linear Regression (least squares) on {transactionsData.length.toLocaleString()} historical transactions.
                R² confidence reflects how well the model fits each product's demand pattern.
                {predictionRun && <span className="text-gray-500"> Last run: {new Date(predictionRun.run_at).toLocaleString()}</span>}
              </>
            ) : (
              <>
                <strong>AI Insight:</strong> Predictions based on historical trend analysis. Run <code>npm run predict</code> to enable AI-powered forecasting.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
