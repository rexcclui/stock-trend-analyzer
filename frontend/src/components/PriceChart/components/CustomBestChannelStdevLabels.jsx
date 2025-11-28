import React from 'react'

/**
 * Custom component to render stdev labels at midpoint of Best Channel lower bounds
 * Shows standard deviation multiplier (σ) and percentage of points inside the channel
 *
 * @param {Object} props - Component props
 * @param {boolean} props.bestChannelEnabled - Whether best channels are enabled
 * @param {Array} props.bestChannels - Array of best channel configurations
 * @param {Object} props.bestChannelsVisibility - Visibility state for each channel
 * @param {Array} props.chartDataWithZones - Chart data with zone information
 * @param {Object} props.xAxisMap - X-axis mapping from recharts
 * @param {Object} props.yAxisMap - Y-axis mapping from recharts
 */
export const CustomBestChannelStdevLabels = ({
  bestChannelEnabled,
  bestChannels,
  bestChannelsVisibility,
  chartDataWithZones,
  xAxisMap,
  yAxisMap
}) => {
  if (!bestChannelEnabled || bestChannels.length === 0) return null

  const xAxis = xAxisMap?.[0]
  const yAxis = yAxisMap?.[0]

  if (!xAxis || !yAxis) return null

  // Color palette matching best channels
  const channelColors = [
    '#f59e0b',  // Amber
    '#f97316',  // Orange
    '#eab308',  // Yellow
    '#fb923c',  // Light Orange
    '#fbbf24',  // Light Amber
  ]

  return (
    <g>
      {bestChannels.map((channel, channelIndex) => {
        const isVisible = bestChannelsVisibility[channelIndex] !== false
        if (!isVisible) return null

        // Find all points in chartDataWithZones that have this channel's data
        const pointsWithChannel = chartDataWithZones
          .map((point, idx) => ({ point, idx }))
          .filter(({ point }) => point[`bestChannel${channelIndex}Lower`] !== undefined)

        if (pointsWithChannel.length === 0) return null

        // Find the midpoint among visible points with this channel
        const midIndex = Math.floor(pointsWithChannel.length / 2)
        const { point: midPoint } = pointsWithChannel[midIndex]

        const x = xAxis.scale(midPoint.date)
        const y = yAxis.scale(midPoint[`bestChannel${channelIndex}Lower`])

        if (x === undefined || y === undefined) return null

        const color = channelColors[channelIndex % channelColors.length]
        const stdevText = `${channel.stdevMultiplier.toFixed(2)}σ`
        const percentText = channel.percentInside !== undefined
          ? `${channel.percentInside.toFixed(0)}%`
          : ''

        return (
          <g key={`best-channel-label-${channelIndex}`}>
            {/* Background rectangle for label - positioned under bottom slope */}
            <rect
              x={x - 30}
              y={y + 8}
              width={60}
              height={16}
              fill="rgba(15, 23, 42, 0.9)"
              stroke={color}
              strokeWidth={1}
              rx={3}
            />
            {/* Stdev and percentage label under bottom slope midpoint */}
            <text
              x={x}
              y={y + 18}
              fill={color}
              fontSize="11"
              fontWeight="700"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {stdevText} {percentText}
            </text>
          </g>
        )
      })}
    </g>
  )
}
