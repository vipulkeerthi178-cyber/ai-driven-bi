import { supabase } from '../lib/supabase'

export const customerService = {
  /**
   * Get all customers
   */
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('customer_name', { ascending: true })

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching customers:', error)
      throw error
    }
  },

  /**
   * Get customer by code
   */
  async getByCode(customerCode) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('customer_code', customerCode)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching customer:', error)
      throw error
    }
  },

  /**
   * Get customers with risk scores
   */
  async getWithRiskScores() {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select(`
          *,
          customer_risk_scores(
            risk_score,
            risk_category,
            overdue_invoices,
            total_outstanding,
            calculated_at
          )
        `)
        .order('customer_name', { ascending: true })

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching customers with risk scores:', error)
      throw error
    }
  },

  /**
   * Get customers by region
   */
  async getByRegion(region) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('region', region)
        .order('customer_name', { ascending: true })

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching customers by region:', error)
      throw error
    }
  },
}
