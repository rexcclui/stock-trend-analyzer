/**
 * Simple Moving Average (SMA) calculations
 */

/**
 * Calculate SMA for a given period
 * @param {Array} data - Array of price data objects with 'close' property
 * @param {number} period - Number of periods for SMA calculation
 * @returns {Array} Array of SMA values (null for insufficient data points)
 */
export const calculateSMA = (data, period) => {
  const smaData = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      smaData.push(null)
    } else {
      let sum = 0
      for (let j = 0; j < period; j++) {
        sum += data[i - j].close
      }
      smaData.push(sum / period)
    }
  }
  return smaData
}

/**
 * Pre-calculate all SMAs for multiple periods
 * @param {Array} prices - Array of price data
 * @param {Array} periods - Array of SMA periods to calculate
 * @returns {Object} Object with period as key and SMA array as value
 */
export const calculateAllSMAs = (prices, periods) => {
  const smaCache = {}
  periods.forEach(period => {
    smaCache[period] = calculateSMA(prices, period)
  })
  return smaCache
}
