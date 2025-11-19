import React from 'react'

/**
 * Renders standard deviation label at the midpoint of the lower bound for the slope channel.
 *
 * @param {Object} props - Component props
 * @param {boolean} props.slopeChannelEnabled - Whether slope channel is enabled
 * @param {Object} props.slopeChannelInfo - Slope channel information with optimalStdevMult
 * @param {Array} props.chartDataWithZones - Chart data with channel bounds
 * @param {Object} props.xAxisMap - X-axis mapping from recharts
 * @param {Object} props.yAxisMap - Y-axis mapping from recharts
 * @returns {JSX.Element|null} Label SVG element or null if disabled
 */
const SlopeChannelLabels = (props) => {
  const { slopeChannelEnabled, slopeChannelInfo, chartDataWithZones } = props

  if (!slopeChannelEnabled || !slopeChannelInfo) return null

  const { xAxisMap, yAxisMap } = props
  const xAxis = xAxisMap?.[0]
  const yAxis = yAxisMap?.[0]

  if (!xAxis || !yAxis) return null

  // Find the middle point of the lower bound line
  const totalDataLength = chartDataWithZones.length
  const midIndex = Math.floor(totalDataLength / 2)

  // Check if the midpoint is within the visible range
  if (midIndex < 0 || midIndex >= chartDataWithZones.length) {
    return null
  }

  // Get the data point at the middle
  const midPoint = chartDataWithZones[midIndex]
  if (!midPoint || midPoint.channelLower === undefined) {
    return null
  }

  const x = xAxis.scale(midPoint.date)
  const y = yAxis.scale(midPoint.channelLower)

  if (x === undefined || y === undefined) {
    return null
  }

  const stdevText = `${slopeChannelInfo.optimalStdevMult.toFixed(2)}σ`

  return (
    <g>
      {/* Background rectangle for better readability */}
      <rect
        x={x - 20}
        y={y - 8}
        width={40}
        height={16}
        fill="rgba(15, 23, 42, 0.9)"
        stroke="#8b5cf6"
        strokeWidth={1}
        rx={3}
      />
      {/* Stdev label */}
      <text
        x={x}
        y={y}
        fill="#8b5cf6"
        fontSize="11"
        fontWeight="700"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {stdevText}
      </text>
    </g>
  )
}

export default SlopeChannelLabels
