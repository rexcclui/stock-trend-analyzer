import React from 'react'

/**
 * Custom component to render stdev labels at midpoint of reversed all channel lower bounds
 * Shows standard deviation multiplier for each channel
 *
 * @param {Object} props - Component props
 * @param {boolean} props.revAllChannelEnabled - Whether reversed all channels are enabled
 * @param {Array} props.revAllChannels - Array of reversed channel configurations
 * @param {Object} props.revAllChannelsVisibility - Visibility state for each channel
 * @param {Array} props.chartDataWithZones - Chart data with zone information
 * @param {Object} props.xAxisMap - X-axis mapping from recharts
 * @param {Object} props.yAxisMap - Y-axis mapping from recharts
 */
export const CustomRevAllChannelStdevLabels = ({
  revAllChannelEnabled,
  revAllChannels,
  revAllChannelsVisibility,
  chartDataWithZones,
  xAxisMap,
  yAxisMap
}) => {
  if (!revAllChannelEnabled || revAllChannels.length === 0) return null

  const xAxis = xAxisMap?.[0]
  const yAxis = yAxisMap?.[0]

  if (!xAxis || !yAxis) return null

  // Define color palette for channels (same as channel lines)
  const channelColors = [
    '#3b82f6',  // Blue
    '#8b5cf6',  // Purple
    '#f59e0b',  // Amber
    '#10b981',  // Green
    '#06b6d4',  // Cyan
    '#f97316',  // Orange
    '#ec4899',  // Pink
    '#84cc16',  // Lime
  ]

  return (
    <g>
      {revAllChannels.map((channel, channelIndex) => {
        const isVisible = revAllChannelsVisibility[channelIndex] !== false
        if (!isVisible) return null

        const channelColor = channelColors[channelIndex % channelColors.length]

        // Find all points in chartDataWithZones that have this channel's data
        const pointsWithChannel = chartDataWithZones
          .map((point, idx) => ({ point, idx }))
          .filter(({ point }) => point[`revAllChannel${channelIndex}Lower`] !== undefined)

        if (pointsWithChannel.length === 0) return null

        // Find the midpoint among those points
        const midIndex = Math.floor(pointsWithChannel.length / 2)
        const { point: midPoint } = pointsWithChannel[midIndex]

        const x = xAxis.scale(midPoint.date)
        const y = yAxis.scale(midPoint[`revAllChannel${channelIndex}Lower`])

        if (x === undefined || y === undefined) {
          return null
        }

        const stdevText = `${channel.optimalStdevMult.toFixed(2)}σ`

        return (
          <g key={`rev-all-channel-stdev-${channelIndex}`}>
            {/* Background rectangle for better readability */}
            <rect
              x={x - 20}
              y={y + 2}
              width={40}
              height={16}
              fill="rgba(15, 23, 42, 0.9)"
              stroke={channelColor}
              strokeWidth={1}
              rx={3}
            />
            {/* Stdev label */}
            <text
              x={x}
              y={y + 10}
              fill={channelColor}
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
