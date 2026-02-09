import { supabase } from '../lib/supabase'

export const transactionService = {
  /**
   * Get all transactions with optional filters
   */
  async getAll(filters = {}) {
    try {
      let query = supabase
        .from('transactions')
        .select(`
          *,
          customers(customer_name, customer_code, region, customer_type, credit_limit, payment_terms),
          products(product_name, product_code, category, selling_price, cost_price)
        `)
        .order('transaction_date', { ascending: false })

      // Apply filters
      if (filters.region) {
        query = query.eq('region', filters.region)
      }
      if (filters.customer_id) {
        query = query.eq('customer_id', filters.customer_id)
      }
      if (filters.product_id) {
        query = query.eq('product_id', filters.product_id)
      }
      if (filters.startDate) {
        query = query.gte('transaction_date', filters.startDate)
      }
      if (filters.endDate) {
        query = query.lte('transaction_date', filters.endDate)
      }
      if (filters.payment_status) {
        query = query.eq('payment_status', filters.payment_status)
      }

      const { data, error } = await query

      if (error) throw error

      // Normalize: flatten joined fields for backward compatibility with page logic
      const normalized = data.map(t => ({
        ...t,
        customer_code: t.customers?.customer_code || null,
        product_code: t.products?.product_code || null,
        customer_name: t.customers?.customer_name || null,
        credit_limit: t.customers?.credit_limit || 0,
        payment_terms: t.customers?.payment_terms || 30,
      }))
      return normalized
    } catch (error) {
      console.error('Error fetching transactions:', error)
      throw error
    }
  },

  /**
   * Get monthly statistics
   */
  async getMonthlyStats(months = 15) {
    try {
      const startDate = new Date()
      startDate.setMonth(startDate.getMonth() - months)

      const { data, error} = await supabase
        .from('transactions')
        .select('*')
        .gte('transaction_date', startDate.toISOString())
        .order('transaction_date', { ascending: true })

      if (error) throw error

      // Group by month on client side
      const monthlyData = {}
      data.forEach(t => {
        const month = t.transaction_date.substring(0, 7) // YYYY-MM
        if (!monthlyData[month]) {
          monthlyData[month] = {
            revenue: 0,
            count: 0,
            outstanding: 0,
          }
        }
        monthlyData[month].revenue += t.total_amount || 0
        monthlyData[month].outstanding += t.outstanding_amount || 0
        monthlyData[month].count += 1
      })

      return monthlyData
    } catch (error) {
      console.error('Error fetching monthly stats:', error)
      throw error
    }
  },

  /**
   * Get transactions by customer
   */
  async getByCustomer(customerCode) {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('customer_code', customerCode)
        .order('transaction_date', { ascending: false })

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching customer transactions:', error)
      throw error
    }
  },

  /**
   * Get AI predictions for future transactions
   */
  async getPredictions() {
    try {
      // Get latest prediction run
      const { data: latestRun, error: runError } = await supabase
        .from('prediction_runs')
        .select('prediction_run_id')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (runError) throw runError
      if (!latestRun) return []

      // Get predictions for latest run
      const { data, error } = await supabase
        .from('transaction_predictions')
        .select(`
          *,
          products(product_name, category)
        `)
        .eq('prediction_run_id', latestRun.prediction_run_id)
        .order('predicted_date', { ascending: true })

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching predictions:', error)
      // Return empty array if no predictions exist yet
      return []
    }
  },
}
