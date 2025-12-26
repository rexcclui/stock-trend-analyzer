import React from 'react'

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
  displayPrices
}) => {
  if (!xScale || !yScale) return null

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

    return (
      <g>
        <rect
          x={rectX}
          y={rectY}
          width={rectWidth}
          height={rectHeight}
          fill="rgba(168, 85, 247, 0.1)"
          stroke="rgba(168, 85, 247, 0.6)"
          strokeWidth={2}
          strokeDasharray="5,5"
          pointerEvents="none"
        />
      </g>
    )
  }

  // Render regression line after selection is complete
  if (regressionData && regressionData.regression && displayPrices && displayPrices.length > 0) {
    const { regression, startIndex, endIndex } = regressionData
    const { slope, intercept, r2 } = regression

    // Get the reversed display prices (oldest first) to match the index system
    const reversedDisplayPrices = [...displayPrices].reverse()

    // Calculate regression line endpoints
    const startPoint = reversedDisplayPrices[startIndex]
    const endPoint = reversedDisplayPrices[endIndex]

    if (!startPoint || !endPoint) return null

    // Calculate Y values for the regression line at start and end X positions
    const startY = slope * startIndex + intercept
    const endY = slope * endIndex + intercept

    // Convert to chart coordinates
    const x1 = xScale(startPoint.date)
    const y1 = yScale(startY)
    const x2 = xScale(endPoint.date)
    const y2 = yScale(endY)

    // Only render if coordinates are valid
    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return null

    return (
      <g>
        {/* Regression line */}
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#a855f7"
          strokeWidth={2}
          pointerEvents="none"
        />

        {/* Selection rectangle outline (faint) */}
        {regressionData.startY !== undefined && regressionData.endY !== undefined && (
          <rect
            x={x1}
            y={yScale(Math.max(regressionData.startY, regressionData.endY))}
            width={x2 - x1}
            height={Math.abs(yScale(regressionData.startY) - yScale(regressionData.endY))}
            fill="none"
            stroke="rgba(168, 85, 247, 0.3)"
            strokeWidth={1}
            strokeDasharray="3,3"
            pointerEvents="none"
          />
        )}

        {/* R² value label */}
        <g transform={`translate(${x2 + 5}, ${y2})`}>
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
            fill="#a855f7"
            fontSize={12}
            fontWeight="bold"
          >
            R² = {r2.toFixed(4)}
          </text>
        </g>

        {/* Slope label */}
        <g transform={`translate(${x1}, ${y1 - 15})`}>
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
            fill="#a855f7"
            fontSize={11}
          >
            m = {slope.toFixed(6)}
          </text>
        </g>
      </g>
    )
  }

  return null
}

export default CustomLinearRegression
