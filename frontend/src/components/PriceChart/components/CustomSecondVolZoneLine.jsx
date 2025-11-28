import React from 'react'
import { getVolumeColor } from '../utils/volumeColors'

/**
 * Custom component to render second volume zone line with colored segments
 * @param {Object} props - Component props
 * @param {Array} props.chartDataWithZones - Chart data with zone information
 * @param {boolean} props.resLnEnabled - Whether resistance lines are enabled
 * @param {Object} props.xAxisMap - X-axis mapping from recharts
 * @param {Object} props.yAxisMap - Y-axis mapping from recharts
 */
export const CustomSecondVolZoneLine = ({ chartDataWithZones, resLnEnabled, xAxisMap, yAxisMap }) => {
  if (!resLnEnabled) return null

  const xAxis = xAxisMap?.[0]
  const yAxis = yAxisMap?.[0]

  if (!xAxis || !yAxis) return null

  // Build zone segments with different colors
  const segments = []
  let currentSegment = null

  chartDataWithZones.forEach((point, index) => {
    if (!point.secondVolZone || point.secondVolPercent === undefined || point.secondVolZoneLower === undefined || point.secondVolZoneUpper === undefined) return

    const x = xAxis.scale(point.date)
    const yLower = yAxis.scale(point.secondVolZoneLower)
    const yUpper = yAxis.scale(point.secondVolZoneUpper)
    const color = getVolumeColor(point.secondVolPercent)

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
        let pathData = `M ${segment.points[0].x} ${segment.points[0].yUpper}`

        for (let i = 1; i < segment.points.length; i++) {
          pathData += ` L ${segment.points[i].x} ${segment.points[i].yUpper}`
        }

        pathData += ` L ${segment.points[segment.points.length - 1].x} ${segment.points[segment.points.length - 1].yLower}`

        for (let i = segment.points.length - 2; i >= 0; i--) {
          pathData += ` L ${segment.points[i].x} ${segment.points[i].yLower}`
        }

        pathData += ' Z'

        return (
          <path
            key={`second-vol-zone-segment-${segmentIndex}`}
            d={pathData}
            fill={segment.color}
            fillOpacity={0.3}
            stroke="none"
          />
        )
      })}
    </g>
  )
}
