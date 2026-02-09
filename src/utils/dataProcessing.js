// Format currency in Indian format
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Format large numbers (Lakhs/Crores)
export const formatLargeNumber = (num) => {
  if (num >= 10000000) {
    return '₹' + (num / 10000000).toFixed(2) + ' Cr';
  } else if (num >= 100000) {
    return '₹' + (num / 100000).toFixed(2) + ' L';
  }
  return formatCurrency(num);
};

// Determine KPI color
export const getKPIColor = (value, thresholds) => {
  if (value >= thresholds.good) return 'green';
  if (value >= thresholds.warning) return 'amber';
  return 'red';
};

// Group transactions by month
export const groupByMonth = (transactions) => {
  const grouped = {};
  transactions.forEach(t => {
    const month = t.transaction_date.substring(0, 7); // YYYY-MM
    if (!grouped[month]) {
      grouped[month] = {
        revenue: 0,
        count: 0,
        outstanding: 0,
        paid: 0
      };
    }
    grouped[month].revenue += t.total_amount;
    grouped[month].outstanding += t.outstanding_amount;
    if (t.payment_status === 'Paid') {
      grouped[month].paid += t.total_amount;
    }
    grouped[month].count += 1;
  });
  
  // Convert to array and sort by month
  return Object.entries(grouped)
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month));
};

// Group transactions by product category
export const groupByCategory = (transactions, products) => {
  const categoryRevenue = {};
  const productMap = {};
  
  products.forEach(p => {
    productMap[p.product_code] = p.category;
  });
  
  transactions.forEach(t => {
    const category = productMap[t.product_code] || 'Unknown';
    categoryRevenue[category] = (categoryRevenue[category] || 0) + t.total_amount;
  });
  
  return Object.entries(categoryRevenue).map(([name, value]) => ({
    name,
    value: Math.round(value)
  }));
};

// Calculate customer risk score
export const calculateCustomerRisk = (customerCode, transactions) => {
  const customerTxns = transactions.filter(t => t.customer_code === customerCode);
  
  if (customerTxns.length === 0) return 0;
  
  const overdueTxns = customerTxns.filter(t => t.payment_status === 'Overdue').length;
  const overdueRatio = overdueTxns / customerTxns.length;
  
  const totalRevenue = customerTxns.reduce((sum, t) => sum + t.total_amount, 0);
  const totalOutstanding = customerTxns.reduce((sum, t) => sum + t.outstanding_amount, 0);
  const outstandingRatio = totalOutstanding / totalRevenue;
  
  // Risk score: 0-100
  const riskScore = (overdueRatio * 60) + (outstandingRatio * 40);
  
  return Math.min(100, Math.round(riskScore));
};

// Get top customers by revenue with risk
export const getTopCustomersWithRisk = (transactions, customers, limit = 10) => {
  const customerStats = {};
  
  transactions.forEach(t => {
    if (!customerStats[t.customer_code]) {
      customerStats[t.customer_code] = {
        revenue: 0,
        outstanding: 0,
        transactions: []
      };
    }
    customerStats[t.customer_code].revenue += t.total_amount;
    customerStats[t.customer_code].outstanding += t.outstanding_amount;
    customerStats[t.customer_code].transactions.push(t);
  });
  
  const customerMap = {};
  customers.forEach(c => {
    customerMap[c.customer_code] = c.customer_name;
  });
  
  return Object.entries(customerStats)
    .map(([code, stats]) => ({
      code,
      name: customerMap[code] || code,
      revenue: stats.revenue,
      outstanding: stats.outstanding,
      riskScore: calculateCustomerRisk(code, transactions)
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
};

// Generate AI insights — uses real ML prediction data when available
export const generateAIInsights = (transactions, customers, mlData = {}) => {
  const insights = [];
  const { riskScores, demandPredictions, cashFlowForecasts, inventoryForecasts } = mlData;

  // 1. Risk insight — from ML risk scores
  if (riskScores && riskScores.length > 0) {
    const highRisk = riskScores.filter(r => r.risk_level === 'High');
    const medRisk = riskScores.filter(r => r.risk_level === 'Medium');
    if (highRisk.length > 0) {
      const totalAtRisk = highRisk.reduce((s, r) => s + (parseFloat(r.total_outstanding) || 0), 0);
      const avgDelay = (highRisk.reduce((s, r) => s + (parseFloat(r.expected_delay_days) || 0), 0) / highRisk.length).toFixed(0);
      insights.push({
        type: 'warning',
        message: `ML Risk Model: ${highRisk.length} high-risk customers with ${formatLargeNumber(totalAtRisk)} outstanding. Average expected delay: ${avgDelay} days. ${medRisk.length} customers at medium risk.`
      });
    } else if (medRisk.length > 0) {
      insights.push({
        type: 'info',
        message: `ML Risk Model: No high-risk customers detected. ${medRisk.length} customers at medium risk — monitor closely.`
      });
    } else {
      insights.push({
        type: 'success',
        message: `ML Risk Model: All ${riskScores.length} customers are low-risk. Payment health is strong.`
      });
    }
  } else {
    // Fallback
    const highRiskCustomers = getTopCustomersWithRisk(transactions, customers, 100).filter(c => c.riskScore > 60);
    if (highRiskCustomers.length > 0) {
      const totalAtRisk = highRiskCustomers.reduce((sum, c) => sum + c.outstanding, 0);
      insights.push({ type: 'warning', message: `${highRiskCustomers.length} customers show rising delay risk. ${formatLargeNumber(totalAtRisk)} cash flow may be delayed.` });
    }
  }

  // 2. Revenue trend insight — from ML demand predictions or historical
  if (demandPredictions && demandPredictions.length > 0) {
    const months = [...new Set(demandPredictions.map(p => p.prediction_month))].sort();
    const nextMonth = months[0];
    const nextMonthPreds = demandPredictions.filter(p => p.prediction_month === nextMonth);
    const predictedRevenue = nextMonthPreds.reduce((s, p) => s + (parseFloat(p.predicted_revenue) || 0), 0);
    const upTrend = nextMonthPreds.filter(p => p.trend_direction === 'up').length;
    const downTrend = nextMonthPreds.filter(p => p.trend_direction === 'down').length;

    const monthlyData = groupByMonth(transactions);
    const lastActual = monthlyData[monthlyData.length - 1]?.revenue || 0;
    const changePercent = lastActual > 0 ? ((predictedRevenue - lastActual) / lastActual * 100).toFixed(1) : 0;

    if (changePercent > 0) {
      insights.push({
        type: 'success',
        message: `ML Sales Forecast: Next month revenue predicted at ${formatLargeNumber(predictedRevenue)} (+${changePercent}%). ${upTrend} products trending up, ${downTrend} trending down.`
      });
    } else {
      insights.push({
        type: 'warning',
        message: `ML Sales Forecast: Next month revenue predicted at ${formatLargeNumber(predictedRevenue)} (${changePercent}%). ${downTrend} products trending down — review pricing and promotions.`
      });
    }

    // 2b. Top growing products by predicted revenue — with specific names
    const topGrowing = nextMonthPreds
      .filter(p => p.trend_direction === 'up' && p.product_name)
      .sort((a, b) => (parseFloat(b.predicted_revenue) || 0) - (parseFloat(a.predicted_revenue) || 0))
      .slice(0, 3);

    if (topGrowing.length > 0) {
      const names = topGrowing.map(p => {
        const growth = parseFloat(p.growth_rate) || 0;
        return `${p.product_name} (+${(growth * 100).toFixed(0)}%)`;
      }).join(', ');
      insights.push({
        type: 'success',
        message: `Top Growing Products: ${names}. These products show strongest upward demand trend — consider increasing stock and promotions.`
      });
    }

    // 2c. Declining products — names of products trending down
    const declining = nextMonthPreds
      .filter(p => p.trend_direction === 'down' && p.product_name)
      .sort((a, b) => (parseFloat(a.growth_rate) || 0) - (parseFloat(b.growth_rate) || 0))
      .slice(0, 3);

    if (declining.length > 0) {
      const names = declining.map(p => {
        const growth = parseFloat(p.growth_rate) || 0;
        return `${p.product_name} (${(growth * 100).toFixed(0)}%)`;
      }).join(', ');
      insights.push({
        type: 'warning',
        message: `Declining Demand: ${names}. These products show decreasing sales trend — review pricing strategy or consider promotions.`
      });
    }
  } else {
    const monthlyData = groupByMonth(transactions);
    if (monthlyData.length >= 2) {
      const lastMonth = monthlyData[monthlyData.length - 1];
      const previousMonth = monthlyData[monthlyData.length - 2];
      const growth = ((lastMonth.revenue - previousMonth.revenue) / previousMonth.revenue) * 100;
      if (growth > 10) {
        insights.push({ type: 'success', message: `Revenue increased by ${growth.toFixed(1)}% last month. Strong momentum in ${lastMonth.month}.` });
      } else if (growth < -10) {
        insights.push({ type: 'warning', message: `Revenue decreased by ${Math.abs(growth).toFixed(1)}% last month. Review sales pipeline.` });
      }
    }
  }

  // 3. Cash flow insight — from ML cash flow forecasts
  if (cashFlowForecasts && cashFlowForecasts.length > 0) {
    const nextCF = cashFlowForecasts[0];
    const collectionRate = (parseFloat(nextCF.collection_rate) * 100).toFixed(1);
    const bestCase = parseFloat(nextCF.best_case_inflow) || 0;
    const worstCase = parseFloat(nextCF.worst_case_inflow) || 0;
    const mostLikely = parseFloat(nextCF.most_likely_inflow) || 0;
    insights.push({
      type: 'info',
      message: `ML Cash Flow: Next month expected inflow ${formatLargeNumber(mostLikely)} (range: ${formatLargeNumber(worstCase)} – ${formatLargeNumber(bestCase)}). Collection rate: ${collectionRate}%.`
    });
  }

  // 4. Inventory insight — from ML inventory forecasts with product names
  if (inventoryForecasts && inventoryForecasts.length > 0) {
    const criticalItems = inventoryForecasts
      .filter(i => parseFloat(i.days_until_stockout) < 30 && parseFloat(i.days_until_stockout) < 999)
      .sort((a, b) => parseFloat(a.days_until_stockout) - parseFloat(b.days_until_stockout));
    const overstocked = inventoryForecasts
      .filter(i => parseFloat(i.days_until_stockout) > 120)
      .sort((a, b) => parseFloat(b.days_until_stockout) - parseFloat(a.days_until_stockout));

    if (criticalItems.length > 0) {
      const criticalNames = criticalItems.slice(0, 3).map(i =>
        `${i.product_name || 'Unknown'} (${Math.round(parseFloat(i.days_until_stockout))} days)`
      ).join(', ');
      insights.push({
        type: 'warning',
        message: `ML Inventory: ${criticalItems.length} products at stockout risk — ${criticalNames}. ${criticalItems[0].recommendation}`
      });
    }
    if (overstocked.length > 0) {
      const overstockedNames = overstocked.slice(0, 3).map(i =>
        `${i.product_name || 'Unknown'} (${Math.round(parseFloat(i.days_until_stockout))} days)`
      ).join(', ');
      insights.push({
        type: 'info',
        message: `ML Inventory: ${overstocked.length} products overstocked — ${overstockedNames}. Consider reducing orders to free up working capital.`
      });
    }
    if (criticalItems.length === 0 && overstocked.length === 0) {
      insights.push({
        type: 'success',
        message: `ML Inventory: All ${inventoryForecasts.length} products have healthy stock levels. No immediate action needed.`
      });
    }
  } else {
    insights.push({ type: 'info', message: 'Run ML predictions to get inventory optimization insights.' });
  }

  return insights;
};

// Calculate date range label
export const getDateRangeLabel = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  return `Last ${months} months`;
};

// Format percentage
export const formatPercentage = (value, decimals = 1) => {
  return value.toFixed(decimals) + '%';
};
