import { useMemo } from 'react'

/**
 * Custom hook for performance comparison calculations
 * @param {boolean} enabled - Whether performance comparison is enabled
 * @param {Array} data - Price data
 * @param {Object} spyData - SPY benchmark data
 * @param {string} comparisonMode - Comparison mode ('line' or 'color')
 * @param {number} comparisonDays - Number of days for rolling comparison
 * @returns {Object} Performance variance data and thresholds
 */
export const usePerformanceComparison = (
  enabled,
  data,
  spyData,
  comparisonMode,
  comparisonDays
) => {
  const performanceVariances = useMemo(() => {
    if (!enabled || !spyData || comparisonMode !== 'color' || !data || data.length === 0) {
      return []
    }

    const variances = []
    const lookbackPeriod = comparisonDays

    // Build a map of benchmark prices by date
    const benchmarkPriceByDate = {}
    spyData.prices.forEach(p => {
      benchmarkPriceByDate[p.date] = p.close
    })

    for (let i = 0; i < data.length; i++) {
      const currentPrice = data[i]
      const currentBenchmarkPrice = benchmarkPriceByDate[currentPrice.date]

      // Look back the specified number of days
      const startIdx = Math.max(0, i - lookbackPeriod)
      const startPrice = data[startIdx]
      const startBenchmarkPrice = benchmarkPriceByDate[startPrice.date]

      if (currentBenchmarkPrice && startBenchmarkPrice && startPrice.close && startBenchmarkPrice !== 0 && startPrice.close !== 0) {
        // Calculate performance (percentage change)
        const stockPerformance = ((currentPrice.close - startPrice.close) / startPrice.close) * 100
        const benchmarkPerformance = ((currentBenchmarkPrice - startBenchmarkPrice) / startBenchmarkPrice) * 100

        // Calculate variance (stock performance - benchmark performance)
        const variance = stockPerformance - benchmarkPerformance
        variances[i] = variance
      } else {
        variances[i] = null
      }
    }

    return variances
  }, [enabled, data, spyData, comparisonMode, comparisonDays])

  const performanceVarianceThresholds = useMemo(() => {
    if (!enabled || performanceVariances.length === 0 || comparisonMode !== 'color') {
      return { top20: null, bottom20: null }
    }

    const validVariances = performanceVariances.filter(v => v !== null)
    if (validVariances.length === 0) return { top20: null, bottom20: null }

    const sorted = [...validVariances].sort((a, b) => a - b)
    const top20Index = Math.floor(sorted.length * 0.8)
    const bottom20Index = Math.floor(sorted.length * 0.2)

    return {
      top20: sorted[top20Index],
      bottom20: sorted[bottom20Index]
    }
  }, [enabled, performanceVariances, comparisonMode])

  return {
    performanceVariances,
    performanceVarianceThresholds
  }
}
