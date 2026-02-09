import { useQuery } from 'react-query'
import { predictionService } from '../services/predictionService'

/**
 * Hook to get the latest prediction run metadata
 */
export function usePredictionRun() {
  return useQuery(
    'prediction-run',
    () => predictionService.getLatestRun(),
    {
      staleTime: 30 * 60 * 1000, // 30 minutes
      cacheTime: 60 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )
}

/**
 * Hook to get ML demand predictions
 */
export function useMLDemand(runId) {
  return useQuery(
    ['ml-demand', runId],
    () => predictionService.getDemandPredictions(runId),
    {
      enabled: !!runId,
      staleTime: 30 * 60 * 1000,
      cacheTime: 60 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )
}

/**
 * Hook to get ML customer risk scores
 */
export function useMLRiskScores(runId) {
  return useQuery(
    ['ml-risk-scores', runId],
    () => predictionService.getRiskScores(runId),
    {
      enabled: !!runId,
      staleTime: 30 * 60 * 1000,
      cacheTime: 60 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )
}

/**
 * Hook to get ML cash flow forecasts
 */
export function useMLCashFlow(runId) {
  return useQuery(
    ['ml-cashflow', runId],
    () => predictionService.getCashFlowForecasts(runId),
    {
      enabled: !!runId,
      staleTime: 30 * 60 * 1000,
      cacheTime: 60 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )
}

/**
 * Hook to get ML inventory forecasts
 */
export function useMLInventory(runId) {
  return useQuery(
    ['ml-inventory', runId],
    () => predictionService.getInventoryForecasts(runId),
    {
      enabled: !!runId,
      staleTime: 30 * 60 * 1000,
      cacheTime: 60 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )
}
