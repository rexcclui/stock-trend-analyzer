import { useMemo } from 'react'
import { calculateSMA } from '../utils/calculations'

/**
 * Custom hook to cache SMA calculations
 * @param {Array} prices - Price data
 * @param {Array} smaPeriods - Array of SMA periods to calculate
 * @returns {Object} Cached SMA data by period
 */
export const useSMACache = (prices, smaPeriods) => {
  return useMemo(() => {
    const smaCache = {}
    smaPeriods.forEach(period => {
      smaCache[period] = calculateSMA(prices, period)
    })
    return smaCache
  }, [prices, smaPeriods])
}
