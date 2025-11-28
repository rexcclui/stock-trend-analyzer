import React from 'react'

/**
 * Custom component to render zone lines for best channels
 * Shows volume-weighted zones with colored dashed lines using a cool-to-warm color gradient
 *
 * @param {Object} props - Component props
 * @param {boolean} props.bestChannelEnabled - Whether best channels are enabled
 * @param {Array} props.bestChannels - Array of best channel configurations
 * @param {Object} props.bestChannelsVisibility - Visibility state for each channel
 * @param {Object} props.bestChannelZones - Zone data for each channel
 * @param {Array} props.chartDataWithZones - Chart data with zone information
 * @param {Object} props.xAxisMap - X-axis mapping from recharts
 * @param {Object} props.yAxisMap - Y-axis mapping from recharts
 */
export const CustomBestChannelZoneLines = ({
  bestChannelEnabled,
  bestChannels,
  bestChannelsVisibility,
  bestChannelZones,
  chartDataWithZones,
  xAxisMap,
  yAxisMap
}) => {
  if (!bestChannelEnabled || bestChannels.length === 0 || Object.keys(bestChannelZones).length === 0) return null

  const xAxis = xAxisMap?.[0]
  const yAxis = yAxisMap?.[0]

  if (!xAxis || !yAxis) return null

  // Color palette for best channels (warm colors - amber/orange/yellow tones)
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

        const channelColor = channelColors[channelIndex % channelColors.length]
        const zones = bestChannelZones[channelIndex]
        if (!zones) return null

        return zones.map((zone, zoneIndex) => {
          const points = chartDataWithZones.map((point) => {
            const upper = point[`bestChannel${channelIndex}Zone${zoneIndex}Upper`]
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

          // Color based on volume weight: cool to warm gradient
          // Low volume (0-20%): Blue/Cyan
          // Medium-Low (20-40%): Green/Yellow-Green
          // Medium (40-60%): Yellow
          // Medium-High (60-80%): Orange
          // High (80-100%): Red/Deep Orange
          let hue, saturation, lightness

          if (zone.volumeWeight < 0.2) {
            // Low volume - Blue/Cyan
            hue = 200 - (zone.volumeWeight / 0.2) * 20  // 200 to 180
            saturation = 70
            lightness = 55
          } else if (zone.volumeWeight < 0.4) {
            // Medium-low - Cyan to Green
            const t = (zone.volumeWeight - 0.2) / 0.2
            hue = 180 - t * 60  // 180 to 120 (green)
            saturation = 65
            lightness = 50
          } else if (zone.volumeWeight < 0.6) {
            // Medium - Green to Yellow
            const t = (zone.volumeWeight - 0.4) / 0.2
            hue = 120 - t * 60  // 120 to 60 (yellow)
            saturation = 75
            lightness = 50
          } else if (zone.volumeWeight < 0.8) {
            // Medium-high - Yellow to Orange
            const t = (zone.volumeWeight - 0.6) / 0.2
            hue = 60 - t * 25  // 60 to 35 (orange)
            saturation = 85
            lightness = 52
          } else {
            // High volume - Orange to Red
            const t = (zone.volumeWeight - 0.8) / 0.2
            hue = 35 - t * 25  // 35 to 10 (red)
            saturation = 90
            lightness = 50
          }

          const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`
          const opacity = 0.4 + (zone.volumeWeight * 0.5) // 0.4 to 0.9

          return (
            <g key={`best-channel-${channelIndex}-zone-${zoneIndex}`}>
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
                  fill={color}
                  fontSize="11"
                  fontWeight={zone.volumeWeight > 0.5 ? "800" : "700"}
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
