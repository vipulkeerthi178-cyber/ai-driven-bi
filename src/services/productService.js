import { supabase } from '../lib/supabase'

export const productService = {
  /**
   * Get all products
   */
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('category', { ascending: true })
        .order('product_name', { ascending: true })

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching products:', error)
      throw error
    }
  },

  /**
   * Get product by code
   */
  async getByCode(productCode) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('product_code', productCode)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching product:', error)
      throw error
    }
  },

  /**
   * Get products by category
   */
  async getByCategory(category) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('category', category)
        .order('product_name', { ascending: true })

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching products by category:', error)
      throw error
    }
  },
}
