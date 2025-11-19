import React from 'react'

/**
 * Custom X-axis tick component with transition date highlighting
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {Object} payload - Tick payload with value
 * @param {Set} transitionDates - Set of dates that are month/year transitions
 * @param {boolean} isLongPeriod - Whether displaying a long time period (3Y+)
 */
export const CustomXAxisTick = ({ x, y, payload, transitionDates, isLongPeriod }) => {
  const currentDate = payload.value
  let color = '#94a3b8' // Default color

  if (transitionDates.has(currentDate)) {
    color = isLongPeriod ? '#3b82f6' : '#10b981' // Blue for year, green for month
  }

  return (
    <text
      x={x}
      y={y}
      dy={16}
      textAnchor="middle"
      fill={color}
      fontSize={12}
    >
      {currentDate}
    </text>
  )
}
