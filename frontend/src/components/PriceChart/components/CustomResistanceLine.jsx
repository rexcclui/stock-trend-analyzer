import React from 'react'

/**
 * Custom component to render colored resistance zone based on volume percentage
 * Color scheme: Red (low volume) > Green (medium) > Blue (high volume)
 */
export const CustomResistanceLine = ({ chartDataWithZones, resLnEnabled, xAxisMap, yAxisMap }) => {
  if (!resLnEnabled) return null

  const xAxis = xAxisMap?.[0]
  const yAxis = yAxisMap?.[0]

  if (!xAxis || !yAxis) return null

  // Helper function to get color based on volume percentage
  const getVolumeColor = (volumePercent) => {
    if (volumePercent >= 50) return '#3b82f6'  // Blue - very high (50%+)
    if (volumePercent >= 40) return '#60a5fa'  // Light blue - high (40-50%)
    if (volumePercent >= 30) return '#22c55e'  // Green - medium-high (30-40%)
    if (volumePercent >= 25) return '#84cc16'  // Lime - medium (25-30%)
    if (volumePercent >= 20) return '#a3e635'  // Light lime (20-25%)
    if (volumePercent >= 16) return '#eab308'  // Yellow (16-20%)
    if (volumePercent >= 12) return '#f97316'  // Orange (12-16%)
    if (volumePercent >= 8) return '#fb923c'   // Light orange (8-12%)
    if (volumePercent >= 5) return '#fbbf24'   // Amber (5-8%)
    return '#ef4444' // Red - minimal (<5%)
  }

  // Build zone segments with different colors
  const segments = []
  let currentSegment = null

  chartDataWithZones.forEach((point, index) => {
    if (!point.highVolZone || point.volumePercent === undefined || point.highVolZoneLower === undefined || point.highVolZoneUpper === undefined) return

    const x = xAxis.scale(point.date)
    const yLower = yAxis.scale(point.highVolZoneLower)
    const yUpper = yAxis.scale(point.highVolZoneUpper)
    const color = getVolumeColor(point.volumePercent)

    if (!currentSegment || currentSegment.color !== color) {
      // Start a new segment
      if (currentSegment) {
        // Add current point to finish previous segment for continuity
        currentSegment.points.push({ x, yLower, yUpper })
        segments.push(currentSegment)
      }
      currentSegment = {
        color,
        points: [{ x, yLower, yUpper }]
      }
    } else {
      // Continue current segment
      currentSegment.points.push({ x, yLower, yUpper })
    }
  })

  // Push the last segment
  if (currentSegment) {
    segments.push(currentSegment)
  }

  return (
    <g>
      {segments.map((segment, segmentIndex) => {
        if (segment.points.length < 2) return null

        // Create path for this segment (filled area)
        // Move to first point upper
        let pathData = `M ${segment.points[0].x} ${segment.points[0].yUpper}`

        // Draw line along upper edge
        for (let i = 1; i < segment.points.length; i++) {
          pathData += ` L ${segment.points[i].x} ${segment.points[i].yUpper}`
        }

        // Draw line down to last point lower
        pathData += ` L ${segment.points[segment.points.length - 1].x} ${segment.points[segment.points.length - 1].yLower}`

        // Draw line along lower edge (backwards)
        for (let i = segment.points.length - 2; i >= 0; i--) {
          pathData += ` L ${segment.points[i].x} ${segment.points[i].yLower}`
        }

        // Close path
        pathData += ' Z'

        return (
          <path
            key={`res-ln-segment-${segmentIndex}`}
            d={pathData}
            fill={segment.color}
            fillOpacity={0.35}
            stroke="none"
          />
        )
      })}
    </g>
  )
}
