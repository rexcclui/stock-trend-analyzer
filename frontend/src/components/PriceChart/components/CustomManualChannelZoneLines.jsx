import React from 'react'

/**
 * Custom component to render zone lines for all manual channels
 * Shows volume-weighted zones with colored dashed lines and percentage labels
 *
 * @param {Object} props - Component props
 * @param {boolean} props.manualChannelEnabled - Whether manual channels are enabled
 * @param {Array} props.manualChannels - Array of manual channel configurations
 * @param {Array} props.allManualChannelZones - Zone data for all manual channels
 * @param {Array} props.chartDataWithZones - Chart data with zone information
 * @param {Object} props.xAxisMap - X-axis mapping from recharts
 * @param {Object} props.yAxisMap - Y-axis mapping from recharts
 */
export const CustomManualChannelZoneLines = ({
  manualChannelEnabled,
  manualChannels,
  allManualChannelZones,
  chartDataWithZones,
  xAxisMap,
  yAxisMap
}) => {
  if (!manualChannelEnabled || manualChannels.length === 0 || allManualChannelZones.length === 0) return null

  const xAxis = xAxisMap?.[0]
  const yAxis = yAxisMap?.[0]

  if (!xAxis || !yAxis) return null

  // Color palette for manual channels (various green shades)
  const channelColors = [
    142, // Green
    160, // Teal-green
    175, // Sea green
    125, // Lime green
    150, // Jade
  ]

  return (
    <g>
      {manualChannels.map((channel, channelIndex) => {
        const zones = allManualChannelZones[channelIndex]
        if (!zones) return null

        const hue = channelColors[channelIndex % channelColors.length]

        return zones.map((zone, zoneIndex) => {
          const points = chartDataWithZones.map((point) => {
            const upper = point[`manualChannel${channelIndex}Zone${zoneIndex}Upper`]
            if (upper === undefined) return null

            const x = xAxis.scale(point.date)
            const y = yAxis.scale(upper)

            if (x === undefined || y === undefined) return null

            return { x, y }
          }).filter(p => p !== null)

          if (points.length < 2) return null

          // Create path for the zone boundary line
          let pathData = `M ${points[0].x} ${points[0].y}`
          for (let i = 1; i < points.length; i++) {
            pathData += ` L ${points[i].x} ${points[i].y}`
          }

          const lastPoint = points[points.length - 1]

          // Opacity and color intensity varies with volume weight: higher volume = more intense
          const minOpacity = 0.3
          const maxOpacity = 0.9
          const opacity = minOpacity + (zone.volumeWeight * (maxOpacity - minOpacity))

          // Create color with varying intensity based on volume weight
          // Higher volume = deeper/darker color
          const minLightness = 35 // Darker
          const maxLightness = 65 // Lighter
          const lightness = maxLightness - (zone.volumeWeight * (maxLightness - minLightness))
          const color = `hsl(${hue}, 70%, ${lightness}%)`

          return (
            <g key={`manual-channel-${channelIndex}-zone-${zoneIndex}`}>
              {/* Zone boundary line */}
              <path
                d={pathData}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray="2 2"
                opacity={opacity}
              />

              {/* Volume percentage label at the end of the line with gradient color based on weight */}
              <g>
                {/* Background rectangle for better readability */}
                <rect
                  x={lastPoint.x - 30}
                  y={lastPoint.y - 8}
                  width={25}
                  height={16}
                  fill="rgba(15, 23, 42, 0.85)"
                  stroke={(() => {
                    const weight = zone.volumeWeight
                    if (weight >= 0.25) return '#22c55e'
                    if (weight >= 0.20) return '#84cc16'
                    if (weight >= 0.15) return '#eab308'
                    if (weight >= 0.10) return '#f97316'
                    return '#ef4444'
                  })()}
                  strokeWidth={0.5}
                  rx={2}
                />
                <text
                  x={lastPoint.x - 5}
                  y={lastPoint.y}
                  fill={(() => {
                    // Conditional formatting: higher weight = warmer/brighter colors
                    const weight = zone.volumeWeight
                    if (weight >= 0.25) return '#22c55e' // Green - high volume
                    if (weight >= 0.20) return '#84cc16' // Lime - above average
                    if (weight >= 0.15) return '#eab308' // Yellow - average
                    if (weight >= 0.10) return '#f97316' // Orange - below average
                    return '#ef4444' // Red - low volume
                  })()}
                  fontSize="11"
                  fontWeight="700"
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
