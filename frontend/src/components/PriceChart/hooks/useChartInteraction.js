import { useState, useEffect } from 'react'

/**
 * Custom hook to manage chart mouse interactions including:
 * - Mouse wheel zoom and pan
 * - Mouse move tracking and synchronized date updates
 * - Manual channel selection and drawing
 * - Volume profile manual selection
 * - Chart panning with mouse drag
 *
 * @param {Object} params - Hook parameters
 * @param {Array} params.chartData - Full chart data array
 * @param {Array} params.displayPrices - Display prices data array
 * @param {Object} params.zoomRange - Current zoom range { start, end }
 * @param {Function} params.onZoomChange - Callback when zoom changes
 * @param {Function} params.onExtendPeriod - Callback to extend period when fully zoomed out
 * @param {Object} params.chartContainerRef - Ref to the chart container element
 * @param {boolean} params.manualChannelEnabled - Whether manual channel mode is enabled
 * @param {boolean} params.manualChannelDragMode - Whether manual channel drag mode is active
 * @param {boolean} params.volumeProfileEnabled - Whether volume profile is enabled
 * @param {string} params.volumeProfileMode - Volume profile mode ('auto' or 'manual')
 * @param {Function} params.onVolumeProfileManualRangeChange - Callback for volume profile range changes
 * @param {Function} params.setSyncedMouseDate - Callback to set synced mouse date
 *
 * @returns {Object} Object containing:
 *   - Event handlers: handleWheel, handleMouseMove, handleMouseLeave, handleMouseDown, handleMouseUp
 *   - Channel functions: fitManualChannel, extendManualChannel, findTurningPoints
 *   - State values: isSelecting, selectionStart, selectionEnd, isSelectingVolumeProfile,
 *                   volumeProfileSelectionStart, volumeProfileSelectionEnd, isPanning,
 *                   manualChannels, setManualChannels
 */
export const useChartInteraction = ({
  chartData,
  displayPrices,
  zoomRange,
  onZoomChange,
  onExtendPeriod,
  chartContainerRef,
  manualChannelEnabled,
  manualChannelDragMode,
  volumeProfileEnabled,
  volumeProfileMode,
  onVolumeProfileManualRangeChange,
  setSyncedMouseDate
}) => {
  // Manual channel selection state
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState(null)
  const [selectionEnd, setSelectionEnd] = useState(null)
  const [manualChannels, setManualChannels] = useState([]) // Array to store multiple channels

  // Volume profile manual selection state
  const [isSelectingVolumeProfile, setIsSelectingVolumeProfile] = useState(false)
  const [volumeProfileSelectionStart, setVolumeProfileSelectionStart] = useState(null)
  const [volumeProfileSelectionEnd, setVolumeProfileSelectionEnd] = useState(null)

  // Chart panning state
  const [isPanning, setIsPanning] = useState(false)
  const [panStartX, setPanStartX] = useState(null)
  const [panStartZoom, setPanStartZoom] = useState(null)

  /**
   * Handle mouse wheel for zoom and pan
   * Scroll up zooms in (shows less data), scroll down zooms out (shows more data)
   * When fully zoomed out, extends the data period if available
   */
  const handleWheel = (e) => {
    e.preventDefault()
    if (!onZoomChange) return

    const endIndex = zoomRange.end === null ? chartData.length : zoomRange.end
    const delta = e.deltaY
    const zoomFactor = 0.1 // 10% zoom per scroll
    const currentRange = endIndex - zoomRange.start
    const zoomAmount = Math.max(1, Math.floor(currentRange * zoomFactor))

    if (delta < 0) {
      // Scroll up - Zoom in (show less data)
      const newRange = Math.max(10, currentRange - zoomAmount)
      const reduction = currentRange - newRange
      const newStart = Math.min(chartData.length - newRange, zoomRange.start + Math.floor(reduction / 2))
      const newEnd = Math.min(chartData.length, newStart + newRange)
      onZoomChange({ start: newStart, end: newEnd })
    } else {
      // Scroll down - Zoom out (show more data)
      // Check if already at full zoom with a small tolerance
      const isAtStart = zoomRange.start === 0
      const isAtEnd = zoomRange.end === null || Math.abs(zoomRange.end - chartData.length) <= 1
      const isFullyZoomedOut = isAtStart && isAtEnd && currentRange >= chartData.length - 2

      if (isFullyZoomedOut && onExtendPeriod) {
        // Only extend if we're truly showing all available data
        onExtendPeriod()
      } else {
        const newRange = Math.min(chartData.length, currentRange + zoomAmount)
        const expansion = newRange - currentRange
        const newStart = Math.max(0, zoomRange.start - Math.floor(expansion / 2))
        const newEnd = Math.min(chartData.length, newStart + newRange)

        // If we've reached full view, set end to null
        if (newStart === 0 && newEnd === chartData.length) {
          onZoomChange({ start: 0, end: null })
        } else {
          onZoomChange({ start: newStart, end: newEnd })
        }
      }
    }
  }

  /**
   * Handle mouse move for tracking, panning, and selection
   * Manages three modes:
   * 1. Chart panning when isPanning is true
   * 2. Volume profile manual selection
   * 3. Manual channel selection
   */
  const handleMouseMove = (e) => {
    // Update synced mouse date when available
    if (e && e.activeLabel) {
      setSyncedMouseDate(e.activeLabel)
    }

    // Handle volume profile manual selection - update on every move when selecting
    if (volumeProfileEnabled && volumeProfileMode === 'manual' && isSelectingVolumeProfile) {
      if (e && e.activeLabel) {
        console.log('Updating volume profile selection end:', e.activeLabel)
        setVolumeProfileSelectionEnd(e.activeLabel)
      } else {
        console.log('MouseMove during volume profile selection but no activeLabel')
      }
      return
    }

    // Handle manual channel selection - update on every move when selecting
    if (manualChannelEnabled && manualChannelDragMode && isSelecting) {
      if (e && e.activeLabel) {
        console.log('Updating manual channel selection end:', e.activeLabel)
        setSelectionEnd(e.activeLabel)
      }
      return
    }

    // Handle chart panning - only when NOT in any selection mode
    if (isPanning && !isSelecting && !isSelectingVolumeProfile && e && e.chartX !== undefined && panStartX !== null && panStartZoom !== null) {
      const deltaX = e.chartX - panStartX
      const chartWidth = chartContainerRef.current?.offsetWidth || 800
      const totalDataLength = chartData.length

      // Calculate pan delta as a percentage of visible range
      const panPercent = -(deltaX / chartWidth) // Negative because we pan opposite to drag direction
      const currentRange = (panStartZoom.end || totalDataLength) - panStartZoom.start
      const panAmount = Math.floor(panPercent * currentRange)

      // Apply pan with bounds checking
      let newStart = panStartZoom.start + panAmount
      let newEnd = (panStartZoom.end || totalDataLength) + panAmount

      // Ensure we don't pan beyond data bounds
      if (newStart < 0) {
        newEnd -= newStart
        newStart = 0
      }
      if (newEnd > totalDataLength) {
        newStart -= (newEnd - totalDataLength)
        newEnd = totalDataLength
      }
      if (newStart < 0) newStart = 0

      onZoomChange({ start: newStart, end: newEnd === totalDataLength ? null : newEnd })
      return
    }
  }

  /**
   * Handle mouse leave to clear interaction state
   * Ends panning when mouse leaves the chart area
   */
  const handleMouseLeave = () => {
    setSyncedMouseDate(null)
    // End panning when mouse leaves chart
    if (isPanning) {
      setIsPanning(false)
      setPanStartX(null)
      setPanStartZoom(null)
    }
    // Cancel any ongoing selections when mouse leaves
    if (isSelecting) {
      setIsSelecting(false)
      setSelectionStart(null)
      setSelectionEnd(null)
    }
    if (isSelectingVolumeProfile) {
      setIsSelectingVolumeProfile(false)
      setVolumeProfileSelectionStart(null)
      setVolumeProfileSelectionEnd(null)
    }
  }

  /**
   * Handle mouse down to initiate selection or panning
   * Priority order:
   * 1. Volume profile manual selection (highest priority)
   * 2. Manual channel selection
   * 3. Chart panning (lowest priority)
   */
  const handleMouseDown = (e) => {
    console.log('MouseDown:', {
      hasActiveLabel: !!e?.activeLabel,
      activeLabel: e?.activeLabel,
      volumeProfileEnabled,
      volumeProfileMode,
      manualChannelEnabled,
      manualChannelDragMode
    })

    // Volume profile manual selection - highest priority
    if (volumeProfileEnabled && volumeProfileMode === 'manual' && e && e.activeLabel) {
      console.log('Starting volume profile selection:', e.activeLabel)
      setIsSelectingVolumeProfile(true)
      setVolumeProfileSelectionStart(e.activeLabel)
      setVolumeProfileSelectionEnd(e.activeLabel)
      return
    }

    // Manual channel selection - second priority
    if (manualChannelEnabled && manualChannelDragMode && e && e.activeLabel) {
      console.log('Starting manual channel selection:', e.activeLabel)
      setIsSelecting(true)
      setSelectionStart(e.activeLabel)
      setSelectionEnd(e.activeLabel)
      return
    }

    // Panning - only when neither manual mode is active
    if (e && e.chartX !== undefined) {
      console.log('Starting panning')
      setIsPanning(true)
      setPanStartX(e.chartX)
      setPanStartZoom({ ...zoomRange })
      return
    }
  }

  /**
   * Handle mouse up to finalize selection or end panning
   * Processes manual channel selection or volume profile selection
   */
  const handleMouseUp = (e) => {
    // End panning
    if (isPanning) {
      setIsPanning(false)
      setPanStartX(null)
      setPanStartZoom(null)
      return
    }

    // Only process selection when drag mode is enabled
    if (manualChannelEnabled && manualChannelDragMode && isSelecting && selectionStart && selectionEnd) {
      // Calculate manual channel for selected range
      fitManualChannel(selectionStart, selectionEnd)
      setIsSelecting(false)
      setSelectionStart(null)
      setSelectionEnd(null)
    }
    if (volumeProfileEnabled && volumeProfileMode === 'manual' && isSelectingVolumeProfile && volumeProfileSelectionStart && volumeProfileSelectionEnd) {
      // Set the manual range for volume profile
      const startDate = volumeProfileSelectionStart
      const endDate = volumeProfileSelectionEnd
      // Ensure correct order
      const dates = [startDate, endDate].sort()
      onVolumeProfileManualRangeChange({ startDate: dates[0], endDate: dates[1] })
      setIsSelectingVolumeProfile(false)
      setVolumeProfileSelectionStart(null)
      setVolumeProfileSelectionEnd(null)
    }
  }

  /**
   * Helper function to detect turning points (local maxima and minima)
   * @param {Array} data - Price data array
   * @param {number} startIdx - Start index for search
   * @param {number} endIdx - End index for search
   * @returns {Array} Array of turning points with {index, type, value}
   */
  const findTurningPoints = (data, startIdx, endIdx) => {
    const turningPoints = []
    const windowSize = 3 // Look at 3 points to determine local max/min

    for (let i = startIdx + windowSize; i <= endIdx - windowSize; i++) {
      const current = data[i].close
      let isLocalMax = true
      let isLocalMin = true

      // Check if it's a local maximum or minimum
      for (let j = -windowSize; j <= windowSize; j++) {
        if (j === 0) continue
        const compareIdx = i + j
        if (compareIdx < startIdx || compareIdx > endIdx) continue

        const compareValue = data[compareIdx].close
        if (compareValue >= current) isLocalMax = false
        if (compareValue <= current) isLocalMin = false
      }

      if (isLocalMax) {
        turningPoints.push({ index: i, type: 'max', value: current })
      } else if (isLocalMin) {
        turningPoints.push({ index: i, type: 'min', value: current })
      }
    }

    return turningPoints
  }

  /**
   * Fit a channel to the manually selected data range using linear regression
   * Calculates slope, intercept, standard deviation, and optimal channel width
   * Ensures channel touches turning points within the selected range
   *
   * @param {string} startDate - Start date of selection
   * @param {string} endDate - End date of selection
   */
  const fitManualChannel = (startDate, endDate) => {
    if (!startDate || !endDate) return

    // Find the indices of the selected date range
    const startIndex = displayPrices.findIndex(p => p.date === startDate)
    const endIndex = displayPrices.findIndex(p => p.date === endDate)

    if (startIndex === -1 || endIndex === -1) return

    // Ensure we have the correct order (start should be earlier)
    const minIndex = Math.min(startIndex, endIndex)
    const maxIndex = Math.max(startIndex, endIndex)

    // Get the data segment for the selected range
    const dataSegment = displayPrices.slice(minIndex, maxIndex + 1)

    if (dataSegment.length < 5) {
      return
    }

    // Calculate linear regression for the selected segment
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
    const n = dataSegment.length

    dataSegment.forEach((point, index) => {
      sumX += index
      sumY += point.close
      sumXY += index * point.close
      sumX2 += index * index
    })

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n

    // Calculate standard deviation
    const distancesArray = dataSegment.map((point, index) => {
      const predictedY = slope * index + intercept
      return point.close - predictedY
    })

    const meanDistance = distancesArray.reduce((a, b) => a + b, 0) / distancesArray.length
    const variance = distancesArray.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distancesArray.length
    const stdDev = Math.sqrt(variance)

    // Find turning points in the selected range
    const turningPoints = findTurningPoints(displayPrices, minIndex, maxIndex)

    // Find optimal stddev multiplier - extend to cover more data but ensure at least one bound touches a turning point
    const stdevMultipliers = []
    for (let mult = 1.0; mult <= 4.0; mult += 0.1) {
      stdevMultipliers.push(mult)
    }

    let bestTouchCount = 0
    let bestStdevMult = 2.5
    let bestTurningPointTouch = false

    for (const stdevMult of stdevMultipliers) {
      const channelWidth = stdDev * stdevMult
      let touchCount = 0
      const touchTolerance = 0.05
      let hasUpperTouch = false
      let hasLowerTouch = false
      let hasTurningPointTouch = false

      dataSegment.forEach((point, index) => {
        const globalIndex = minIndex + index
        const predictedY = slope * index + intercept
        const upperBound = predictedY + channelWidth
        const lowerBound = predictedY - channelWidth

        const distanceToUpper = Math.abs(point.close - upperBound)
        const distanceToLower = Math.abs(point.close - lowerBound)
        const boundRange = channelWidth * 2

        // Check if this is a turning point
        const isTurningPoint = turningPoints.some(tp => tp.index === globalIndex)

        if (distanceToUpper <= boundRange * touchTolerance) {
          touchCount++
          hasUpperTouch = true
          if (isTurningPoint) hasTurningPointTouch = true
        }
        if (distanceToLower <= boundRange * touchTolerance) {
          touchCount++
          hasLowerTouch = true
          if (isTurningPoint) hasTurningPointTouch = true
        }
      })

      // Prioritize: (1) has turning point touch, (2) has upper OR lower touch, (3) more total touches
      const currentScore = (hasTurningPointTouch ? 10000 : 0) + touchCount
      const bestScore = (bestTurningPointTouch ? 10000 : 0) + bestTouchCount

      if ((hasUpperTouch || hasLowerTouch) && currentScore > bestScore) {
        bestTouchCount = touchCount
        bestStdevMult = stdevMult
        bestTurningPointTouch = hasTurningPointTouch
      }
    }

    // If no turning point touch found, extend the stdev to ensure at least one bound touches a turning point
    if (!bestTurningPointTouch && turningPoints.length > 0) {
      // Find the minimum stdev multiplier needed to touch at least one turning point
      let minMultForTurningPoint = bestStdevMult
      for (const tp of turningPoints) {
        const localIndex = tp.index - minIndex
        const predictedY = slope * localIndex + intercept
        const residual = Math.abs(tp.value - predictedY)
        const requiredMult = residual / stdDev
        // Use the smallest multiplier that touches any turning point
        if (requiredMult >= bestStdevMult) {
          minMultForTurningPoint = Math.max(minMultForTurningPoint, requiredMult)
        }
      }
      // Don't go beyond 4.0
      bestStdevMult = Math.min(minMultForTurningPoint, 4.0)
    }

    const channelWidth = stdDev * bestStdevMult

    // Calculate R-squared
    const meanY = sumY / n
    let totalSS = 0
    let residualSS = 0

    dataSegment.forEach((point, index) => {
      const predictedY = slope * index + intercept
      totalSS += Math.pow(point.close - meanY, 2)
      residualSS += Math.pow(point.close - predictedY, 2)
    })

    const rSquared = totalSS > 0 ? 1 - (residualSS / totalSS) : 0

    // Add the new manual channel to the array
    const newChannel = {
      startIndex: minIndex,
      endIndex: maxIndex,
      slope,
      intercept,
      channelWidth,
      stdDev,
      optimalStdevMult: bestStdevMult,
      touchCount: bestTouchCount,
      rSquared
    }
    setManualChannels(prevChannels => [...prevChannels, newChannel])
  }

  /**
   * Extend the most recent manual channel point-by-point while maintaining original slope
   * Extends forward and backward from the channel edges while checking if points stay within bounds
   * Stops extending when more than 10% of points in the new window fall outside the channel
   */
  const extendManualChannel = () => {
    if (manualChannels.length === 0) return

    const lastChannelIndex = manualChannels.length - 1
    const manualChannel = manualChannels[lastChannelIndex]

    // Keep original slope and stddev - these define the trend
    const { slope, stdDev, optimalStdevMult, channelWidth } = manualChannel
    let { startIndex, endIndex, intercept } = manualChannel

    const trendBreakThreshold = 0.1 // If >10% of new points are outside, break

    // Step 1: Extend forward (from endIndex to end of data) point by point
    let forwardExtended = false
    const maxEndIndex = displayPrices.length - 1

    while (endIndex < maxEndIndex) {
      // Try extending by one more point
      const testEndIndex = endIndex + 1

      // Calculate the total extended range
      const totalExtendedLength = testEndIndex - startIndex + 1

      // Get the LAST 10% of the extended range
      const windowSize = Math.max(1, Math.floor(totalExtendedLength * 0.1))
      const windowStartIdx = testEndIndex - windowSize + 1
      const last10PercentPoints = displayPrices.slice(windowStartIdx, testEndIndex + 1)

      // Check how many of the LAST 10% points fall outside the channel
      let outsideCount = 0
      for (let i = 0; i < last10PercentPoints.length; i++) {
        const globalIndex = windowStartIdx + i
        const localIndex = globalIndex - startIndex
        const predictedY = slope * localIndex + intercept
        const upperBound = predictedY + channelWidth
        const lowerBound = predictedY - channelWidth
        const actualY = last10PercentPoints[i].close

        if (actualY > upperBound || actualY < lowerBound) {
          outsideCount++
        }
      }

      const outsidePercent = outsideCount / last10PercentPoints.length

      if (outsidePercent > trendBreakThreshold) {
        // >10% of the last 10% points are outside, stop extending forward
        break
      }

      // Continue extending - the extended range becomes the new "original range"
      endIndex = testEndIndex
      forwardExtended = true
    }

    // Step 2: Extend backward (from startIndex to beginning) point by point
    let backwardExtended = false
    const minStartIndex = 0

    // Save original intercept before adjusting
    const originalStartIndex = manualChannel.startIndex
    const originalIntercept = manualChannel.intercept

    while (startIndex > minStartIndex) {
      // Try extending by one more point backward
      const testStartIndex = startIndex - 1

      // Adjust intercept for the new start position
      const newIntercept = originalIntercept - slope * (originalStartIndex - testStartIndex)

      // Calculate the total extended range
      const totalExtendedLength = endIndex - testStartIndex + 1

      // Get the FIRST 10% of the extended range
      const windowSize = Math.max(1, Math.floor(totalExtendedLength * 0.1))
      const windowEndIdx = testStartIndex + windowSize - 1
      const first10PercentPoints = displayPrices.slice(testStartIndex, windowEndIdx + 1)

      // Check how many of the FIRST 10% points fall outside the channel
      let outsideCount = 0
      for (let i = 0; i < first10PercentPoints.length; i++) {
        const globalIndex = testStartIndex + i
        const localIndex = globalIndex - testStartIndex
        const predictedY = slope * localIndex + newIntercept
        const upperBound = predictedY + channelWidth
        const lowerBound = predictedY - channelWidth
        const actualY = first10PercentPoints[i].close

        if (actualY > upperBound || actualY < lowerBound) {
          outsideCount++
        }
      }

      const outsidePercent = outsideCount / first10PercentPoints.length

      if (outsidePercent > trendBreakThreshold) {
        // >10% of the first 10% points are outside, stop extending backward
        break
      }

      // Continue extending - the extended range becomes the new "original range"
      startIndex = testStartIndex
      intercept = newIntercept
      backwardExtended = true
    }

    // Step 3: Recalculate statistics for the extended channel
    const extendedSegment = displayPrices.slice(startIndex, endIndex + 1)

    // Find turning points and ensure at least one touches
    const turningPoints = findTurningPoints(displayPrices, startIndex, endIndex)

    // Calculate what stdev multiplier would cover all points
    const residuals = extendedSegment.map((point, index) => {
      const predictedY = slope * index + intercept
      return point.close - predictedY
    })
    const maxAbsResidual = Math.max(...residuals.map(r => Math.abs(r)))
    const minStdevMultForAll = maxAbsResidual / stdDev

    // Check if any turning point touches with current multiplier
    let finalStdevMult = optimalStdevMult
    let hasTurningPointTouch = false

    for (const tp of turningPoints) {
      const localIndex = tp.index - startIndex
      const predictedY = slope * localIndex + intercept
      const testChannelWidth = stdDev * finalStdevMult
      const upperBound = predictedY + testChannelWidth
      const lowerBound = predictedY - testChannelWidth
      const actualY = tp.value
      const touchTolerance = 0.02

      const distToUpper = Math.abs(actualY - upperBound) / (upperBound - lowerBound)
      const distToLower = Math.abs(actualY - lowerBound) / (upperBound - lowerBound)

      if ((tp.type === 'max' && distToUpper <= touchTolerance) ||
          (tp.type === 'min' && distToLower <= touchTolerance)) {
        hasTurningPointTouch = true
        break
      }
    }

    // If no turning point touches, adjust to make closest one touch
    if (!hasTurningPointTouch && turningPoints.length > 0) {
      let closestTp = null
      let minAdjustment = Infinity

      for (const tp of turningPoints) {
        const localIndex = tp.index - startIndex
        const predictedY = slope * localIndex + intercept
        const actualY = tp.value
        const residual = Math.abs(actualY - predictedY)
        const requiredMult = residual / stdDev
        const adjustment = Math.abs(requiredMult - finalStdevMult)

        if (adjustment < minAdjustment) {
          minAdjustment = adjustment
          closestTp = { ...tp, requiredMult }
        }
      }

      if (closestTp) {
        finalStdevMult = Math.max(closestTp.requiredMult, finalStdevMult, minStdevMultForAll)
      }
    }

    // Ensure we cover all points
    finalStdevMult = Math.max(finalStdevMult, minStdevMultForAll)

    const finalChannelWidth = stdDev * finalStdevMult

    // Calculate statistics
    let touchCount = 0
    let totalSS = 0
    let residualSS = 0
    const meanY = extendedSegment.reduce((sum, p) => sum + p.close, 0) / extendedSegment.length

    extendedSegment.forEach((point, index) => {
      const predictedY = slope * index + intercept
      const upperBound = predictedY + finalChannelWidth
      const lowerBound = predictedY - finalChannelWidth

      const distanceToUpper = Math.abs(point.close - upperBound)
      const distanceToLower = Math.abs(point.close - lowerBound)
      const boundRange = finalChannelWidth * 2
      const touchToleranceCalc = 0.05

      if (distanceToUpper <= boundRange * touchToleranceCalc) {
        touchCount++
      }
      if (distanceToLower <= boundRange * touchToleranceCalc) {
        touchCount++
      }

      totalSS += Math.pow(point.close - meanY, 2)
      residualSS += Math.pow(point.close - predictedY, 2)
    })

    const rSquared = totalSS > 0 ? 1 - (residualSS / totalSS) : 0

    // Update the manual channel with extended range
    if (forwardExtended || backwardExtended) {
      const updatedChannel = {
        startIndex,
        endIndex,
        slope,
        intercept,
        channelWidth: finalChannelWidth,
        stdDev,
        optimalStdevMult: finalStdevMult,
        touchCount,
        rSquared
      }
      setManualChannels(prevChannels => {
        const newChannels = [...prevChannels]
        newChannels[lastChannelIndex] = updatedChannel
        return newChannels
      })
    }
  }

  // Add wheel event listener
  useEffect(() => {
    const chartElement = chartContainerRef.current
    if (chartElement) {
      chartElement.addEventListener('wheel', handleWheel, { passive: false })
      return () => {
        chartElement.removeEventListener('wheel', handleWheel)
      }
    }
  }, [zoomRange, chartData.length])

  return {
    // Event handlers
    handleWheel,
    handleMouseMove,
    handleMouseLeave,
    handleMouseDown,
    handleMouseUp,

    // Channel functions
    fitManualChannel,
    extendManualChannel,
    findTurningPoints,

    // State values
    isSelecting,
    selectionStart,
    selectionEnd,
    isSelectingVolumeProfile,
    volumeProfileSelectionStart,
    volumeProfileSelectionEnd,
    isPanning,
    manualChannels,
    setManualChannels
  }
}
