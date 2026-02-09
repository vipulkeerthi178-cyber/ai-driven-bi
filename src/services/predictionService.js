import { supabase } from '../lib/supabase'

export const predictionService = {
  /**
   * Get the latest prediction run metadata
   */
  async getLatestRun() {
    try {
      const { data, error } = await supabase
        .from('prediction_runs')
        .select('*')
        .eq('status', 'completed')
        .order('run_at', { ascending: false })
        .limit(1)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.warn('No prediction runs found:', error.message)
      return null
    }
  },

  /**
   * Get ML demand predictions (transaction_predictions) for latest run
   */
  async getDemandPredictions(runId) {
    try {
      const { data, error } = await supabase
        .from('transaction_predictions')
        .select(`
          *,
          products(product_name, product_code, category)
        `)
        .eq('prediction_run_id', runId)
        .order('prediction_month', { ascending: true })

      if (error) throw error
      return data.map(p => ({
        ...p,
        product_name: p.products?.product_name || null,
        product_code: p.products?.product_code || null,
        category: p.products?.category || null,
      }))
    } catch (error) {
      console.error('Error fetching demand predictions:', error)
      return []
    }
  },

  /**
   * Get ML customer risk scores for latest run
   */
  async getRiskScores(runId) {
    try {
      const { data, error } = await supabase
        .from('customer_risk_scores')
        .select(`
          *,
          customers(customer_name, customer_code, region, customer_type, credit_limit, payment_terms)
        `)
        .eq('prediction_run_id', runId)
        .order('risk_score', { ascending: false })

      if (error) throw error
      return data.map(r => ({
        ...r,
        customer_name: r.customers?.customer_name || null,
        customer_code: r.customers?.customer_code || null,
        region: r.customers?.region || null,
        customer_type: r.customers?.customer_type || null,
        credit_limit: r.customers?.credit_limit || 0,
        payment_terms: r.customers?.payment_terms || 30,
      }))
    } catch (error) {
      console.error('Error fetching risk scores:', error)
      return []
    }
  },

  /**
   * Get ML cash flow forecasts for latest run
   */
  async getCashFlowForecasts(runId) {
    try {
      const { data, error } = await supabase
        .from('cash_flow_forecasts')
        .select('*')
        .eq('prediction_run_id', runId)
        .order('forecast_month', { ascending: true })

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching cash flow forecasts:', error)
      return []
    }
  },

  /**
   * Get ML inventory forecasts for latest run
   */
  async getInventoryForecasts(runId) {
    try {
      const { data, error } = await supabase
        .from('inventory_forecasts')
        .select(`
          *,
          products(product_name, product_code, category, selling_price, cost_price)
        `)
        .eq('prediction_run_id', runId)

      if (error) throw error
      return data.map(inv => ({
        ...inv,
        product_name: inv.products?.product_name || null,
        product_code: inv.products?.product_code || null,
        category: inv.products?.category || null,
        selling_price: inv.products?.selling_price || 0,
      }))
    } catch (error) {
      console.error('Error fetching inventory forecasts:', error)
      return []
    }
  },
}
