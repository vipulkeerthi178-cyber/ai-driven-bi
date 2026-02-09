import { supabase } from '../lib/supabase'

export const inventoryService = {
  /**
   * Get all inventory items with product details
   */
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          *,
          products(
            product_name,
            product_code,
            category,
            selling_price,
            cost_price
          )
        `)
        .order('current_stock_liters', { ascending: false })

      if (error) throw error

      // Normalize: flatten product_code for backward compatibility
      const normalized = data.map(inv => ({
        ...inv,
        product_code: inv.products?.product_code || null,
      }))
      return normalized
    } catch (error) {
      console.error('Error fetching inventory:', error)
      throw error
    }
  },

  /**
   * Get inventory movements for a product
   */
  async getMovements(productCode, limit = 50) {
    try {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('*')
        .eq('product_id', productCode)
        .order('movement_date', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching inventory movements:', error)
      throw error
    }
  },

  /**
   * Get inventory by product code
   */
  async getByProduct(productCode) {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          *,
          products(
            product_name,
            product_code,
            category,
            selling_price,
            cost_price
          )
        `)
        .eq('product_id', productCode)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching inventory for product:', error)
      throw error
    }
  },
}
