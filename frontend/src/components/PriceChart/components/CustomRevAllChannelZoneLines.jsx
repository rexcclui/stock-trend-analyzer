import React from 'react'

/**
 * Custom component to render zone lines for reversed all channels
 * Shows volume-weighted zones with colored dashed lines and percentage labels
 *
 * @param {Object} props - Component props
 * @param {boolean} props.revAllChannelEnabled - Whether reversed all channels are enabled
 * @param {Array} props.revAllChannels - Array of reversed channel configurations
 * @param {Object} props.revAllChannelsVisibility - Visibility state for each channel
 * @param {Object} props.revAllChannelZones - Zone data for each channel
 * @param {Array} props.chartDataWithZones - Chart data with zone information
 * @param {Object} props.xAxisMap - X-axis mapping from recharts
 * @param {Object} props.yAxisMap - Y-axis mapping from recharts
 */
export const CustomRevAllChannelZoneLines = ({
  revAllChannelEnabled,
  revAllChannels,
  revAllChannelsVisibility,
  revAllChannelZones,
  chartDataWithZones,
  xAxisMap,
  yAxisMap
}) => {
  if (!revAllChannelEnabled || revAllChannels.length === 0 || Object.keys(revAllChannelZones).length === 0) return null

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
        const zones = revAllChannelZones[channelIndex]
        if (!zones) return null

        return zones.map((zone, zoneIndex) => {
          const points = chartDataWithZones.map((point) => {
            const upper = point[`revAllChannel${channelIndex}Zone${zoneIndex}Upper`]
            if (upper === undefined) return null

            const x = xAxis.scale(point.date)
            const y = yAxis.scale(upper)
            return { x, y }
          }).filter(p => p !== null)

          if (points.length < 2) return null

          // Create path for the zone boundary line
          let pathData = `M ${points[0].x} ${points[0].y}`
          for (let i = 1; i < points.length; i++) {
            pathData += ` L ${points[i].x} ${points[i].y}`
          }

          const lastPoint = points[points.length - 1]

          // Opacity and color intensity based on volume weight: higher volume = more intense
          const minOpacity = 0.3
          const maxOpacity = 0.9
          const opacity = minOpacity + (zone.volumeWeight * (maxOpacity - minOpacity))

          // Parse the channel color and adjust lightness based on volume weight
          // Higher volume = deeper/darker color
          const colorMap = {
            '#3b82f6': 217, // Blue
            '#8b5cf6': 266, // Purple
            '#f59e0b': 38,  // Amber
            '#10b981': 160, // Green
            '#06b6d4': 188, // Cyan
            '#f97316': 25,  // Orange
            '#ec4899': 330, // Pink
            '#84cc16': 75,  // Lime
          }
          const hue = colorMap[channelColor] || 217
          const minLightness = 35 // Darker
          const maxLightness = 65 // Lighter
          const lightness = maxLightness - (zone.volumeWeight * (maxLightness - minLightness))
          const color = `hsl(${hue}, 70%, ${lightness}%)`

          return (
            <g key={`rev-channel-${channelIndex}-zone-${zoneIndex}`}>
              {/* Zone boundary line */}
              <path
                d={pathData}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray="2 2"
                opacity={opacity}
              />

              {/* Volume percentage label at the end of the line */}
              <g>
                {/* Background rectangle for better readability */}
                <rect
                  x={lastPoint.x - 30}
                  y={lastPoint.y - 8}
                  width={25}
                  height={16}
                  fill="rgba(15, 23, 42, 0.85)"
                  stroke={color}
                  strokeWidth={0.5}
                  rx={2}
                />
                <text
                  x={lastPoint.x - 5}
                  y={lastPoint.y}
                  fill={`hsl(${hue}, 70%, ${Math.max(20, lightness - (zone.volumeWeight * 30))}%)`}
                  fontSize="11"
                  fontWeight={zone.volumeWeight > 0.3 ? "800" : "700"}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {(zone.volumeWeight * 100).toFixed(1)}%
                </text>
              </g>
            </g>
          )
        })
      })}
    </g>
  )
}
