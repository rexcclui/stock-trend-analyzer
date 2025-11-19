import React from 'react'

/**
 * Custom X-axis tick component for the price chart.
 * Colors ticks differently at month/year transitions.
 *
 * @param {Object} props - Component props
 * @param {number} props.x - X coordinate for the tick
 * @param {number} props.y - Y coordinate for the tick
 * @param {Object} props.payload - Tick data payload
 * @param {Set} props.transitionDates - Set of dates that represent month/year transitions
 * @param {boolean} props.isLongPeriod - Whether this is a long period (3+ years)
 * @returns {JSX.Element} Tick element
 */
const ChartAxisTick = ({ x, y, payload, transitionDates, isLongPeriod }) => {
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

export default ChartAxisTick
