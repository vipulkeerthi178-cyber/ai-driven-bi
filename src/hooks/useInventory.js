import { useQuery } from 'react-query'
import { inventoryService } from '../services/inventoryService'

export function useInventory() {
  return useQuery(
    'inventory',
    () => inventoryService.getAll(),
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )
}

export function useInventoryMovements(productCode, limit = 50) {
  return useQuery(
    ['inventory-movements', productCode, limit],
    () => inventoryService.getMovements(productCode, limit),
    {
      enabled: !!productCode,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )
}

export function useProductInventory(productCode) {
  return useQuery(
    ['product-inventory', productCode],
    () => inventoryService.getByProduct(productCode),
    {
      enabled: !!productCode,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )
}
