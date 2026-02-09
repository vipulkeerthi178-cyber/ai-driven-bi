/**
 * Risk Scorer — Multi-feature weighted scoring with logistic sigmoid
 *
 * Algorithm:
 * 1. Compute 6 features per customer from transaction history
 * 2. Min-max normalize each feature across all customers
 * 3. Weighted combination of features
 * 4. Sigmoid transform for probability output
 * 5. Scale to 0-100 risk score
 *
 * Features:
 *   overdue_ratio, outstanding_ratio, avg_payment_delay,
 *   credit_utilization, recency_score, partial_payment_ratio
 */
import * as ss from 'simple-statistics'

// Sigmoid function: maps any real number to (0, 1)
function sigmoid(x) {
  return 1 / (1 + Math.exp(-x))
}

// Feature weights (sum to 1.0) — tuned for payment risk
const WEIGHTS = {
  overdue_ratio: 0.25,
  outstanding_ratio: 0.20,
  avg_payment_delay: 0.20,
  credit_utilization: 0.15,
  recency_score: 0.10,
  partial_payment_ratio: 0.10
}

export function scoreCustomerRisk(transactions, customers) {
  const now = new Date()
  const results = []

  // Build customer lookup
  const customerMap = {}
  customers.forEach(c => { customerMap[c.id] = c })

  // Compute raw features for each customer
  const customerFeatures = {}

  // Group transactions by customer
  const customerTxns = {}
  transactions.forEach(t => {
    const cid = t.customer_id
    if (!customerTxns[cid]) customerTxns[cid] = []
    customerTxns[cid].push(t)
  })

  for (const [customerId, txns] of Object.entries(customerTxns)) {
    const customer = customerMap[customerId]
    if (!customer) continue

    const totalTxns = txns.length
    if (totalTxns === 0) continue

    // Feature 1: Overdue ratio
    const overdueCount = txns.filter(t => t.payment_status === 'Overdue').length
    const overdueRatio = overdueCount / totalTxns

    // Feature 2: Outstanding ratio
    const totalRevenue = txns.reduce((s, t) => s + (parseFloat(t.total_amount) || 0), 0)
    const totalOutstanding = txns.reduce((s, t) => s + (parseFloat(t.outstanding_amount) || 0), 0)
    const outstandingRatio = totalRevenue > 0 ? totalOutstanding / totalRevenue : 0

    // Feature 3: Average payment delay (days)
    const delays = []
    txns.forEach(t => {
      if (t.payment_received_date && t.payment_due_date) {
        const due = new Date(t.payment_due_date)
        const paid = new Date(t.payment_received_date)
        const delayDays = (paid - due) / (1000 * 60 * 60 * 24)
        delays.push(Math.max(0, delayDays))
      }
    })
    const avgDelay = delays.length > 0 ? ss.mean(delays) : 0

    // Feature 4: Credit utilization
    const creditLimit = parseFloat(customer.credit_limit) || 1
    const creditUtilization = Math.min(1, totalOutstanding / creditLimit)

    // Feature 5: Recency score (higher = longer since last transaction = riskier)
    const lastTxnDate = new Date(Math.max(...txns.map(t => new Date(t.transaction_date))))
    const daysSinceLastTxn = (now - lastTxnDate) / (1000 * 60 * 60 * 24)
    const recencyScore = Math.min(1, daysSinceLastTxn / 180) // Normalize to 6 months

    // Feature 6: Partial payment ratio
    const partialCount = txns.filter(t => t.payment_status === 'Partial').length
    const partialRatio = partialCount / totalTxns

    customerFeatures[customerId] = {
      overdue_ratio: overdueRatio,
      outstanding_ratio: outstandingRatio,
      avg_payment_delay: avgDelay,
      credit_utilization: creditUtilization,
      recency_score: recencyScore,
      partial_payment_ratio: partialRatio,
      // Raw data for output
      _overdueCount: overdueCount,
      _totalOutstanding: totalOutstanding,
      _totalRevenue: totalRevenue,
      _avgDelay: avgDelay,
      _totalTxns: totalTxns
    }
  }

  // Min-max normalize each feature across all customers
  const featureNames = Object.keys(WEIGHTS)
  const allCustomerIds = Object.keys(customerFeatures)

  const featureMin = {}
  const featureMax = {}
  featureNames.forEach(f => {
    const values = allCustomerIds.map(cid => customerFeatures[cid][f])
    featureMin[f] = Math.min(...values)
    featureMax[f] = Math.max(...values)
  })

  // Score each customer
  for (const customerId of allCustomerIds) {
    const features = customerFeatures[customerId]
    const customer = customerMap[customerId]

    // Normalize features to [0, 1]
    let weightedSum = 0
    const normalizedFeatures = {}

    featureNames.forEach(f => {
      const range = featureMax[f] - featureMin[f]
      const normalized = range > 0 ? (features[f] - featureMin[f]) / range : 0
      normalizedFeatures[f] = Math.round(normalized * 1000) / 1000
      weightedSum += normalized * WEIGHTS[f]
    })

    // Apply sigmoid to get probability (shift and scale for better distribution)
    // weightedSum is 0-1, map to sigmoid input range [-3, 3] for good spread
    const sigmoidInput = (weightedSum - 0.5) * 6
    const delayProbability = sigmoid(sigmoidInput)

    // Scale to 0-100 risk score
    const riskScore = Math.round(delayProbability * 100 * 100) / 100

    // Risk level classification
    let riskLevel = 'Low'
    if (riskScore >= 60) riskLevel = 'High'
    else if (riskScore >= 30) riskLevel = 'Medium'

    // Expected delay days (from linear regression on actual delays if enough data)
    let expectedDelayDays = features._avgDelay
    if (features._overdueCount > 0) {
      // Scale by risk probability
      expectedDelayDays = Math.round(features._avgDelay * (1 + delayProbability) * 10) / 10
    }

    results.push({
      customer_id: customerId,
      risk_score: riskScore,
      risk_level: riskLevel,
      payment_delay_probability: Math.round(delayProbability * 10000) / 10000,
      expected_delay_days: Math.round(expectedDelayDays * 10) / 10,
      overdue_invoice_count: features._overdueCount,
      total_outstanding: Math.round(features._totalOutstanding * 100) / 100,
      credit_utilization: Math.round((features.credit_utilization) * 10000) / 10000,
      features: normalizedFeatures
    })
  }

  console.log(`  Risk Scorer: ${results.length} customers scored`)
  console.log(`    High risk: ${results.filter(r => r.risk_level === 'High').length}`)
  console.log(`    Medium risk: ${results.filter(r => r.risk_level === 'Medium').length}`)
  console.log(`    Low risk: ${results.filter(r => r.risk_level === 'Low').length}`)

  return results
}
