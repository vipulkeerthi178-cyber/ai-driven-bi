import { useQuery } from 'react-query'
import { customerService } from '../services/customerService'

export function useCustomers() {
  return useQuery(
    'customers',
    () => customerService.getAll(),
    {
      staleTime: 10 * 60 * 1000, // 10 minutes
      cacheTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )
}

export function useCustomer(customerCode) {
  return useQuery(
    ['customer', customerCode],
    () => customerService.getByCode(customerCode),
    {
      enabled: !!customerCode,
      staleTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )
}

export function useCustomersWithRisk() {
  return useQuery(
    'customers-with-risk',
    () => customerService.getWithRiskScores(),
    {
      staleTime: 5 * 60 * 1000,
      cacheTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )
}

export function useCustomersByRegion(region) {
  return useQuery(
    ['customers-by-region', region],
    () => customerService.getByRegion(region),
    {
      enabled: !!region,
      staleTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )
}
