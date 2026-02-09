import { useQuery } from 'react-query'
import { transactionService } from '../services/transactionService'

export function useTransactions(filters = {}) {
  return useQuery(
    ['transactions', filters],
    () => transactionService.getAll(filters),
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
    }
  )
}

export function useMonthlyStats(months = 15) {
  return useQuery(
    ['monthly-stats', months],
    () => transactionService.getMonthlyStats(months),
    {
      staleTime: 10 * 60 * 1000, // Stats change less frequently
      cacheTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )
}

export function useCustomerTransactions(customerCode) {
  return useQuery(
    ['customer-transactions', customerCode],
    () => transactionService.getByCustomer(customerCode),
    {
      enabled: !!customerCode,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )
}

export function useTransactionPredictions() {
  return useQuery(
    'transaction-predictions',
    () => transactionService.getPredictions(),
    {
      staleTime: 30 * 60 * 1000, // Predictions change even less frequently
      cacheTime: 60 * 60 * 1000, // 1 hour
      refetchOnWindowFocus: false,
    }
  )
}
