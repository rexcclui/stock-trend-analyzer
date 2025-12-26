/**
 * Linear Regression Utilities
 * Calculates linear regression for selected data ranges
 */

/**
 * Calculate linear regression for a set of data points
 * @param {Array} dataPoints - Array of {x, y} points
 * @returns {Object} - {slope, intercept, r2} or null if insufficient data
 */
export const calculateLinearRegression = (dataPoints) => {
  if (!dataPoints || dataPoints.length < 2) {
    return null;
  }

  const n = dataPoints.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  // Calculate sums
  for (let i = 0; i < n; i++) {
    const x = dataPoints[i].x;
    const y = dataPoints[i].y;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  // Calculate slope (m) and intercept (b) for y = mx + b
  const denominator = n * sumX2 - sumX * sumX;

  if (denominator === 0) {
    return null; // Avoid division by zero
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared (coefficient of determination)
  const meanY = sumY / n;
  let ssTotal = 0;
  let ssResidual = 0;

  for (let i = 0; i < n; i++) {
    const y = dataPoints[i].y;
    const yPredicted = slope * dataPoints[i].x + intercept;
    ssTotal += Math.pow(y - meanY, 2);
    ssResidual += Math.pow(y - yPredicted, 2);
  }

  const r2 = ssTotal === 0 ? 0 : 1 - (ssResidual / ssTotal);

  return {
    slope,
    intercept,
    r2,
    equation: `y = ${slope.toFixed(4)}x + ${intercept.toFixed(2)}`,
    points: dataPoints
  };
};

/**
 * Get regression line endpoints for rendering
 * @param {Object} regression - Result from calculateLinearRegression
 * @param {number} minX - Minimum x value for the line
 * @param {number} maxX - Maximum x value for the line
 * @returns {Array} - [{x, y}, {x, y}] representing start and end points
 */
export const getRegressionLinePoints = (regression, minX, maxX) => {
  if (!regression) return [];

  const { slope, intercept } = regression;

  return [
    { x: minX, y: slope * minX + intercept },
    { x: maxX, y: slope * maxX + intercept }
  ];
};

/**
 * Filter data points within a rectangular selection
 * @param {Array} data - Full dataset with date, close, etc.
 * @param {Object} selection - {startX, endX, startY, endY, startIndex, endIndex}
 * @param {Object} chartDimensions - {xScale, yScale} functions from Recharts
 * @returns {Array} - Filtered data points as {x: index, y: close}
 */
export const filterDataPointsInSelection = (data, selection, chartDimensions) => {
  if (!data || !selection || !chartDimensions) {
    return [];
  }

  const { startIndex, endIndex, startY, endY } = selection;
  const { yScale } = chartDimensions;

  // Ensure indices are valid
  const minIndex = Math.max(0, Math.min(startIndex, endIndex));
  const maxIndex = Math.min(data.length - 1, Math.max(startIndex, endIndex));

  // Ensure Y values are in correct order (min, max)
  const minY = Math.min(startY, endY);
  const maxY = Math.max(startY, endY);

  const filteredPoints = [];

  for (let i = minIndex; i <= maxIndex; i++) {
    const point = data[i];
    if (!point || point.close == null) continue;

    const yValue = point.close;

    // Check if point is within Y bounds
    if (yValue >= minY && yValue <= maxY) {
      filteredPoints.push({
        x: i,
        y: yValue,
        date: point.date,
        close: point.close
      });
    }
  }

  return filteredPoints;
};
