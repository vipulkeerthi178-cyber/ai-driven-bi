import { useState, useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Package, TrendingDown, AlertTriangle, CheckCircle, ArrowUp, ArrowDown, Bot, X, ChevronDown, Eye } from 'lucide-react';
import { useTransactions } from '../hooks/useTransactions';
import { useProducts } from '../hooks/useProducts';
import { useInventory } from '../hooks/useInventory';
import { usePredictionRun, useMLInventory } from '../hooks/usePredictions';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorAlert from '../components/ErrorAlert';
import { formatLargeNumber, formatCurrency } from '../utils/dataProcessing';

export default function InventoryManagement() {
  const { data: transactionsData, isLoading: loadingTxn, error: errorTxn, refetch } = useTransactions();
  const { data: productsData, isLoading: loadingProd, error: errorProd } = useProducts();
  const { data: inventoryDataRaw, isLoading: loadingInv, error: errorInv } = useInventory();
  const { data: predictionRun } = usePredictionRun();
  const { data: mlInventoryData } = useMLInventory(predictionRun?.id);

  if (loadingTxn || loadingProd || loadingInv) {
    return <LoadingSpinner message="Loading inventory data..." />;
  }
  if (errorTxn || errorProd || errorInv) {
    return <ErrorAlert error={errorTxn || errorProd || errorInv} retry={refetch} title="Failed to Load Inventory Data" />;
  }
  if (!transactionsData || !productsData || !inventoryDataRaw) {
    return <LoadingSpinner message="Loading inventory data..." />;
  }

  return <InventoryContent transactionsData={transactionsData} productsData={productsData} inventoryData={inventoryDataRaw} mlInventoryData={mlInventoryData} predictionRun={predictionRun} />;
}

function InventoryContent({ transactionsData, productsData, inventoryData, mlInventoryData }) {
  const hasMLData = mlInventoryData && mlInventoryData.length > 0;
  const [activeFilter, setActiveFilter] = useState(null) // 'all' | 'slow' | 'fast' | 'stockout'
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedAging, setSelectedAging] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [riskFilter, setRiskFilter] = useState('All')

  // Build ML lookup by product_code
  const mlLookup = useMemo(() => {
    if (!hasMLData) return {};
    const lookup = {};
    mlInventoryData.forEach(ml => {
      if (ml.product_code) lookup[ml.product_code] = ml;
    });
    return lookup;
  }, [mlInventoryData, hasMLData]);

  // Calculate inventory metrics
  const inventoryMetrics = useMemo(() => {
    const productMap = {};
    productsData.forEach(p => { productMap[p.product_code] = p; });
    const inventoryMap = {};
    inventoryData.forEach(inv => { inventoryMap[inv.product_code] = inv; });

    const salesVelocity = {};
    transactionsData.forEach(t => {
      if (!salesVelocity[t.product_code]) {
        salesVelocity[t.product_code] = { totalQty: 0, count: 0, lastSaleDate: null };
      }
      salesVelocity[t.product_code].totalQty += parseFloat(t.quantity_liters) || 0;
      salesVelocity[t.product_code].count++;
      if (!salesVelocity[t.product_code].lastSaleDate || t.transaction_date > salesVelocity[t.product_code].lastSaleDate) {
        salesVelocity[t.product_code].lastSaleDate = t.transaction_date;
      }
    });

    return productsData.map(product => {
      const inventory = inventoryMap[product.product_code] || { current_stock_liters: 0, reserved_stock: 0, reorder_point: 1000 };
      const velocity = salesVelocity[product.product_code] || { totalQty: 0, count: 0 };
      const months = 15;
      const avgMonthlySale = velocity.totalQty / months;
      const currentStock = parseFloat(inventory.current_stock_liters) || 0;
      const availableStock = currentStock - (parseFloat(inventory.reserved_stock) || 0);
      const daysOfInventory = avgMonthlySale > 0 ? (currentStock / avgMonthlySale) * 30 : 999;

      let agingCategory = '0-30 days';
      if (daysOfInventory > 90) agingCategory = '90+ days';
      else if (daysOfInventory > 60) agingCategory = '61-90 days';
      else if (daysOfInventory > 30) agingCategory = '31-60 days';

      const reorderPoint = parseFloat(inventory.reorder_point) || 1000;
      let stockoutRisk = 'Low';
      if (currentStock < reorderPoint) stockoutRisk = 'High';
      else if (currentStock < reorderPoint * 1.5) stockoutRisk = 'Medium';

      const mlData = mlLookup[product.product_code];
      let volatility = 'Low';
      let safetyStock = 0;
      let mlReorderPoint = reorderPoint;
      let stockoutProb = 0;

      if (mlData) {
        volatility = mlData.volatility_level || 'Low';
        safetyStock = parseFloat(mlData.safety_stock) || 0;
        mlReorderPoint = parseFloat(mlData.reorder_point_ml) || reorderPoint;
        stockoutProb = parseFloat(mlData.stockout_probability) || 0;
      } else if (velocity.count > 0) {
        const monthlyQtys = {};
        transactionsData.filter(t => t.product_code === product.product_code).forEach(t => {
          const m = t.transaction_date.substring(0, 7);
          monthlyQtys[m] = (monthlyQtys[m] || 0) + (parseFloat(t.quantity_liters) || 0);
        });
        const values = Object.values(monthlyQtys);
        if (values.length > 1) {
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
          const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
          if (cv > 0.5) volatility = 'High';
          else if (cv > 0.25) volatility = 'Medium';
        }
      }

      let recommendation = '';
      if (mlData && mlData.recommendation) {
        recommendation = mlData.recommendation;
      } else if (daysOfInventory > 90) {
        recommendation = `Reduce stock by ${Math.round((currentStock - avgMonthlySale * 2) / 100) * 100} L - slow moving`;
      } else if (stockoutRisk === 'High') {
        recommendation = `Urgent: Reorder ${Math.round((reorderPoint * 2 - currentStock) / 100) * 100} L immediately`;
      } else if (stockoutRisk === 'Medium') {
        recommendation = `Plan reorder of ${Math.round(avgMonthlySale * 1.5 / 100) * 100} L within 2 weeks`;
      } else {
        recommendation = 'Stock levels optimal - maintain current levels';
      }

      const stockValue = currentStock * (parseFloat(product.selling_price) || 0);

      return {
        productCode: product.product_code,
        productName: product.product_name,
        category: product.category,
        currentStock, availableStock,
        reservedStock: parseFloat(inventory.reserved_stock) || 0,
        avgMonthlySale: Math.round(avgMonthlySale),
        daysOfInventory: Math.round(daysOfInventory),
        agingCategory, stockoutRisk, volatility, recommendation, stockValue,
        sellingPrice: parseFloat(product.selling_price) || 0,
        reorderPoint: mlData ? mlReorderPoint : reorderPoint,
        safetyStock, stockoutProb, isML: !!mlData
      };
    }).sort((a, b) => b.stockValue - a.stockValue);
  }, [transactionsData, productsData, inventoryData, mlLookup]);

  // Filtered inventory based on KPI card click, aging selection, category & risk filters
  const filteredMetrics = useMemo(() => {
    let filtered = inventoryMetrics;
    if (activeFilter === 'slow') filtered = filtered.filter(i => i.daysOfInventory > 90);
    else if (activeFilter === 'fast') filtered = filtered.filter(i => i.avgMonthlySale > 1000);
    else if (activeFilter === 'stockout') filtered = filtered.filter(i => i.stockoutRisk === 'High');
    if (selectedAging) filtered = filtered.filter(i => i.agingCategory === selectedAging);
    if (categoryFilter !== 'All') filtered = filtered.filter(i => i.category === categoryFilter);
    if (riskFilter !== 'All') filtered = filtered.filter(i => i.stockoutRisk === riskFilter);
    return filtered;
  }, [inventoryMetrics, activeFilter, selectedAging, categoryFilter, riskFilter]);

  // Categories for filter
  const categories = useMemo(() => ['All', ...new Set(productsData.map(p => p.category).filter(Boolean))], [productsData]);

  // Aging breakdown
  const agingBreakdown = useMemo(() => {
    const aging = { '0-30 days': 0, '31-60 days': 0, '61-90 days': 0, '90+ days': 0 };
    inventoryMetrics.forEach(item => { aging[item.agingCategory] += item.stockValue; });
    return Object.entries(aging).map(([period, value]) => ({
      period, value: Math.round(value),
      color: period === '90+ days' ? '#EF4444' : period === '61-90 days' ? '#F59E0B' : period === '31-60 days' ? '#14B8A6' : '#22C55E'
    }));
  }, [inventoryMetrics]);

  // Product drilldown data
  const productDrilldown = useMemo(() => {
    if (!selectedProduct) return null;
    const txns = transactionsData.filter(t => t.product_code === selectedProduct.productCode);
    const monthlyTrend = {};
    txns.forEach(t => {
      const m = t.transaction_date.substring(0, 7);
      if (!monthlyTrend[m]) monthlyTrend[m] = { qty: 0, revenue: 0 };
      monthlyTrend[m].qty += parseFloat(t.quantity_liters) || 0;
      monthlyTrend[m].revenue += parseFloat(t.total_amount) || 0;
    });
    const trend = Object.entries(monthlyTrend).sort(([a], [b]) => a.localeCompare(b)).map(([month, d]) => ({
      month, qty: Math.round(d.qty), revenue: Math.round(d.revenue)
    }));
    // Top customers for this product
    const custStats = {};
    txns.forEach(t => {
      if (!custStats[t.customer_code]) custStats[t.customer_code] = { qty: 0, revenue: 0 };
      custStats[t.customer_code].qty += parseFloat(t.quantity_liters) || 0;
      custStats[t.customer_code].revenue += parseFloat(t.total_amount) || 0;
    });
    const customerMap = {};
    // Build from txns customer names if available
    txns.forEach(t => { if (t.customer_name) customerMap[t.customer_code] = t.customer_name; });
    const topCustomers = Object.entries(custStats)
      .map(([code, d]) => ({ code, name: customerMap[code] || code, ...d }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    return { trend, topCustomers, totalOrders: txns.length };
  }, [selectedProduct, transactionsData]);

  // KPIs
  const kpis = useMemo(() => {
    const totalInventoryValue = inventoryMetrics.reduce((sum, item) => sum + item.stockValue, 0);
    const slowMoving = inventoryMetrics.filter(item => item.daysOfInventory > 90);
    const slowMovingValue = slowMoving.reduce((sum, item) => sum + item.stockValue, 0);
    const fastMoving = inventoryMetrics.filter(item => item.avgMonthlySale > 1000).length;
    const stockoutRisk = inventoryMetrics.filter(item => item.stockoutRisk === 'High').length;
    return { totalValue: totalInventoryValue, slowMovingValue, slowMovingCount: slowMoving.length, fastMovingCount: fastMoving, stockoutRiskCount: stockoutRisk };
  }, [inventoryMetrics]);

  const handleKPIClick = (filter) => {
    setSelectedProduct(null);
    setSelectedAging(null);
    setActiveFilter(activeFilter === filter ? null : filter);
  };

  const handleAgingClick = (data) => {
    if (!data || !data.activePayload) return;
    const period = data.activePayload[0]?.payload?.period;
    if (!period) return;
    setSelectedProduct(null);
    setActiveFilter(null);
    setSelectedAging(selectedAging === period ? null : period);
  };

  const hasActiveFilters = activeFilter || selectedAging || categoryFilter !== 'All' || riskFilter !== 'All';

  const clearAllFilters = () => {
    setActiveFilter(null);
    setSelectedAging(null);
    setCategoryFilter('All');
    setRiskFilter('All');
    setSelectedProduct(null);
  };

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Inventory Optimization & Risk</h1>
            <p className="text-gray-600">Click any card, chart bar, or table row to drill down into details</p>
          </div>
          {hasMLData && (
            <span className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 text-xs font-semibold rounded-full">
              <Bot className="w-3 h-3" /> Safety Stock + Normal CDF Model
            </span>
          )}
        </div>
      </div>

      {/* KPI Cards — CLICKABLE */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div
          onClick={() => handleKPIClick('all')}
          className={`bg-white rounded-lg shadow-md p-6 border-l-4 border-primary cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg ${activeFilter === 'all' ? 'ring-2 ring-purple-500' : ''}`}
        >
          <div className="flex items-center justify-between mb-2">
            <Package className="w-8 h-8 text-primary" />
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${activeFilter === 'all' ? 'rotate-180 text-purple-600' : ''}`} />
          </div>
          <div className="text-sm text-gray-600 mb-1">Total Inventory Value</div>
          <div className="text-2xl font-bold">{formatLargeNumber(kpis.totalValue)}</div>
          <div className="text-xs text-purple-500 mt-2 font-medium">Click to view all</div>
        </div>

        <div
          onClick={() => handleKPIClick('slow')}
          className={`bg-white rounded-lg shadow-md p-6 border-l-4 border-danger cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg ${activeFilter === 'slow' ? 'ring-2 ring-purple-500' : ''}`}
        >
          <div className="flex items-center justify-between mb-2">
            <TrendingDown className="w-8 h-8 text-danger" />
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${activeFilter === 'slow' ? 'rotate-180 text-purple-600' : ''}`} />
          </div>
          <div className="text-sm text-gray-600 mb-1">Slow-Moving Stock</div>
          <div className="text-2xl font-bold">{formatLargeNumber(kpis.slowMovingValue)}</div>
          <div className="text-xs text-gray-500 mt-1">{kpis.slowMovingCount} products</div>
          <div className="text-xs text-purple-500 mt-1 font-medium">Click to filter</div>
        </div>

        <div
          onClick={() => handleKPIClick('fast')}
          className={`bg-white rounded-lg shadow-md p-6 border-l-4 border-success cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg ${activeFilter === 'fast' ? 'ring-2 ring-purple-500' : ''}`}
        >
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-8 h-8 text-success" />
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${activeFilter === 'fast' ? 'rotate-180 text-purple-600' : ''}`} />
          </div>
          <div className="text-sm text-gray-600 mb-1">Fast-Moving Products</div>
          <div className="text-2xl font-bold">{kpis.fastMovingCount}</div>
          <div className="text-xs text-gray-500 mt-1">High velocity items</div>
          <div className="text-xs text-purple-500 mt-1 font-medium">Click to filter</div>
        </div>

        <div
          onClick={() => handleKPIClick('stockout')}
          className={`bg-white rounded-lg shadow-md p-6 border-l-4 border-warning cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg ${activeFilter === 'stockout' ? 'ring-2 ring-purple-500' : ''}`}
        >
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="w-8 h-8 text-warning" />
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${activeFilter === 'stockout' ? 'rotate-180 text-purple-600' : ''}`} />
          </div>
          <div className="text-sm text-gray-600 mb-1">Stockout Risk Items</div>
          <div className="text-2xl font-bold text-warning">{kpis.stockoutRiskCount}</div>
          <div className="text-xs text-gray-500 mt-1">Reorder urgently</div>
          <div className="text-xs text-purple-500 mt-1 font-medium">Click to filter</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Inventory Aging — CLICKABLE */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Inventory Aging Analysis</h3>
            {selectedAging && (
              <button onClick={() => setSelectedAging(null)} className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1">
                <X className="w-3 h-3" /> Clear: {selectedAging}
              </button>
            )}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={agingBreakdown} layout="vertical" onClick={handleAgingClick} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(value) => formatLargeNumber(value)} />
              <YAxis type="category" dataKey="period" width={100} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="value" name="Stock Value" cursor="pointer">
                {agingBreakdown.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    opacity={selectedAging && selectedAging !== entry.period ? 0.3 : 1}
                    stroke={selectedAging === entry.period ? '#7C3AED' : 'none'}
                    strokeWidth={selectedAging === entry.period ? 3 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="text-xs text-purple-500 text-center mt-1 font-medium">Click a bar to filter table by aging period</div>
        </div>

        {/* Product Risk Matrix — INTERACTIVE with product counts */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Product Risk Matrix</h3>
          <div className="grid grid-cols-4 gap-2 mb-2">
            <div></div>
            <div className="text-center text-xs font-semibold text-gray-600">Low Stock</div>
            <div className="text-center text-xs font-semibold text-gray-600">Medium Stock</div>
            <div className="text-center text-xs font-semibold text-gray-600">High Stock</div>
          </div>
          {[
            { label: 'High Volatility', volatility: 'High' },
            { label: 'Medium Volatility', volatility: 'Medium' },
            { label: 'Low Volatility', volatility: 'Low' }
          ].map(row => {
            const getCount = (vol, stockLevel) => {
              return inventoryMetrics.filter(i => {
                const isVol = i.volatility === vol;
                const isStock = stockLevel === 'Low' ? i.daysOfInventory <= 30 :
                                stockLevel === 'Medium' ? (i.daysOfInventory > 30 && i.daysOfInventory <= 60) :
                                i.daysOfInventory > 60;
                return isVol && isStock;
              }).length;
            };
            const getCellColor = (vol, stockLevel) => {
              if (vol === 'High' && stockLevel === 'Low') return 'bg-red-200 text-red-800';
              if (vol === 'High' && stockLevel === 'Medium') return 'bg-yellow-200 text-yellow-800';
              if (vol === 'High' && stockLevel === 'High') return 'bg-green-200 text-green-800';
              if (vol === 'Medium' && stockLevel === 'Low') return 'bg-yellow-200 text-yellow-800';
              if (vol === 'Medium' && stockLevel === 'Medium') return 'bg-green-200 text-green-800';
              if (vol === 'Medium' && stockLevel === 'High') return 'bg-yellow-200 text-yellow-800';
              return 'bg-green-200 text-green-800';
            };
            const getCellLabel = (vol, stockLevel) => {
              if (vol === 'High' && stockLevel === 'Low') return 'Critical';
              if (vol === 'High' && stockLevel === 'Medium') return 'Watch';
              if (vol === 'High' && stockLevel === 'High') return 'Reduce';
              if (vol === 'Medium' && stockLevel === 'Low') return 'Monitor';
              if (vol === 'Medium' && stockLevel === 'Medium') return 'OK';
              if (vol === 'Medium' && stockLevel === 'High') return 'Optimize';
              if (vol === 'Low' && stockLevel === 'Low') return 'Reorder';
              if (vol === 'Low' && stockLevel === 'Medium') return 'Good';
              return 'Stable';
            };
            return (
              <div key={row.volatility} className="grid grid-cols-4 gap-2 mb-2">
                <div className="text-xs font-semibold text-gray-600 flex items-center">{row.label}</div>
                {['Low', 'Medium', 'High'].map(stockLevel => {
                  const count = getCount(row.volatility, stockLevel);
                  return (
                    <div key={stockLevel} className={`h-20 ${getCellColor(row.volatility, stockLevel)} rounded flex flex-col items-center justify-center`}>
                      <span className="text-xs font-semibold">{getCellLabel(row.volatility, stockLevel)}</span>
                      {count > 0 && <span className="text-lg font-bold mt-1">{count}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Risk Level</label>
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                {['All', 'High', 'Medium', 'Low'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <button onClick={clearAllFilters} className="flex items-center gap-1 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200">
                <X className="w-3 h-3" /> Clear all filters
              </button>
            )}
            <span className="text-sm text-gray-500">
              Showing <strong className="text-gray-900">{filteredMetrics.length}</strong> of {inventoryMetrics.length} products
            </span>
          </div>
        </div>
      </div>

      {/* Inventory Table — CLICKABLE ROWS */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Detailed Inventory Status</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Product</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Category</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Stock (L)</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Avg Sale/Mo</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Days of Inv</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Risk Level</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">AI Recommendation</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700"></th>
              </tr>
            </thead>
            <tbody>
              {filteredMetrics.map((item) => (
                <tr
                  key={item.productCode}
                  onClick={() => setSelectedProduct(selectedProduct?.productCode === item.productCode ? null : item)}
                  className={`border-b cursor-pointer transition-colors ${
                    selectedProduct?.productCode === item.productCode ? 'bg-purple-50 ring-1 ring-purple-300' :
                    item.stockoutRisk === 'High' ? 'bg-red-50 hover:bg-red-100' :
                    item.daysOfInventory > 90 ? 'bg-yellow-50 hover:bg-yellow-100' :
                    'hover:bg-gray-50'
                  }`}
                >
                  <td className="py-3 px-4 text-sm font-medium">{item.productName}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{item.category}</td>
                  <td className="py-3 px-4 text-sm text-right font-mono">{item.currentStock.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right font-mono">{item.avgMonthlySale.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right">
                    <span className={`font-semibold ${
                      item.daysOfInventory > 90 ? 'text-red-600' :
                      item.daysOfInventory > 60 ? 'text-yellow-600' :
                      item.daysOfInventory < 15 ? 'text-red-600' : 'text-green-600'
                    }`}>{item.daysOfInventory > 900 ? '999+' : item.daysOfInventory}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      item.stockoutRisk === 'High' ? 'bg-red-100 text-red-800' :
                      item.stockoutRisk === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>{item.stockoutRisk}</span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    {item.recommendation.includes('Reduce') && <ArrowDown className="w-4 h-4 text-red-600 inline mr-1" />}
                    {item.recommendation.includes('Reorder') && <ArrowUp className="w-4 h-4 text-blue-600 inline mr-1" />}
                    {item.recommendation}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Eye className={`w-4 h-4 ${selectedProduct?.productCode === item.productCode ? 'text-purple-600' : 'text-gray-400'}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-purple-500 text-center mt-2 font-medium">Click any row to see product sales history</div>
      </div>

      {/* Product Drilldown Panel */}
      {selectedProduct && productDrilldown && (
        <div className="bg-white rounded-xl shadow-lg border border-purple-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-purple-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-purple-600" />
              {selectedProduct.productName} — Product Details
            </h3>
            <button onClick={() => setSelectedProduct(null)} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Product KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div className="p-3 bg-blue-50 rounded-lg text-center">
              <div className="text-xs text-gray-500">Current Stock</div>
              <div className="text-lg font-bold text-blue-900">{selectedProduct.currentStock.toLocaleString()} L</div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-center">
              <div className="text-xs text-gray-500">Avg Sale/Mo</div>
              <div className="text-lg font-bold text-green-900">{selectedProduct.avgMonthlySale.toLocaleString()} L</div>
            </div>
            <div className="p-3 bg-yellow-50 rounded-lg text-center">
              <div className="text-xs text-gray-500">Stock Value</div>
              <div className="text-lg font-bold text-yellow-900">{formatLargeNumber(selectedProduct.stockValue)}</div>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg text-center">
              <div className="text-xs text-gray-500">Reorder Point</div>
              <div className="text-lg font-bold text-purple-900">{Math.round(selectedProduct.reorderPoint).toLocaleString()} L</div>
            </div>
            <div className="p-3 bg-red-50 rounded-lg text-center">
              <div className="text-xs text-gray-500">Volatility</div>
              <div className={`text-lg font-bold ${selectedProduct.volatility === 'High' ? 'text-red-900' : selectedProduct.volatility === 'Medium' ? 'text-yellow-900' : 'text-green-900'}`}>
                {selectedProduct.volatility}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales Trend */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Monthly Sales Trend</h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={productDrilldown.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v) => v.substring(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="qty" stroke="#7C3AED" strokeWidth={2} name="Quantity (L)" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Top Customers */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Top Customers for this Product</h4>
              <div className="space-y-2">
                {productDrilldown.topCustomers.map((c, i) => (
                  <div key={c.code} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        i === 0 ? 'bg-yellow-100 text-yellow-800' : i === 1 ? 'bg-gray-100 text-gray-800' : 'bg-blue-50 text-blue-800'
                      }`}>{i + 1}</span>
                      <span className="text-sm font-medium">{c.name}</span>
                    </div>
                    <div className="text-sm font-mono text-right">
                      <span className="text-gray-900">{formatCurrency(c.revenue)}</span>
                      <span className="text-gray-500 ml-2">({Math.round(c.qty).toLocaleString()} L)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Recommendations Panel */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">AI-Powered Action Items</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            onClick={() => handleKPIClick('stockout')}
            className={`p-4 bg-red-50 border-l-4 border-red-500 rounded cursor-pointer hover:shadow-md transition-all ${activeFilter === 'stockout' ? 'ring-2 ring-purple-500' : ''}`}
          >
            <div className="flex items-start">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 mr-2" />
              <div>
                <div className="font-semibold text-red-900">Urgent Reorders</div>
                <div className="text-sm text-red-700 mt-1">
                  {inventoryMetrics.filter(i => i.stockoutRisk === 'High').length} products below reorder point
                </div>
                <ul className="text-xs text-red-600 mt-2 space-y-1">
                  {inventoryMetrics.filter(i => i.stockoutRisk === 'High').slice(0, 3).map(item => (
                    <li key={item.productCode}>- {item.productName}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div
            onClick={() => handleKPIClick('slow')}
            className={`p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded cursor-pointer hover:shadow-md transition-all ${activeFilter === 'slow' ? 'ring-2 ring-purple-500' : ''}`}
          >
            <div className="flex items-start">
              <TrendingDown className="w-5 h-5 text-yellow-600 mt-0.5 mr-2" />
              <div>
                <div className="font-semibold text-yellow-900">Reduce Slow Movers</div>
                <div className="text-sm text-yellow-700 mt-1">
                  {kpis.slowMovingCount} products with 90+ days inventory
                </div>
                <div className="text-xs text-yellow-600 mt-2">
                  Total value at risk: {formatLargeNumber(kpis.slowMovingValue)}
                </div>
              </div>
            </div>
          </div>

          <div
            onClick={() => handleKPIClick('fast')}
            className={`p-4 bg-green-50 border-l-4 border-green-500 rounded cursor-pointer hover:shadow-md transition-all ${activeFilter === 'fast' ? 'ring-2 ring-purple-500' : ''}`}
          >
            <div className="flex items-start">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-2" />
              <div>
                <div className="font-semibold text-green-900">Optimal Stock Levels</div>
                <div className="text-sm text-green-700 mt-1">
                  {inventoryMetrics.filter(i => i.stockoutRisk === 'Low' && i.daysOfInventory < 60).length} products in healthy range
                </div>
                <div className="text-xs text-green-600 mt-2">
                  Maintain current procurement schedule
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
