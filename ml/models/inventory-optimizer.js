/**
 * Inventory Optimizer — Statistical Safety Stock + Demand Analysis
 *
 * Algorithm:
 * 1. Compute monthly demand per product from transaction history
 * 2. Demand volatility = coefficient of variation (std_dev / mean)
 * 3. Safety stock = z(95%) × std_dev × √lead_time  (z = 1.645)
 * 4. Reorder point = (avg_daily_demand × lead_time) + safety_stock
 * 5. Stockout probability from normal distribution CDF
 * 6. Days until stockout = current_stock / avg_daily_demand
 */
import * as ss from 'simple-statistics'

const Z_95 = 1.645 // z-score for 95% service level
const DEFAULT_LEAD_TIME_DAYS = 7 // 7 days lead time assumption

export function optimizeInventory(transactions, products, inventory) {
  const results = []

  // Build product lookup
  const productMap = {}
  products.forEach(p => { productMap[p.id] = p })

  // Build inventory lookup by product_id
  const inventoryMap = {}
  inventory.forEach(inv => { inventoryMap[inv.product_id] = inv })

  // Group transactions by product → monthly quantities
  const productMonthly = {}
  transactions.forEach(t => {
    const pid = t.product_id
    if (!productMonthly[pid]) productMonthly[pid] = {}
    const month = t.transaction_date.substring(0, 7)
    productMonthly[pid][month] = (productMonthly[pid][month] || 0) + (parseFloat(t.quantity_liters) || 0)
  })

  // Get all months for consistent time series
  const allMonths = [...new Set(transactions.map(t => t.transaction_date.substring(0, 7)))].sort()

  for (const product of products) {
    const monthly = productMonthly[product.id] || {}
    const inv = inventoryMap[product.id]

    // Build complete monthly demand series (0 for months with no sales)
    const demandSeries = allMonths.map(m => monthly[m] || 0)

    if (demandSeries.length < 2) continue

    // Monthly demand statistics
    const avgMonthlyDemand = ss.mean(demandSeries)
    const stdDevDemand = ss.standardDeviation(demandSeries)

    // Coefficient of variation (demand volatility)
    const cv = avgMonthlyDemand > 0 ? stdDevDemand / avgMonthlyDemand : 0

    let volatilityLevel = 'Low'
    if (cv > 0.5) volatilityLevel = 'High'
    else if (cv > 0.25) volatilityLevel = 'Medium'

    // Daily demand
    const avgDailyDemand = avgMonthlyDemand / 30
    const dailyStdDev = stdDevDemand / Math.sqrt(30)

    // Safety stock = z × σ_daily × √lead_time
    const leadTime = DEFAULT_LEAD_TIME_DAYS
    const safetyStock = Z_95 * dailyStdDev * Math.sqrt(leadTime)

    // Reorder point = (avg_daily_demand × lead_time) + safety_stock
    const reorderPoint = (avgDailyDemand * leadTime) + safetyStock

    // Current stock from inventory table
    const currentStock = inv ? (parseFloat(inv.current_stock_liters) || 0) : 0

    // Days until stockout
    const daysUntilStockout = avgDailyDemand > 0
      ? Math.round((currentStock / avgDailyDemand) * 10) / 10
      : 999

    // Stockout probability using normal distribution CDF
    // P(demand during lead time > current stock)
    // demand during lead time ~ Normal(avg_daily × LT, σ_daily × √LT)
    const demandDuringLT = avgDailyDemand * leadTime
    const stdDuringLT = dailyStdDev * Math.sqrt(leadTime)

    let stockoutProb = 0
    if (stdDuringLT > 0 && currentStock > 0) {
      // z-score: how many std devs is current stock from expected demand during lead time
      const zScore = (currentStock - demandDuringLT) / stdDuringLT
      // P(stockout) = P(Z > zScore) = 1 - Φ(zScore)
      stockoutProb = 1 - normalCDF(zScore)
    } else if (currentStock <= 0) {
      stockoutProb = 1
    }

    // Confidence based on data quality
    const dataMonths = Object.keys(monthly).length
    const confidence = Math.min(95, Math.round(50 + dataMonths * 3))

    // Generate recommendation
    let recommendation = ''
    if (currentStock <= 0) {
      recommendation = `CRITICAL: Out of stock. Order ${Math.round(reorderPoint + avgMonthlyDemand)} L immediately`
    } else if (currentStock < reorderPoint) {
      const orderQty = Math.round((reorderPoint + avgMonthlyDemand - currentStock) / 100) * 100
      recommendation = `Urgent: Below reorder point. Order ${orderQty} L within ${leadTime} days`
    } else if (daysUntilStockout < 30) {
      const orderQty = Math.round(avgMonthlyDemand * 1.5 / 100) * 100
      recommendation = `Plan reorder of ${orderQty} L — ${Math.round(daysUntilStockout)} days of stock remaining`
    } else if (daysUntilStockout > 120) {
      const excessStock = Math.round((currentStock - avgMonthlyDemand * 3) / 100) * 100
      recommendation = `Overstocked: ${Math.round(daysUntilStockout)} days of supply. Consider reducing by ${excessStock} L`
    } else {
      recommendation = `Healthy stock: ${Math.round(daysUntilStockout)} days supply. Next reorder in ~${Math.round(daysUntilStockout - leadTime)} days`
    }

    results.push({
      product_id: product.id,
      predicted_monthly_demand: Math.round(avgMonthlyDemand * 100) / 100,
      demand_volatility: Math.round(cv * 10000) / 10000,
      volatility_level: volatilityLevel,
      safety_stock: Math.round(safetyStock * 100) / 100,
      reorder_point_ml: Math.round(reorderPoint * 100) / 100,
      stockout_probability: Math.round(stockoutProb * 10000) / 10000,
      days_until_stockout: daysUntilStockout,
      recommendation,
      confidence_score: confidence
    })
  }

  console.log(`  Inventory Optimizer: ${results.length} products analyzed`)
  console.log(`    High volatility: ${results.filter(r => r.volatility_level === 'High').length}`)
  console.log(`    Stockout risk (>50%): ${results.filter(r => r.stockout_probability > 0.5).length}`)

  return results
}

/**
 * Normal distribution CDF approximation (Abramowitz and Stegun)
 */
function normalCDF(z) {
  if (z < -6) return 0
  if (z > 6) return 1

  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911

  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.sqrt(2)

  const t = 1.0 / (1.0 + p * x)
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)

  return 0.5 * (1.0 + sign * y)
}
