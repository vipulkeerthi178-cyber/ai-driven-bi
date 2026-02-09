/**
 * Sales Forecaster — Linear Regression on monthly product demand
 *
 * Algorithm:
 * 1. Groups transactions by product × month → time series of monthly quantities
 * 2. Fits linear regression (least squares): quantity = slope × month_index + intercept
 * 3. Extrapolates next 3 months
 * 4. R² as confidence metric
 * 5. Revenue = predicted quantity × average unit price
 */
import * as ss from 'simple-statistics'

export function forecastSales(transactions, products) {
  const predictions = []

  // Build product lookup
  const productMap = {}
  products.forEach(p => { productMap[p.id] = p })

  // Group transactions by product_id → monthly quantities
  const productMonthly = {}
  transactions.forEach(t => {
    const pid = t.product_id
    if (!productMonthly[pid]) productMonthly[pid] = {}
    const month = t.transaction_date.substring(0, 7) // YYYY-MM
    if (!productMonthly[pid][month]) {
      productMonthly[pid][month] = { quantity: 0, revenue: 0, count: 0 }
    }
    productMonthly[pid][month].quantity += parseFloat(t.quantity_liters) || 0
    productMonthly[pid][month].revenue += parseFloat(t.total_amount) || 0
    productMonthly[pid][month].count += 1
  })

  // Get all months sorted
  const allMonths = [...new Set(transactions.map(t => t.transaction_date.substring(0, 7)))]
    .sort()

  // Create month index mapping (0, 1, 2, ...)
  const monthIndex = {}
  allMonths.forEach((m, i) => { monthIndex[m] = i })
  const lastIndex = allMonths.length - 1

  // For each product, fit linear regression
  for (const [productId, monthlyData] of Object.entries(productMonthly)) {
    const product = productMap[productId]
    if (!product) continue

    // Build data points: [[monthIndex, quantity], ...]
    const dataPoints = []
    for (const [month, data] of Object.entries(monthlyData)) {
      if (monthIndex[month] !== undefined) {
        dataPoints.push([monthIndex[month], data.quantity])
      }
    }

    if (dataPoints.length < 3) continue // Need at least 3 data points

    // Fit linear regression
    const regression = ss.linearRegression(dataPoints)
    const regressionLine = ss.linearRegressionLine(regression)

    // Calculate R² (coefficient of determination)
    // ss.rSquared takes (data, regressionFunction)
    const rSquared = ss.rSquared(dataPoints, regressionLine)
    const actual = dataPoints.map(([, y]) => y)

    // Average unit price from recent transactions
    const recentMonths = Object.entries(monthlyData)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 3)
    const avgUnitPrice = recentMonths.reduce((sum, [, d]) =>
      sum + (d.count > 0 ? d.revenue / d.quantity : 0), 0) / recentMonths.length

    // Calculate growth rate from slope
    const avgQuantity = ss.mean(actual)
    const growthRate = avgQuantity > 0 ? regression.m / avgQuantity : 0

    // Predict next 3 months
    for (let i = 1; i <= 3; i++) {
      const futureIndex = lastIndex + i
      const predictedQty = Math.max(0, regressionLine(futureIndex))
      const predictedRevenue = predictedQty * avgUnitPrice

      // Calculate prediction month date
      const lastMonth = allMonths[allMonths.length - 1]
      const [year, mon] = lastMonth.split('-').map(Number)
      const futureDate = new Date(year, mon - 1 + i, 1)
      const predictionMonth = futureDate.toISOString().substring(0, 10) // YYYY-MM-DD

      predictions.push({
        product_id: productId,
        prediction_month: predictionMonth,
        predicted_quantity: Math.round(predictedQty * 100) / 100,
        predicted_revenue: Math.round(predictedRevenue * 100) / 100,
        confidence_score: Math.round(Math.max(0, rSquared) * 100) / 100, // R² as confidence
        model_used: 'linear_regression',
        trend_direction: regression.m > 0 ? 'up' : regression.m < 0 ? 'down' : 'stable',
        growth_rate: Math.round(growthRate * 10000) / 10000
      })
    }
  }

  console.log(`  Sales Forecaster: ${predictions.length} predictions for ${Object.keys(productMonthly).length} products`)
  return predictions
}
