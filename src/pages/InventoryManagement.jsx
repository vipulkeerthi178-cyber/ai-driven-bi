import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Package, TrendingDown, AlertTriangle, CheckCircle, ArrowUp, ArrowDown, Bot } from 'lucide-react';
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

function InventoryContent({ transactionsData, productsData, inventoryData, mlInventoryData, predictionRun }) {
  const hasMLData = mlInventoryData && mlInventoryData.length > 0;

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
    productsData.forEach(p => {
      productMap[p.product_code] = p;
    });

    const inventoryMap = {};
    inventoryData.forEach(inv => {
      inventoryMap[inv.product_code] = inv;
    });

    // Calculate sales velocity for each product
    const salesVelocity = {};
    transactionsData.forEach(t => {
      if (!salesVelocity[t.product_code]) {
        salesVelocity[t.product_code] = {
          totalQty: 0,
          count: 0,
          lastSaleDate: null
        };
      }
      salesVelocity[t.product_code].totalQty += parseFloat(t.quantity_liters) || 0;
      salesVelocity[t.product_code].count++;

      if (!salesVelocity[t.product_code].lastSaleDate ||
          t.transaction_date > salesVelocity[t.product_code].lastSaleDate) {
        salesVelocity[t.product_code].lastSaleDate = t.transaction_date;
      }
    });

    return productsData.map(product => {
      const inventory = inventoryMap[product.product_code] || {
        current_stock_liters: 0,
        reserved_stock: 0,
        reorder_point: 1000
      };

      const velocity = salesVelocity[product.product_code] || { totalQty: 0, count: 0 };
      const months = 15; // Data spans 15 months
      const avgMonthlySale = velocity.totalQty / months;
      const currentStock = parseFloat(inventory.current_stock_liters) || 0;
      const availableStock = currentStock - (parseFloat(inventory.reserved_stock) || 0);

      // Calculate days of inventory
      const daysOfInventory = avgMonthlySale > 0 ? (currentStock / avgMonthlySale) * 30 : 999;

      // Determine inventory aging
      let agingCategory = '0-30 days';
      if (daysOfInventory > 90) agingCategory = '90+ days';
      else if (daysOfInventory > 60) agingCategory = '61-90 days';
      else if (daysOfInventory > 30) agingCategory = '31-60 days';

      // Calculate stockout risk
      const reorderPoint = parseFloat(inventory.reorder_point) || 1000;
      let stockoutRisk = 'Low';
      if (currentStock < reorderPoint) stockoutRisk = 'High';
      else if (currentStock < reorderPoint * 1.5) stockoutRisk = 'Medium';

      // Use ML data if available, else fallback to client-side calculation
      const mlData = mlLookup[product.product_code];
      let volatility = 'Low';
      let safetyStock = 0;
      let mlReorderPoint = reorderPoint;
      let stockoutProb = 0;
      let mlDaysUntilStockout = daysOfInventory;

      if (mlData) {
        volatility = mlData.volatility_level || 'Low';
        safetyStock = parseFloat(mlData.safety_stock) || 0;
        mlReorderPoint = parseFloat(mlData.reorder_point_ml) || reorderPoint;
        stockoutProb = parseFloat(mlData.stockout_probability) || 0;
        mlDaysUntilStockout = parseFloat(mlData.days_until_stockout) || daysOfInventory;
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

      // Use ML recommendation if available
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
        currentStock,
        availableStock,
        reservedStock: parseFloat(inventory.reserved_stock) || 0,
        avgMonthlySale: Math.round(avgMonthlySale),
        daysOfInventory: Math.round(daysOfInventory),
        agingCategory,
        stockoutRisk,
        volatility,
        recommendation,
        stockValue,
        sellingPrice: parseFloat(product.selling_price) || 0,
        reorderPoint: mlData ? mlReorderPoint : reorderPoint,
        safetyStock,
        stockoutProb,
        isML: !!mlData
      };
    }).sort((a, b) => b.stockValue - a.stockValue);
  }, [transactionsData, productsData, inventoryData, mlLookup]);

  // Inventory aging breakdown
  const agingBreakdown = useMemo(() => {
    const aging = {
      '0-30 days': 0,
      '31-60 days': 0,
      '61-90 days': 0,
      '90+ days': 0
    };

    inventoryMetrics.forEach(item => {
      aging[item.agingCategory] += item.stockValue;
    });

    return Object.entries(aging).map(([period, value]) => ({
      period,
      value: Math.round(value),
      color: period === '90+ days' ? '#EF4444' :
             period === '61-90 days' ? '#F59E0B' :
             period === '31-60 days' ? '#14B8A6' : '#22C55E'
    }));
  }, [inventoryMetrics]);

  // Risk matrix data
  const riskMatrixData = useMemo(() => {
    return inventoryMetrics.map(item => {
      const volatilityScore = item.volatility === 'High' ? 3 : item.volatility === 'Medium' ? 2 : 1;
      const stockLevel = item.daysOfInventory > 60 ? 3 : item.daysOfInventory > 30 ? 2 : 1;

      return {
        name: item.productName,
        volatility: volatilityScore,
        stockLevel: stockLevel,
        value: item.stockValue
      };
    });
  }, [inventoryMetrics]);

  // KPIs
  const kpis = useMemo(() => {
    const totalInventoryValue = inventoryMetrics.reduce((sum, item) => sum + item.stockValue, 0);
    const slowMoving = inventoryMetrics.filter(item => item.daysOfInventory > 90);
    const slowMovingValue = slowMoving.reduce((sum, item) => sum + item.stockValue, 0);
    const fastMoving = inventoryMetrics.filter(item => item.avgMonthlySale > 1000).length;
    const stockoutRisk = inventoryMetrics.filter(item => item.stockoutRisk === 'High').length;

    return {
      totalValue: totalInventoryValue,
      slowMovingValue,
      slowMovingCount: slowMoving.length,
      fastMovingCount: fastMoving,
      stockoutRiskCount: stockoutRisk
    };
  }, [inventoryMetrics]);

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Inventory Optimization & Risk</h1>
            <p className="text-gray-600">Avoid overstocking, dead stock, and stockouts with ML recommendations</p>
          </div>
          {hasMLData && (
            <span className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 text-xs font-semibold rounded-full">
              <Bot className="w-3 h-3" /> Safety Stock + Normal CDF Model
            </span>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-primary">
          <div className="flex items-center justify-between mb-2">
            <Package className="w-8 h-8 text-primary" />
          </div>
          <div className="text-sm text-gray-600 mb-1">Total Inventory Value</div>
          <div className="text-2xl font-bold">{formatLargeNumber(kpis.totalValue)}</div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-danger">
          <div className="flex items-center justify-between mb-2">
            <TrendingDown className="w-8 h-8 text-danger" />
          </div>
          <div className="text-sm text-gray-600 mb-1">Slow-Moving Stock</div>
          <div className="text-2xl font-bold">{formatLargeNumber(kpis.slowMovingValue)}</div>
          <div className="text-xs text-gray-500 mt-1">{kpis.slowMovingCount} products</div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-success">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-8 h-8 text-success" />
          </div>
          <div className="text-sm text-gray-600 mb-1">Fast-Moving Products</div>
          <div className="text-2xl font-bold">{kpis.fastMovingCount}</div>
          <div className="text-xs text-gray-500 mt-1">High velocity items</div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-warning">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="w-8 h-8 text-warning" />
          </div>
          <div className="text-sm text-gray-600 mb-1">Stockout Risk Items</div>
          <div className="text-2xl font-bold text-warning">{kpis.stockoutRiskCount}</div>
          <div className="text-xs text-gray-500 mt-1">Reorder urgently</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Inventory Aging */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Inventory Aging Analysis</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={agingBreakdown} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(value) => formatLargeNumber(value)} />
              <YAxis type="category" dataKey="period" width={100} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="value" name="Stock Value">
                {agingBreakdown.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 text-sm text-gray-600">
            <span className="text-red-600 font-semibold">Red = 90+ days:</span> Priority for clearance/reduction
          </div>
        </div>

        {/* Product Risk Matrix */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Product Risk Matrix</h3>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="text-center text-xs font-semibold text-gray-600"></div>
            <div className="text-center text-xs font-semibold text-gray-600">Low Stock</div>
            <div className="text-center text-xs font-semibold text-gray-600">Medium Stock</div>
            <div className="text-center text-xs font-semibold text-gray-600">High Stock</div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="text-xs font-semibold text-gray-600 flex items-center">High Volatility</div>
            <div className="h-20 bg-red-200 rounded flex items-center justify-center">
              <span className="text-xs font-semibold text-red-800">Critical</span>
            </div>
            <div className="h-20 bg-yellow-200 rounded flex items-center justify-center">
              <span className="text-xs font-semibold text-yellow-800">Watch</span>
            </div>
            <div className="h-20 bg-green-200 rounded flex items-center justify-center">
              <span className="text-xs font-semibold text-green-800">Reduce</span>
            </div>

            <div className="text-xs font-semibold text-gray-600 flex items-center">Medium Volatility</div>
            <div className="h-20 bg-yellow-200 rounded flex items-center justify-center">
              <span className="text-xs font-semibold text-yellow-800">Monitor</span>
            </div>
            <div className="h-20 bg-green-200 rounded flex items-center justify-center">
              <span className="text-xs font-semibold text-green-800">OK</span>
            </div>
            <div className="h-20 bg-yellow-200 rounded flex items-center justify-center">
              <span className="text-xs font-semibold text-yellow-800">Optimize</span>
            </div>

            <div className="text-xs font-semibold text-gray-600 flex items-center">Low Volatility</div>
            <div className="h-20 bg-green-200 rounded flex items-center justify-center">
              <span className="text-xs font-semibold text-green-800">Reorder</span>
            </div>
            <div className="h-20 bg-green-200 rounded flex items-center justify-center">
              <span className="text-xs font-semibold text-green-800">Good</span>
            </div>
            <div className="h-20 bg-green-200 rounded flex items-center justify-center">
              <span className="text-xs font-semibold text-green-800">Stable</span>
            </div>
          </div>
        </div>
      </div>

      {/* Inventory Table */}
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
              </tr>
            </thead>
            <tbody>
              {inventoryMetrics.map((item, idx) => (
                <tr key={item.productCode} className={`border-b hover:bg-gray-50 ${
                  item.stockoutRisk === 'High' ? 'bg-red-50' :
                  item.daysOfInventory > 90 ? 'bg-yellow-50' : ''
                }`}>
                  <td className="py-3 px-4 text-sm font-medium">{item.productName}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{item.category}</td>
                  <td className="py-3 px-4 text-sm text-right font-mono">
                    {item.currentStock.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-mono">
                    {item.avgMonthlySale.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm text-right">
                    <span className={`font-semibold ${
                      item.daysOfInventory > 90 ? 'text-red-600' :
                      item.daysOfInventory > 60 ? 'text-yellow-600' :
                      item.daysOfInventory < 15 ? 'text-red-600' :
                      'text-green-600'
                    }`}>
                      {item.daysOfInventory > 900 ? '999+' : item.daysOfInventory}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      item.stockoutRisk === 'High' ? 'bg-red-100 text-red-800' :
                      item.stockoutRisk === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {item.stockoutRisk}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    {item.recommendation.includes('Reduce') && <ArrowDown className="w-4 h-4 text-red-600 inline mr-1" />}
                    {item.recommendation.includes('Reorder') && <ArrowUp className="w-4 h-4 text-blue-600 inline mr-1" />}
                    {item.recommendation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Recommendations Panel */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">AI-Powered Action Items</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded">
            <div className="flex items-start">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 mr-2" />
              <div>
                <div className="font-semibold text-red-900">Urgent Reorders</div>
                <div className="text-sm text-red-700 mt-1">
                  {inventoryMetrics.filter(i => i.stockoutRisk === 'High').length} products below reorder point
                </div>
                <ul className="text-xs text-red-600 mt-2 space-y-1">
                  {inventoryMetrics
                    .filter(i => i.stockoutRisk === 'High')
                    .slice(0, 3)
                    .map(item => (
                      <li key={item.productCode}>- {item.productName}</li>
                    ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded">
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

          <div className="p-4 bg-green-50 border-l-4 border-green-500 rounded">
            <div className="flex items-start">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-2" />
              <div>
                <div className="font-semibold text-green-900">Optimal Stock Levels</div>
                <div className="text-sm text-green-700 mt-1">
                  {inventoryMetrics.filter(i => i.stockoutRisk === 'Low' && i.daysOfInventory < 60).length} products
                  in healthy range
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
