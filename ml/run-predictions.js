/**
 * ML Prediction Pipeline — Main Entry Point
 *
 * Orchestrates all 4 ML models:
 * 1. Sales Forecaster (Linear Regression)
 * 2. Risk Scorer (Multi-feature Sigmoid)
 * 3. Cash Flow Predictor (Holt's Exponential Smoothing)
 * 4. Inventory Optimizer (Safety Stock + Normal CDF)
 *
 * Usage: npm run predict
 */
import { supabase } from './supabase-client.js'
import { forecastSales } from './models/sales-forecaster.js'
import { scoreCustomerRisk } from './models/risk-scorer.js'
import { forecastCashFlow } from './models/cashflow-predictor.js'
import { optimizeInventory } from './models/inventory-optimizer.js'

const MODEL_VERSION = 'v1.0.0'

async function main() {
  console.log('=== ML Prediction Pipeline ===')
  console.log(`Model version: ${MODEL_VERSION}`)
  console.log(`Timestamp: ${new Date().toISOString()}\n`)

  // Step 1: Fetch all data from Supabase
  console.log('[1/6] Fetching data from Supabase...')
  // Fetch all transactions (Supabase default limit is 1000, we have ~2400)
  let allTransactions = []
  let page = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('transaction_date', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (error) throw new Error(`Failed to fetch transactions: ${error.message}`)
    allTransactions = allTransactions.concat(data)
    if (data.length < pageSize) break
    page++
  }
  const transactions = allTransactions
  const txnErr = null

  if (txnErr) throw new Error(`Failed to fetch transactions: ${txnErr.message}`)

  const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('*')

  if (custErr) throw new Error(`Failed to fetch customers: ${custErr.message}`)

  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('*')

  if (prodErr) throw new Error(`Failed to fetch products: ${prodErr.message}`)

  const { data: inventory, error: invErr } = await supabase
    .from('inventory')
    .select('*')

  if (invErr) throw new Error(`Failed to fetch inventory: ${invErr.message}`)

  console.log(`  Transactions: ${transactions.length}`)
  console.log(`  Customers: ${customers.length}`)
  console.log(`  Products: ${products.length}`)
  console.log(`  Inventory: ${inventory.length}\n`)

  // Step 2: Create prediction run record
  console.log('[2/6] Creating prediction run...')
  const { data: run, error: runErr } = await supabase
    .from('prediction_runs')
    .insert({
      model_version: MODEL_VERSION,
      prediction_horizon: '3 months',
      status: 'running'
    })
    .select()
    .single()

  if (runErr) throw new Error(`Failed to create prediction run: ${runErr.message}`)
  const runId = run.id
  console.log(`  Run ID: ${runId}\n`)

  // Step 3: Run Sales Forecaster
  console.log('[3/6] Running Sales Forecaster (Linear Regression)...')
  const salesPredictions = forecastSales(transactions, products)

  if (salesPredictions.length > 0) {
    const salesRows = salesPredictions.map(p => ({
      ...p,
      prediction_run_id: runId
    }))
    const { error: salesErr } = await supabase
      .from('transaction_predictions')
      .insert(salesRows)

    if (salesErr) {
      console.error(`  ERROR writing sales predictions: ${salesErr.message}`)
    } else {
      console.log(`  Written ${salesRows.length} rows to transaction_predictions\n`)
    }
  }

  // Step 4: Run Risk Scorer
  console.log('[4/6] Running Risk Scorer (Multi-feature Sigmoid)...')
  const riskScores = scoreCustomerRisk(transactions, customers)

  if (riskScores.length > 0) {
    const riskRows = riskScores.map(r => ({
      ...r,
      prediction_run_id: runId
    }))
    const { error: riskErr } = await supabase
      .from('customer_risk_scores')
      .insert(riskRows)

    if (riskErr) {
      console.error(`  ERROR writing risk scores: ${riskErr.message}`)
    } else {
      console.log(`  Written ${riskRows.length} rows to customer_risk_scores\n`)
    }
  }

  // Step 5: Run Cash Flow Predictor
  console.log('[5/6] Running Cash Flow Predictor (Holt Exponential Smoothing)...')
  const cashFlowForecasts = forecastCashFlow(transactions)

  if (cashFlowForecasts.length > 0) {
    const cfRows = cashFlowForecasts.map(cf => ({
      ...cf,
      prediction_run_id: runId
    }))
    const { error: cfErr } = await supabase
      .from('cash_flow_forecasts')
      .insert(cfRows)

    if (cfErr) {
      console.error(`  ERROR writing cash flow forecasts: ${cfErr.message}`)
    } else {
      console.log(`  Written ${cfRows.length} rows to cash_flow_forecasts\n`)
    }
  }

  // Step 6: Run Inventory Optimizer
  console.log('[6/6] Running Inventory Optimizer (Safety Stock + Normal CDF)...')
  const inventoryForecasts = optimizeInventory(transactions, products, inventory)

  if (inventoryForecasts.length > 0) {
    const invRows = inventoryForecasts.map(inv => ({
      ...inv,
      prediction_run_id: runId
    }))
    const { error: invFErr } = await supabase
      .from('inventory_forecasts')
      .insert(invRows)

    if (invFErr) {
      console.error(`  ERROR writing inventory forecasts: ${invFErr.message}`)
    } else {
      console.log(`  Written ${invRows.length} rows to inventory_forecasts\n`)
    }
  }

  // Update prediction run with summary
  const totalPredictions = salesPredictions.length + riskScores.length +
    cashFlowForecasts.length + inventoryForecasts.length

  const allConfidences = [
    ...salesPredictions.map(p => p.confidence_score),
    ...cashFlowForecasts.map(p => p.confidence_score),
    ...inventoryForecasts.map(p => p.confidence_score)
  ]
  const avgConfidence = allConfidences.length > 0
    ? Math.round(allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length * 100) / 100
    : 0

  await supabase
    .from('prediction_runs')
    .update({
      total_predictions: totalPredictions,
      avg_confidence: avgConfidence,
      status: 'completed'
    })
    .eq('id', runId)

  console.log('=== Pipeline Complete ===')
  console.log(`Total predictions: ${totalPredictions}`)
  console.log(`Average confidence: ${avgConfidence}%`)
  console.log(`Run ID: ${runId}`)
}

main().catch(err => {
  console.error('\nPipeline FAILED:', err.message)
  process.exit(1)
})
