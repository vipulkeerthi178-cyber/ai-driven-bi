import { useQuery } from 'react-query'
import { productService } from '../services/productService'

export function useProducts() {
  return useQuery(
    'products',
    () => productService.getAll(),
    {
      staleTime: 30 * 60 * 1000, // Products change infrequently
      cacheTime: 60 * 60 * 1000, // 1 hour
      refetchOnWindowFocus: false,
    }
  )
}

export function useProduct(productCode) {
  return useQuery(
    ['product', productCode],
    () => productService.getByCode(productCode),
    {
      enabled: !!productCode,
      staleTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )
}

export function useProductsByCategory(category) {
  return useQuery(
    ['products-by-category', category],
    () => productService.getByCategory(category),
    {
      enabled: !!category,
      staleTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )
}
