import React from 'react'

/**
 * Custom tooltip component for the price chart
 * @param {boolean} active - Whether tooltip is active
 * @param {Array} payload - Data payload from chart
 * @param {string} comparisonMode - Comparison mode ('line' or 'color')
 * @param {Array} comparisonStocks - Array of comparison stocks
 * @param {Array} smaPeriods - SMA periods to display
 * @param {Object} smaVisibility - Visibility state for each SMA
 * @param {Function} getSmaColor - Function to get SMA color
 */
export const CustomTooltip = ({
  active,
  payload,
  comparisonMode,
  comparisonStocks,
  smaPeriods,
  smaVisibility,
  getSmaColor
}) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-slate-800 p-3 border border-slate-600 rounded shadow-lg">
        <p className="font-semibold text-slate-100">{data.date}</p>
        <p className="text-sm text-slate-300">Close: ${data.close?.toFixed(2)}</p>

        {/* Show comparison stock prices and performance */}
        {comparisonMode === 'line' && comparisonStocks && comparisonStocks.map(compStock => {
          const compPriceKey = `compPrice_${compStock.symbol}`
          const compPerfKey = `compPerf_${compStock.symbol}`
          const compPrice = data[compPriceKey]
          const compPerf = data[compPerfKey]

          if (compPrice !== null && compPrice !== undefined) {
            const perfColor = compPerf > 0 ? '#3b82f6' : '#ef4444' // Blue for positive, red for negative
            return (
              <div key={compStock.symbol} className="text-sm mt-1">
                <p style={{ color: perfColor }}>
                  {compStock.symbol}: ${compPrice.toFixed(2)}
                  {compPerf !== null && ` (${compPerf >= 0 ? '+' : ''}${compPerf.toFixed(2)}%)`}
                </p>
              </div>
            )
          }
          return null
        })}

        {smaPeriods.map(period => {
          const smaKey = `sma${period}`
          const smaValue = data[smaKey]
          if (smaValue && smaVisibility[period]) {
            return (
              <p key={period} className="text-sm" style={{ color: getSmaColor(period) }}>
                SMA{period}: ${smaValue.toFixed(2)}
              </p>
            )
          }
          return null
        })}
      </div>
    )
  }
  return null
}
