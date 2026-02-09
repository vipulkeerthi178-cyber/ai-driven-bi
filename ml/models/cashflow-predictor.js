/**
 * Cash Flow Predictor — Exponential Smoothing + Collection Rate Analysis
 *
 * Algorithm:
 * 1. Compute monthly revenue and paid amounts from transaction history
 * 2. Calculate historical collection rate per month (paid / revenue)
 * 3. Apply Simple Exponential Smoothing (SES) on revenue series
 * 4. Apply SES on collection rate series
 * 5. Forecast next 3 months with best/worst/likely scenarios using std dev
 * 6. Confidence from Mean Absolute Percentage Error (MAPE)
 */
import * as ss from 'simple-statistics'

/**
 * Simple Exponential Smoothing
 * @param {number[]} series - time series values
 * @param {number} alpha - smoothing factor (0-1), higher = more weight on recent
 * @returns {{ forecast: number, smoothed: number[], level: number }}
 */
function exponentialSmoothing(series, alpha = 0.3) {
  if (series.length === 0) return { forecast: 0, smoothed: [], level: 0 }
  if (series.length === 1) return { forecast: series[0], smoothed: [...series], level: series[0] }

  const smoothed = [series[0]] // Initialize with first value
  for (let i = 1; i < series.length; i++) {
    smoothed.push(alpha * series[i] + (1 - alpha) * smoothed[i - 1])
  }

  const level = smoothed[smoothed.length - 1]
  return { forecast: level, smoothed, level }
}

/**
 * Double Exponential Smoothing (Holt's method) — captures trend
 * @param {number[]} series
 * @param {number} alpha - level smoothing
 * @param {number} beta - trend smoothing
 * @returns {{ forecasts: number[], level: number, trend: number }}
 */
function holtSmoothing(series, alpha = 0.3, beta = 0.1) {
  if (series.length < 2) {
    return { forecasts: [series[0] || 0], level: series[0] || 0, trend: 0 }
  }

  let level = series[0]
  let trend = series[1] - series[0]

  const smoothed = [level]
  for (let i = 1; i < series.length; i++) {
    const prevLevel = level
    level = alpha * series[i] + (1 - alpha) * (prevLevel + trend)
    trend = beta * (level - prevLevel) + (1 - beta) * trend
    smoothed.push(level + trend)
  }

  // Forecast h steps ahead
  const forecasts = []
  for (let h = 1; h <= 3; h++) {
    forecasts.push(level + h * trend)
  }

  return { forecasts, level, trend, smoothed }
}

export function forecastCashFlow(transactions) {
  // Group transactions by month
  const monthlyData = {}
  transactions.forEach(t => {
    const month = t.transaction_date.substring(0, 7)
    if (!monthlyData[month]) {
      monthlyData[month] = { revenue: 0, paid: 0, outstanding: 0, count: 0 }
    }
    monthlyData[month].revenue += parseFloat(t.total_amount) || 0
    monthlyData[month].outstanding += parseFloat(t.outstanding_amount) || 0
    if (t.payment_status === 'Paid') {
      monthlyData[month].paid += parseFloat(t.total_amount) || 0
    } else {
      // For partial payments, paid = total - outstanding
      const paid = (parseFloat(t.total_amount) || 0) - (parseFloat(t.outstanding_amount) || 0)
      monthlyData[month].paid += Math.max(0, paid)
    }
    monthlyData[month].count += 1
  })

  // Sort months chronologically
  const sortedMonths = Object.keys(monthlyData).sort()
  if (sortedMonths.length < 3) {
    console.log('  Cash Flow: Not enough monthly data for forecasting')
    return []
  }

  // Extract time series
  const revenueSeries = sortedMonths.map(m => monthlyData[m].revenue)
  const paidSeries = sortedMonths.map(m => monthlyData[m].paid)
  const collectionRates = sortedMonths.map(m =>
    monthlyData[m].revenue > 0 ? monthlyData[m].paid / monthlyData[m].revenue : 0
  )

  // Apply Holt's double exponential smoothing on revenue (captures trend)
  const revenueHolt = holtSmoothing(revenueSeries, 0.3, 0.1)

  // Apply simple exponential smoothing on collection rates
  const collectionSES = exponentialSmoothing(collectionRates, 0.3)

  // Calculate standard deviation of collection rates for scenario modeling
  const collectionStdDev = ss.standardDeviation(collectionRates)
  const avgCollectionRate = collectionSES.forecast

  // Calculate MAPE for confidence
  const revenueSmoothed = holtSmoothing(revenueSeries, 0.3, 0.1).smoothed
  const errors = revenueSeries.map((actual, i) => {
    const pred = i < revenueSmoothed.length ? revenueSmoothed[i] : actual
    return actual > 0 ? Math.abs((actual - pred) / actual) : 0
  })
  const mape = ss.mean(errors)
  const confidence = Math.round(Math.max(0, Math.min(99, (1 - mape) * 100)) * 100) / 100

  // Generate forecasts for next 3 months
  const lastMonth = sortedMonths[sortedMonths.length - 1]
  const [year, mon] = lastMonth.split('-').map(Number)
  const forecasts = []

  for (let i = 0; i < 3; i++) {
    const futureDate = new Date(year, mon - 1 + i + 1, 1)
    const forecastMonth = futureDate.toISOString().substring(0, 10)

    const predictedRevenue = Math.max(0, revenueHolt.forecasts[i])

    // Scenarios based on collection rate ± std dev
    const bestRate = Math.min(1, avgCollectionRate + collectionStdDev)
    const worstRate = Math.max(0, avgCollectionRate - collectionStdDev)
    const likelyRate = avgCollectionRate

    const bestCase = predictedRevenue * bestRate
    const worstCase = predictedRevenue * worstRate
    const mostLikely = predictedRevenue * likelyRate
    const expectedDelay = predictedRevenue * (1 - likelyRate)

    forecasts.push({
      forecast_month: forecastMonth,
      expected_inflow: Math.round(mostLikely * 100) / 100,
      best_case_inflow: Math.round(bestCase * 100) / 100,
      worst_case_inflow: Math.round(worstCase * 100) / 100,
      most_likely_inflow: Math.round(mostLikely * 100) / 100,
      expected_delay: Math.round(expectedDelay * 100) / 100,
      collection_rate: Math.round(likelyRate * 10000) / 10000,
      confidence_score: confidence,
      model_used: 'holt_exponential_smoothing'
    })
  }

  console.log(`  Cash Flow Predictor: ${forecasts.length} monthly forecasts`)
  console.log(`    Avg collection rate: ${(avgCollectionRate * 100).toFixed(1)}%`)
  console.log(`    Model confidence (MAPE): ${confidence}%`)

  return forecasts
}
