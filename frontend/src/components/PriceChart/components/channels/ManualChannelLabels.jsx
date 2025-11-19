import React from 'react'

/**
 * Renders standard deviation labels beneath the middle of lower bound slope for manual channels.
 * Manual channels are user-defined by dragging on the chart.
 *
 * @param {Object} props - Component props
 * @param {boolean} props.manualChannelEnabled - Whether manual channel mode is enabled
 * @param {Array} props.manualChannels - Array of manual channels with optimalStdevMult
 * @param {Array} props.chartDataWithZones - Chart data with channel bounds
 * @param {Array} props.displayPrices - Full price data array (oldest to newest)
 * @param {Object} props.zoomRange - Current zoom range {start, end}
 * @param {Object} props.xAxisMap - X-axis mapping from recharts
 * @param {Object} props.yAxisMap - Y-axis mapping from recharts
 * @returns {JSX.Element|null} Labels SVG element or null if disabled
 */
const ManualChannelLabels = (props) => {
  const { manualChannelEnabled, manualChannels, chartDataWithZones, displayPrices, zoomRange } = props

  if (!manualChannelEnabled || manualChannels.length === 0) return null

  const { xAxisMap, yAxisMap } = props
  const xAxis = xAxisMap?.[0]
  const yAxis = yAxisMap?.[0]

  if (!xAxis || !yAxis) {
    return null
  }

  const channelColors = [
    '#22c55e', // Green
    '#14b8a6', // Teal
    '#06b6d4', // Cyan
    '#84cc16', // Lime
    '#10b981', // Emerald
  ]

  return (
    <g>
      {manualChannels.map((channel, channelIndex) => {
        // Find the middle point of the lower bound line
        const midIndex = Math.floor((channel.startIndex + channel.endIndex) / 2)

        // IMPORTANT: channel indices are in displayPrices space (oldest to newest)
        // But chartData is REVERSED (newest to oldest), so we need to convert
        const totalDataLength = displayPrices.length
        const midIndexReversed = totalDataLength - 1 - midIndex

        // Now adjust for zoom offset - chartDataWithZones is sliced from zoomRange.start
        const adjustedIndex = midIndexReversed - zoomRange.start

        // Check if the midpoint is within the visible range
        if (adjustedIndex < 0 || adjustedIndex >= chartDataWithZones.length) {
          return null
        }

        // Get the data point at the middle
        const midPoint = chartDataWithZones[adjustedIndex]
        if (!midPoint) {
          return null
        }

        const lowerValue = midPoint[`manualChannel${channelIndex}Lower`]
        if (lowerValue === undefined) {
          return null
        }

        const x = xAxis.scale(midPoint.date)
        const y = yAxis.scale(lowerValue)

        if (x === undefined || y === undefined) {
          return null
        }

        const color = channelColors[channelIndex % channelColors.length]
        const stdevText = `${channel.optimalStdevMult.toFixed(2)}σ`

        return (
          <g key={`manual-channel-label-${channelIndex}`}>
            {/* Background rectangle for better readability */}
            <rect
              x={x - 20}
              y={y + 5}
              width={40}
              height={16}
              fill="rgba(15, 23, 42, 0.9)"
              stroke={color}
              strokeWidth={1}
              rx={3}
            />
            {/* Stdev label */}
            <text
              x={x}
              y={y + 15}
              fill={color}
              fontSize="11"
              fontWeight="700"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {stdevText}
            </text>
          </g>
        )
      })}
    </g>
  )
}

export default ManualChannelLabels
