import React from 'react'

// Color palette for different regression lines
const REGRESSION_COLORS = [
  { stroke: '#a855f7', fill: 'rgba(168, 85, 247, 0.15)', name: 'Purple' },    // Purple
  { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.15)', name: 'Blue' },      // Blue
  { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.15)', name: 'Green' },     // Green
  { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.15)', name: 'Amber' },     // Amber
  { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.15)', name: 'Red' },        // Red
  { stroke: '#ec4899', fill: 'rgba(236, 72, 153, 0.15)', name: 'Pink' },      // Pink
  { stroke: '#06b6d4', fill: 'rgba(6, 182, 212, 0.15)', name: 'Cyan' },       // Cyan
  { stroke: '#8b5cf6', fill: 'rgba(139, 92, 246, 0.15)', name: 'Violet' },    // Violet
]

/**
 * Custom component to render linear regression line and selection rectangle
 */
const CustomLinearRegression = ({
  xScale,
  yScale,
  chartWidth,
  chartHeight,
  isSelecting,
  selectionStart,
  selectionEnd,
  regressionData,
  displayPrices,
  onRemoveRegression
}) => {
  if (!xScale || !yScale) return null

  // Render all regression lines and selection rectangle
  const elements = []

  // Render selection rectangle while dragging
  if (isSelecting && selectionStart && selectionEnd) {
    const x1 = selectionStart.chartX || 0
    const y1 = selectionStart.chartY || 0
    const x2 = selectionEnd.chartX || 0
    const y2 = selectionEnd.chartY || 0

    const rectX = Math.min(x1, x2)
    const rectY = Math.min(y1, y2)
    const rectWidth = Math.abs(x2 - x1)
    const rectHeight = Math.abs(y2 - y1)

    elements.push(
      <rect
        key="selection-rect"
        x={rectX}
        y={rectY}
        width={rectWidth}
        height={rectHeight}
        fill="rgba(168, 85, 247, 0.15)"
        stroke="rgba(168, 85, 247, 0.8)"
        strokeWidth={2}
        strokeDasharray="5,5"
        pointerEvents="none"
      />
    )
  }

  // Render all regression lines
  if (Array.isArray(regressionData) && regressionData.length > 0 && displayPrices && displayPrices.length > 0) {
    regressionData.forEach((data, idx) => {
      if (!data || !data.regression) return

      const { regression, startIndex, endIndex } = data
      const { slope, intercept, r2 } = regression

      // Get color for this regression line (cycle through palette)
      const color = REGRESSION_COLORS[idx % REGRESSION_COLORS.length]
      const strokeColor = color.stroke
      const fillColor = color.fill
      const strokeColorFaint = strokeColor.replace('rgb', 'rgba').replace(')', ', 0.3)')

      // Get the reversed display prices (oldest first) to match the index system
      const reversedDisplayPrices = [...displayPrices].reverse()

      // Calculate regression line endpoints
      const startPoint = reversedDisplayPrices[startIndex]
      const endPoint = reversedDisplayPrices[endIndex]

      if (!startPoint || !endPoint) return

      // Calculate Y values for the regression line at start and end X positions
      const startY = slope * startIndex + intercept
      const endY = slope * endIndex + intercept

      // Convert to chart coordinates
      const x1 = xScale(startPoint.date)
      const y1 = yScale(startY)
      const x2 = xScale(endPoint.date)
      const y2 = yScale(endY)

      // Only render if coordinates are valid
      if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return

      // Regression line
      elements.push(
        <line
          key={`regression-line-${idx}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={strokeColor}
          strokeWidth={2}
          pointerEvents="none"
        />
      )

      // Selection rectangle outline (faint)
      if (data.startY !== undefined && data.endY !== undefined) {
        elements.push(
          <rect
            key={`regression-rect-${idx}`}
            x={x1}
            y={yScale(Math.max(data.startY, data.endY))}
            width={x2 - x1}
            height={Math.abs(yScale(data.startY) - yScale(data.endY))}
            fill="none"
            stroke={strokeColorFaint}
            strokeWidth={1}
            strokeDasharray="3,3"
            pointerEvents="none"
          />
        )
      }

      // R² value label with delete button
      elements.push(
        <g key={`r2-label-${idx}`} transform={`translate(${x2 + 5}, ${y2})`}>
          <rect
            x={0}
            y={-10}
            width={70}
            height={20}
            fill="rgba(0, 0, 0, 0.7)"
            rx={3}
          />
          <text
            x={5}
            y={5}
            fill={strokeColor}
            fontSize={12}
            fontWeight="bold"
          >
            R² = {r2.toFixed(4)}
          </text>
        </g>
      )

      // Delete button (X icon)
      if (onRemoveRegression) {
        elements.push(
          <g
            key={`delete-btn-${idx}`}
            transform={`translate(${x2 + 82}, ${y2})`}
            onMouseDown={(e) => {
              e.stopPropagation()
              onRemoveRegression(idx)
            }}
            pointerEvents="all"
            cursor="pointer"
          >
            {/* Background circle */}
            <circle
              cx={0}
              cy={0}
              r={8}
              fill="rgba(239, 68, 68, 0.9)"
              stroke="rgba(255, 255, 255, 0.8)"
              strokeWidth={1}
              pointerEvents="all"
            />
            {/* X icon */}
            <line
              x1={-4}
              y1={-4}
              x2={4}
              y2={4}
              stroke="white"
              strokeWidth={2}
              strokeLinecap="round"
              pointerEvents="none"
            />
            <line
              x1={4}
              y1={-4}
              x2={-4}
              y2={4}
              stroke="white"
              strokeWidth={2}
              strokeLinecap="round"
              pointerEvents="none"
            />
          </g>
        )
      }

      // Slope label
      elements.push(
        <g key={`slope-label-${idx}`} transform={`translate(${x1}, ${y1 - 15})`}>
          <rect
            x={0}
            y={-10}
            width={slope >= 0 ? 90 : 95}
            height={20}
            fill="rgba(0, 0, 0, 0.7)"
            rx={3}
          />
          <text
            x={5}
            y={5}
            fill={strokeColor}
            fontSize={11}
          >
            m = {slope.toFixed(6)}
          </text>
        </g>
      )
    })
  }

  return elements.length > 0 ? <g>{elements}</g> : null
}

export default CustomLinearRegression
