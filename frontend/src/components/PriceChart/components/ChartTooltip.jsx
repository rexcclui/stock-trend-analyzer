import React from 'react'
import { getSmaColor } from '../utils/colorUtils'

/**
 * Custom tooltip component for the price chart.
 * Displays date, closing price, comparison stock data, and SMA values on hover.
 *
 * @param {Object} props - Component props
 * @param {boolean} props.active - Whether the tooltip is active
 * @param {Array} props.payload - Chart data payload for the hovered point
 * @param {Array} props.comparisonStocks - Array of comparison stock data
 * @param {string} props.comparisonMode - Mode for comparison display
 * @param {Array} props.smaPeriods - Array of SMA periods to display
 * @param {Object} props.smaVisibility - Visibility state for each SMA period
 * @returns {JSX.Element|null} Tooltip element or null if inactive
 */
const ChartTooltip = ({ active, payload, comparisonStocks = [], comparisonMode = 'line', smaPeriods = [], smaVisibility = {} }) => {
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
              <p key={period} className="text-sm" style={{ color: getSmaColor(period, smaPeriods) }}>
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

export default ChartTooltip
