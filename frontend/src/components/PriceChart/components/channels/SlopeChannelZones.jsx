import React from 'react'

/**
 * Renders zone lines with labels for the slope channel.
 * Each zone displays volume percentage with color-coded intensity.
 *
 * @param {Object} props - Component props
 * @param {boolean} props.slopeChannelEnabled - Whether slope channel is enabled
 * @param {Array} props.zoneColors - Array of zone data with volume weights
 * @param {Array} props.chartDataWithZones - Chart data with zone boundaries
 * @param {Object} props.xAxisMap - X-axis mapping from recharts
 * @param {Object} props.yAxisMap - Y-axis mapping from recharts
 * @param {Object} props.slopeChannelInfo - Slope channel information
 * @returns {JSX.Element|null} Zone lines SVG element or null if disabled
 */
const SlopeChannelZones = (props) => {
  const { slopeChannelEnabled, zoneColors, chartDataWithZones, slopeChannelInfo } = props

  if (!slopeChannelEnabled || !zoneColors || zoneColors.length === 0) {
    return null
  }

  const { xAxisMap, yAxisMap } = props
  const xAxis = xAxisMap?.[0]
  const yAxis = yAxisMap?.[0]

  if (!xAxis || !yAxis) {
    return null
  }

  // Generate distinct colors for each zone with depth based on volume weight
  const getZoneColor = (index, total, volumeWeight) => {
    const hue = (index / total) * 300 // 0 to 300 degrees (red to blue, avoiding green)

    // Saturation and lightness vary with volume weight
    // Higher volume = higher saturation (deeper color)
    // Lower volume = lower saturation (lighter color)
    const minSaturation = 30
    const maxSaturation = 90
    const saturation = minSaturation + (volumeWeight * (maxSaturation - minSaturation))

    // Lightness: higher volume = darker, lower volume = lighter
    const minLightness = 35
    const maxLightness = 65
    const lightness = maxLightness - (volumeWeight * (maxLightness - minLightness))

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`
  }

  // Get conditional color for volume weight text
  const getVolumeWeightColor = (weight) => {
    if (weight >= 0.25) return '#22c55e' // Green - high volume
    if (weight >= 0.20) return '#84cc16' // Lime - above average
    if (weight >= 0.15) return '#eab308' // Yellow - average
    if (weight >= 0.10) return '#f97316' // Orange - below average
    return '#ef4444' // Red - low volume
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

        // Position label at the right side of the chart (last point)
        const labelX = lastPoint.x - 5
        const labelY = lastPoint.y

        // Opacity varies with volume weight: higher volume = more opaque
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

            {/* Volume percentage label with background for visibility */}
            <g>
              {/* Background rectangle for better readability */}
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
              {/* Volume percentage text */}
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

export default SlopeChannelZones
