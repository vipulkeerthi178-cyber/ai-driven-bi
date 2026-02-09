import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { AlertTriangle, TrendingDown, DollarSign, Users, CheckCircle, XCircle, Bot } from 'lucide-react';
import { useTransactions } from '../hooks/useTransactions';
import { useCustomers } from '../hooks/useCustomers';
import { usePredictionRun, useMLRiskScores } from '../hooks/usePredictions';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorAlert from '../components/ErrorAlert';
import { formatCurrency, formatLargeNumber, calculateCustomerRisk } from '../utils/dataProcessing';

export default function RiskManagement() {
  const { data: transactionsData, isLoading: loadingTxn, error: errorTxn, refetch } = useTransactions();
  const { data: customersData, isLoading: loadingCust, error: errorCust } = useCustomers();
  const { data: predictionRun } = usePredictionRun();
  const { data: mlRiskData } = useMLRiskScores(predictionRun?.id);

  if (loadingTxn || loadingCust) {
    return <LoadingSpinner message="Loading risk data..." />;
  }
  if (errorTxn || errorCust) {
    return <ErrorAlert error={errorTxn || errorCust} retry={refetch} title="Failed to Load Risk Data" />;
  }
  if (!transactionsData || !customersData) {
    return <LoadingSpinner message="Loading risk data..." />;
  }

  return <RiskContent transactionsData={transactionsData} customersData={customersData} mlRiskData={mlRiskData} predictionRun={predictionRun} />;
}

function RiskContent({ transactionsData, customersData, mlRiskData, predictionRun }) {
  const hasMLData = mlRiskData && mlRiskData.length > 0;

  // Customer risk data — use ML if available, else fallback
  const customerRiskData = useMemo(() => {
    if (hasMLData) {
      return mlRiskData.map(r => {
        const creditLimit = parseFloat(r.credit_limit) || 1;
        const outstanding = parseFloat(r.total_outstanding) || 0;
        const riskScore = parseFloat(r.risk_score) || 0;
        const delayProb = parseFloat(r.payment_delay_probability) || 0;

        let recommendation = '';
        if (r.risk_level === 'High') {
          if (outstanding > creditLimit * 0.5) {
            recommendation = 'Reduce credit limit and request advance payment';
          } else {
            recommendation = 'Priority follow-up required - high delay risk';
          }
        } else if (r.risk_level === 'Medium') {
          recommendation = 'Monitor closely - send payment reminder';
        } else {
          recommendation = 'Maintain current relationship';
        }

        return {
          code: r.customer_code || r.customer_id,
          name: r.customer_name || r.customer_code,
          region: r.region || 'Unknown',
          totalRevenue: 0, // Not stored in ML table, computed below
          outstanding,
          riskScore,
          riskLevel: r.risk_level,
          delayProbability: Math.round(delayProb * 100),
          avgDelayDays: (parseFloat(r.expected_delay_days) || 0).toFixed(1),
          overdueCount: r.overdue_invoice_count || 0,
          creditUtilization: parseFloat(r.credit_utilization) || 0,
          recommendation,
          creditLimit,
          isML: true
        };
      });
    }

    // Fallback: client-side calculation
    const customerStats = {};
    transactionsData.forEach(t => {
      if (!customerStats[t.customer_code]) {
        customerStats[t.customer_code] = { totalRevenue: 0, outstanding: 0, transactions: [], overdueCount: 0, partialCount: 0 };
      }
      customerStats[t.customer_code].totalRevenue += parseFloat(t.total_amount) || 0;
      customerStats[t.customer_code].outstanding += parseFloat(t.outstanding_amount) || 0;
      customerStats[t.customer_code].transactions.push(t);
      if (t.payment_status === 'Overdue') customerStats[t.customer_code].overdueCount++;
      if (t.payment_status === 'Partial') customerStats[t.customer_code].partialCount++;
    });

    const customerMap = {};
    customersData.forEach(c => { customerMap[c.customer_code] = c; });

    return Object.entries(customerStats).map(([code, stats]) => {
      const customer = customerMap[code] || {};
      const riskScore = calculateCustomerRisk(code, transactionsData);
      let riskLevel = 'Low';
      if (riskScore >= 60) riskLevel = 'High';
      else if (riskScore >= 30) riskLevel = 'Medium';

      const paidTxns = stats.transactions.filter(t => t.payment_received_date && t.payment_due_date);
      let avgDelayDays = 0;
      if (paidTxns.length > 0) {
        avgDelayDays = paidTxns.reduce((sum, t) => {
          return sum + Math.max(0, (new Date(t.payment_received_date) - new Date(t.payment_due_date)) / 86400000);
        }, 0) / paidTxns.length;
      }

      let recommendation = '';
      const creditLimit = parseFloat(customer.credit_limit) || 0;
      if (riskLevel === 'High') {
        recommendation = stats.outstanding > creditLimit * 0.5 ? 'Reduce credit limit and request advance payment' : 'Priority follow-up required - high delay risk';
      } else if (riskLevel === 'Medium') {
        recommendation = 'Monitor closely - send payment reminder';
      } else {
        recommendation = 'Maintain current relationship';
      }

      return {
        code, name: customer.customer_name || code, region: customer.region || 'Unknown',
        totalRevenue: stats.totalRevenue, outstanding: stats.outstanding, riskScore, riskLevel,
        delayProbability: riskScore, avgDelayDays: avgDelayDays.toFixed(1),
        overdueCount: stats.overdueCount, recommendation, creditLimit, isML: false
      };
    }).sort((a, b) => b.riskScore - a.riskScore);
  }, [transactionsData, customersData, mlRiskData, hasMLData]);

  // Risk distribution
  const riskDistribution = useMemo(() => {
    const dist = { Low: 0, Medium: 0, High: 0 };
    customerRiskData.forEach(c => {
      dist[c.riskLevel]++;
    });
    return [
      { level: 'Low Risk', count: dist.Low, color: '#22C55E' },
      { level: 'Medium Risk', count: dist.Medium, color: '#F59E0B' },
      { level: 'High Risk', count: dist.High, color: '#EF4444' }
    ];
  }, [customerRiskData]);

  // Outstanding by risk level
  const outstandingByRisk = useMemo(() => {
    const dist = { Low: 0, Medium: 0, High: 0 };
    customerRiskData.forEach(c => {
      dist[c.riskLevel] += c.outstanding;
    });
    return [
      { level: 'Low Risk', amount: Math.round(dist.Low), color: '#22C55E' },
      { level: 'Medium Risk', amount: Math.round(dist.Medium), color: '#F59E0B' },
      { level: 'High Risk', amount: Math.round(dist.High), color: '#EF4444' }
    ];
  }, [customerRiskData]);

  // KPIs
  const kpis = useMemo(() => {
    const highRiskCustomers = customerRiskData.filter(c => c.riskLevel === 'High');
    const totalHighRiskOutstanding = highRiskCustomers.reduce((sum, c) => sum + c.outstanding, 0);
    const totalOutstanding = customerRiskData.reduce((sum, c) => sum + c.outstanding, 0);
    const avgRiskScore = customerRiskData.length > 0
      ? customerRiskData.reduce((sum, c) => sum + c.riskScore, 0) / customerRiskData.length
      : 0;

    return {
      highRiskCount: highRiskCustomers.length,
      highRiskOutstanding: totalHighRiskOutstanding,
      totalOutstanding,
      avgRiskScore: avgRiskScore.toFixed(1)
    };
  }, [customerRiskData]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Credit Risk & Non-Payment Prediction</h1>
        <p className="text-gray-600">AI-powered customer risk assessment and payment prediction</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-danger">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="w-8 h-8 text-danger" />
          </div>
          <div className="text-sm text-gray-600 mb-1">High-Risk Customers</div>
          <div className="text-2xl font-bold text-danger">{kpis.highRiskCount}</div>
          <div className="text-xs text-gray-500 mt-1">Require immediate attention</div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-warning">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-8 h-8 text-warning" />
          </div>
          <div className="text-sm text-gray-600 mb-1">High-Risk Outstanding</div>
          <div className="text-2xl font-bold">{formatLargeNumber(kpis.highRiskOutstanding)}</div>
          <div className="text-xs text-gray-500 mt-1">At risk amount</div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-primary">
          <div className="flex items-center justify-between mb-2">
            <TrendingDown className="w-8 h-8 text-primary" />
          </div>
          <div className="text-sm text-gray-600 mb-1">Total Outstanding</div>
          <div className="text-2xl font-bold">{formatLargeNumber(kpis.totalOutstanding)}</div>
          <div className="text-xs text-gray-500 mt-1">All customers</div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-secondary">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-8 h-8 text-secondary" />
          </div>
          <div className="text-sm text-gray-600 mb-1">Avg Risk Score</div>
          <div className="text-2xl font-bold">{kpis.avgRiskScore}</div>
          <div className="text-xs text-gray-500 mt-1">Portfolio health metric</div>
        </div>
      </div>

      {/* Risk Scoring Methodology */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Risk Scoring Methodology</h3>
          {hasMLData && (
            <span className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 text-xs font-semibold rounded-full">
              <Bot className="w-3 h-3" /> ML-Powered (Sigmoid Model)
              {predictionRun && <span className="text-purple-600 ml-1">| {new Date(predictionRun.run_at).toLocaleString()}</span>}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="font-semibold text-blue-900 mb-2 text-sm">Overdue Ratio</div>
            <div className="text-2xl font-bold text-blue-700">25%</div>
            <div className="text-xs text-blue-600 mt-1">Payment history</div>
          </div>
          <div className="p-4 bg-red-50 rounded-lg">
            <div className="font-semibold text-red-900 mb-2 text-sm">Outstanding Ratio</div>
            <div className="text-2xl font-bold text-red-700">20%</div>
            <div className="text-xs text-red-600 mt-1">Debt vs revenue</div>
          </div>
          <div className="p-4 bg-yellow-50 rounded-lg">
            <div className="font-semibold text-yellow-900 mb-2 text-sm">Avg Pay Delay</div>
            <div className="text-2xl font-bold text-yellow-700">20%</div>
            <div className="text-xs text-yellow-600 mt-1">Days past due</div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="font-semibold text-green-900 mb-2 text-sm">Credit Utilization</div>
            <div className="text-2xl font-bold text-green-700">15%</div>
            <div className="text-xs text-green-600 mt-1">Usage vs limit</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="font-semibold text-purple-900 mb-2 text-sm">Recency Score</div>
            <div className="text-2xl font-bold text-purple-700">10%</div>
            <div className="text-xs text-purple-600 mt-1">Activity freshness</div>
          </div>
          <div className="p-4 bg-orange-50 rounded-lg">
            <div className="font-semibold text-orange-900 mb-2 text-sm">Partial Payments</div>
            <div className="text-2xl font-bold text-orange-700">10%</div>
            <div className="text-xs text-orange-600 mt-1">Incomplete payments</div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Risk Distribution */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Customer Risk Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={riskDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="level" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#1E3A8A" name="Number of Customers">
                {riskDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Outstanding by Risk */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Outstanding Amount by Risk Level</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={outstandingByRisk}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="level" />
              <YAxis tickFormatter={(value) => formatLargeNumber(value)} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="amount" fill="#1E3A8A" name="Outstanding Amount">
                {outstandingByRisk.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Customer Risk Table */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Customer Risk Assessment Table</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Customer</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Region</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Outstanding</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Risk Score</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Delay Prob</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Risk Level</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">AI Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {customerRiskData.slice(0, 20).map((customer, idx) => (
                <tr key={customer.code} className={`border-b hover:bg-gray-50 ${
                  customer.riskLevel === 'High' ? 'bg-red-50' :
                  customer.riskLevel === 'Medium' ? 'bg-yellow-50' : ''
                }`}>
                  <td className="py-3 px-4 text-sm font-medium">{customer.name}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{customer.region}</td>
                  <td className="py-3 px-4 text-sm text-right font-semibold">
                    {formatLargeNumber(customer.outstanding)}
                  </td>
                  <td className="py-3 px-4 text-sm text-right">
                    <span className="font-mono font-semibold">{customer.riskScore.toFixed(0)}/100</span>
                  </td>
                  <td className="py-3 px-4 text-sm text-right">
                    <span className={`font-semibold ${
                      customer.delayProbability >= 60 ? 'text-red-600' :
                      customer.delayProbability >= 30 ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>
                      {customer.delayProbability.toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      customer.riskLevel === 'High' ? 'bg-red-100 text-red-800' :
                      customer.riskLevel === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {customer.riskLevel}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    {customer.recommendation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* AI Action Suggestions */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded">
            <div className="flex items-start">
              <XCircle className="w-5 h-5 text-red-600 mt-0.5 mr-2" />
              <div>
                <div className="font-semibold text-red-900">High Risk Actions</div>
                <div className="text-sm text-red-700 mt-1">
                  {customerRiskData.filter(c => c.riskLevel === 'High').length} customers:
                  Reduce credit limits, request advances
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded">
            <div className="flex items-start">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 mr-2" />
              <div>
                <div className="font-semibold text-yellow-900">Medium Risk Actions</div>
                <div className="text-sm text-yellow-700 mt-1">
                  {customerRiskData.filter(c => c.riskLevel === 'Medium').length} customers:
                  Send payment reminders, monitor closely
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-green-50 border-l-4 border-green-500 rounded">
            <div className="flex items-start">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-2" />
              <div>
                <div className="font-semibold text-green-900">Low Risk Actions</div>
                <div className="text-sm text-green-700 mt-1">
                  {customerRiskData.filter(c => c.riskLevel === 'Low').length} customers:
                  Maintain current terms, explore growth
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
