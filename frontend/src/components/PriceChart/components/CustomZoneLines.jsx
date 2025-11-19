import React from 'react'

/**
 * Get zone color based on index and volume weight
 */
const getZoneColor = (index, total, volumeWeight) => {
  const hue = (index / total) * 300 // 0 to 300 degrees (red to blue, avoiding green)

  // Saturation and lightness vary with volume weight
  const minSaturation = 30
  const maxSaturation = 90
  const saturation = minSaturation + (volumeWeight * (maxSaturation - minSaturation))

  const minLightness = 35
  const maxLightness = 65
  const lightness = maxLightness - (volumeWeight * (maxLightness - minLightness))

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

/**
 * Get volume weight color
 */
const getVolumeWeightColor = (weight) => {
  if (weight >= 0.25) return '#22c55e' // Green - high volume
  if (weight >= 0.20) return '#84cc16' // Lime - above average
  if (weight >= 0.15) return '#eab308' // Yellow - average
  if (weight >= 0.10) return '#f97316' // Orange - below average
  return '#ef4444' // Red - low volume
}

/**
 * Custom zone lines component for slope channel visualization
 * @param {Object} props - Recharts custom component props
 * @param {boolean} slopeChannelEnabled - Whether slope channel is enabled
 * @param {Array} zoneColors - Zone color configuration
 * @param {Array} chartDataWithZones - Chart data with zone information
 */
export const CustomZoneLines = (props) => {
  const { slopeChannelEnabled, zoneColors, chartDataWithZones } = props

  if (!slopeChannelEnabled || zoneColors.length === 0) {
    return null
  }

  const { xAxisMap, yAxisMap } = props
  const xAxis = xAxisMap?.[0]
  const yAxis = yAxisMap?.[0]

  if (!xAxis || !yAxis) {
    return null
  }

  return (
    <g>
      {zoneColors.map((zone, zoneIndex) => {
        const points = chartDataWithZones.map((point) => {
          const upper = point[`zone${zoneIndex}Upper`]
          if (upper === undefined) return null

          const x = xAxis.scale(point.date)
          const y = yAxis.scale(upper)
          return { x, y }
        }).filter(p => p !== null)

        if (points.length < 2) {
          return null
        }

        // Create path for the zone boundary line
        let pathData = `M ${points[0].x} ${points[0].y}`
        for (let i = 1; i < points.length; i++) {
          pathData += ` L ${points[i].x} ${points[i].y}`
        }

        const color = getZoneColor(zoneIndex, zoneColors.length, zone.volumeWeight)
        const lastPoint = points[points.length - 1]

        // Position label at the right side of the chart
        const labelX = lastPoint.x - 5
        const labelY = lastPoint.y

        // Opacity varies with volume weight
        const minOpacity = 0.4
        const maxOpacity = 0.95
        const opacity = minOpacity + (zone.volumeWeight * (maxOpacity - minOpacity))

        return (
          <g key={`zone-line-${zoneIndex}`}>
            {/* Zone boundary line */}
            <path
              d={pathData}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray="2 2"
              opacity={opacity}
            />

            {/* Volume percentage label with background */}
            <g>
              <rect
                x={labelX - 25}
                y={labelY - 8}
                width={50}
                height={16}
                fill="rgba(15, 23, 42, 0.85)"
                stroke={getVolumeWeightColor(zone.volumeWeight)}
                strokeWidth={0.5}
                rx={2}
              />
              <text
                x={labelX}
                y={labelY}
                fill={getVolumeWeightColor(zone.volumeWeight)}
                fontSize="11"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {(zone.volumeWeight * 100).toFixed(1)}%
              </text>
            </g>
          </g>
        )
      })}
    </g>
  )
}
