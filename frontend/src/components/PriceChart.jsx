import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Customized } from 'recharts'
import { X } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

function PriceChart({ prices, indicators, signals, syncedMouseDate, setSyncedMouseDate, smaPeriods = [], smaVisibility = {}, onToggleSma, onDeleteSma, slopeChannelEnabled = false, slopeChannelZones = 8, slopeChannelDataPercent = 30, slopeChannelWidthMultiplier = 2.5, onSlopeChannelParamsChange, chartHeight = 400, days = '365', zoomRange = { start: 0, end: null }, onZoomChange, onExtendPeriod }) {
  const chartContainerRef = useRef(null)
  const [localDataPercent, setLocalDataPercent] = useState(slopeChannelDataPercent)
  const [localWidthMultiplier, setLocalWidthMultiplier] = useState(slopeChannelWidthMultiplier)
  const [controlsVisible, setControlsVisible] = useState(false)

  // Sync local state with props
  useEffect(() => {
    setLocalDataPercent(slopeChannelDataPercent)
  }, [slopeChannelDataPercent])

  useEffect(() => {
    setLocalWidthMultiplier(slopeChannelWidthMultiplier)
  }, [slopeChannelWidthMultiplier])

  // Note: Zoom reset is handled by parent (StockAnalyzer) when time period changes
  // No need to reset here to avoid infinite loop

  // Calculate SMA for a given period
  const calculateSMA = (data, period) => {
    const smaData = []
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        smaData.push(null)
      } else {
        let sum = 0
        for (let j = 0; j < period; j++) {
          sum += data[i - j].close
        }
        smaData.push(sum / period)
      }
    }
    return smaData
  }

  // Pre-calculate all SMAs
  const smaCache = {}
  smaPeriods.forEach(period => {
    smaCache[period] = calculateSMA(prices, period)
  })

  // Calculate Slope Channel using linear regression
  const calculateSlopeChannel = (data) => {
    if (!data || data.length < 10) return null

    // Find the best channel by starting from the last point and extending backwards
    // Tests different lookback periods and stdev multipliers, scoring by boundary touches
    const findBestChannel = () => {
      const minPoints = Math.min(20, data.length) // Start from 20 points (or less if data is shorter)
      const maxPoints = Math.floor(data.length * (slopeChannelDataPercent / 100))
      const stepSize = Math.max(5, Math.floor((maxPoints - minPoints) / 20)) // Test ~20 different windows

      // Test stdev multipliers from 1 to 4 with 0.25 increments
      const stdevMultipliers = []
      for (let mult = 1.0; mult <= 4.0; mult += 0.25) {
        stdevMultipliers.push(mult)
      }

      let bestTouchCount = 0
      let bestCount = minPoints
      let bestStdevMult = 2.5

      // Try different lookback periods
      for (let count = minPoints; count <= maxPoints; count += stepSize) {
        const testData = data.slice(-count)

        // Calculate regression for this window
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
        const n = testData.length

        testData.forEach((point, index) => {
          sumX += index
          sumY += point.close
          sumXY += index * point.close
          sumX2 += index * index
        })

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
        const intercept = (sumY - slope * sumX) / n

        // Calculate distances from regression line
        const distances = testData.map((point, index) => {
          const predictedY = slope * index + intercept
          return point.close - predictedY
        })

        // Calculate standard deviation
        const meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length
        const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length
        const stdDev = Math.sqrt(variance)

        // Try different stdev multipliers for this lookback period
        for (const stdevMult of stdevMultipliers) {
          const channelWidth = stdDev * stdevMult

          // Count how many points touch or almost touch (within 5%) the upper or lower bounds
          let touchCount = 0
          const touchTolerance = 0.05 // 5% tolerance

          testData.forEach((point, index) => {
            const predictedY = slope * index + intercept
            const upperBound = predictedY + channelWidth
            const lowerBound = predictedY - channelWidth

            const distanceToUpper = Math.abs(point.close - upperBound)
            const distanceToLower = Math.abs(point.close - lowerBound)
            const boundRange = channelWidth * 2

            // Check if price is within 5% of either boundary
            if (distanceToUpper <= boundRange * touchTolerance ||
                distanceToLower <= boundRange * touchTolerance) {
              touchCount++
            }
          })

          // Update best if this combination has more touches
          if (touchCount > bestTouchCount) {
            bestTouchCount = touchCount
            bestCount = count
            bestStdevMult = stdevMult
          }
        }
      }

      // Also test the maximum lookback to ensure we don't miss it
      if (maxPoints > minPoints && (maxPoints - bestCount) > stepSize) {
        const testData = data.slice(-maxPoints)

        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
        const n = testData.length

        testData.forEach((point, index) => {
          sumX += index
          sumY += point.close
          sumXY += index * point.close
          sumX2 += index * index
        })

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
        const intercept = (sumY - slope * sumX) / n

        const distances = testData.map((point, index) => {
          const predictedY = slope * index + intercept
          return point.close - predictedY
        })

        const meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length
        const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length
        const stdDev = Math.sqrt(variance)

        for (const stdevMult of stdevMultipliers) {
          const channelWidth = stdDev * stdevMult

          let touchCount = 0
          const touchTolerance = 0.05

          testData.forEach((point, index) => {
            const predictedY = slope * index + intercept
            const upperBound = predictedY + channelWidth
            const lowerBound = predictedY - channelWidth

            const distanceToUpper = Math.abs(point.close - upperBound)
            const distanceToLower = Math.abs(point.close - lowerBound)
            const boundRange = channelWidth * 2

            if (distanceToUpper <= boundRange * touchTolerance ||
                distanceToLower <= boundRange * touchTolerance) {
              touchCount++
            }
          })

          if (touchCount > bestTouchCount) {
            bestTouchCount = touchCount
            bestCount = maxPoints
            bestStdevMult = stdevMult
          }
        }
      }

      return { count: bestCount, stdevMultiplier: bestStdevMult, touches: bestTouchCount }
    }

    // Find best channel parameters (lookback count and stdev multiplier)
    const bestChannelParams = findBestChannel()
    const recentDataCount = bestChannelParams.count
    const optimalStdevMult = bestChannelParams.stdevMultiplier
    const touchCount = bestChannelParams.touches

    // Use last N data points (counting backwards from the most recent point)
    const recentData = data.slice(-recentDataCount)

    // Calculate linear regression (best fit line) for the selected lookback period
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
    const n = recentData.length

    recentData.forEach((point, index) => {
      const x = index
      const y = point.close
      sumX += x
      sumY += y
      sumXY += x * y
      sumX2 += x * x
    })

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    let intercept = (sumY - slope * sumX) / n

    // Calculate distances from regression line to find channel bounds
    const distances = recentData.map((point, index) => {
      const predictedY = slope * index + intercept
      return point.close - predictedY
    })

    // Use standard deviation to determine channel width
    const meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length
    const stdDev = Math.sqrt(variance)

    // Use the optimal stdev multiplier found by the best-fit algorithm
    let channelWidth = stdDev * optimalStdevMult

    // Calculate channel lines for all data points
    const channelData = data.map((point, globalIndex) => {
      // Adjust index relative to the start of recent data (counting backwards from last point)
      const startOfRecentData = data.length - recentDataCount
      const adjustedIndex = globalIndex - startOfRecentData

      const midValue = slope * adjustedIndex + intercept
      return {
        upper: midValue + channelWidth,
        mid: midValue,
        lower: midValue - channelWidth
      }
    })

    // Calculate final distribution for display
    let finalCountAbove = 0
    let finalCountBelow = 0
    recentData.forEach((point, index) => {
      const predictedY = slope * index + intercept
      if (point.close > predictedY) finalCountAbove++
      else if (point.close < predictedY) finalCountBelow++
    })

    // Calculate R² for the final channel
    const meanY = recentData.reduce((sum, p) => sum + p.close, 0) / n
    let ssTotal = 0
    let ssResidual = 0

    recentData.forEach((point, index) => {
      const predictedY = slope * index + intercept
      ssTotal += Math.pow(point.close - meanY, 2)
      ssResidual += Math.pow(point.close - predictedY, 2)
    })

    const rSquared = 1 - (ssResidual / ssTotal)

    return {
      channelData,
      slope,
      intercept,
      channelWidth,
      stdDev,
      recentDataCount,
      percentAbove: (finalCountAbove / n * 100).toFixed(1),
      percentBelow: (finalCountBelow / n * 100).toFixed(1),
      optimalStdevMult,
      touchCount,
      rSquared
    }
  }

  // Calculate volume-weighted zone colors
  const calculateZoneColors = (data, channelInfo, numZones) => {
    if (!channelInfo || !data) return []

    const { channelData } = channelInfo
    const zoneColors = []

    // Create zones from lower to upper
    for (let i = 0; i < numZones; i++) {
      const zoneStart = i / numZones
      const zoneEnd = (i + 1) / numZones

      let volumeInZone = 0
      let totalVolume = 0

      data.forEach((point, index) => {
        const channel = channelData[index]
        if (!channel) return

        const channelRange = channel.upper - channel.lower
        const zoneLower = channel.lower + channelRange * zoneStart
        const zoneUpper = channel.lower + channelRange * zoneEnd

        const volume = point.volume || 1 // Default volume if not available

        totalVolume += volume

        // Check if price falls in this zone
        if (point.close >= zoneLower && point.close < zoneUpper) {
          volumeInZone += volume
        }
      })

      const volumeWeight = totalVolume > 0 ? volumeInZone / totalVolume : 0

      // Color based on volume weight: higher volume = more intense color
      // Use a gradient from low (blue/green) to high (red/orange)
      const intensity = Math.min(255, Math.floor(volumeWeight * 255 * 3))

      let color
      if (volumeWeight < 0.1) {
        // Very low volume - light blue
        color = `rgba(100, 150, 255, 0.15)`
      } else if (volumeWeight < 0.2) {
        // Low volume - blue/green
        color = `rgba(100, 200, 150, 0.2)`
      } else if (volumeWeight < 0.3) {
        // Medium-low volume - green
        color = `rgba(150, 220, 100, 0.25)`
      } else if (volumeWeight < 0.5) {
        // Medium volume - yellow
        color = `rgba(255, 220, 100, 0.3)`
      } else {
        // High volume - orange/red
        const red = Math.min(255, 200 + intensity)
        color = `rgba(${red}, 150, 100, 0.35)`
      }

      zoneColors.push({
        zoneIndex: i,
        color,
        volumeWeight,
        zoneStart,
        zoneEnd
      })
    }

    return zoneColors
  }

  // Calculate slope channel if enabled
  const slopeChannelInfo = slopeChannelEnabled ? calculateSlopeChannel(prices) : null
  const zoneColors = slopeChannelEnabled && slopeChannelInfo
    ? calculateZoneColors(prices, slopeChannelInfo, slopeChannelZones)
    : []

  // Combine data - ensure we use the minimum length to stay in sync with indicators
  const dataLength = Math.min(prices.length, indicators.length)
  const chartData = prices.slice(0, dataLength).map((price, index) => {
    const indicator = indicators[index] || {}
    const dataPoint = {
      date: price.date,
      close: price.close,
    }

    // Add SMA data for each period
    smaPeriods.forEach(period => {
      const smaKey = `sma${period}`
      // Try backend data first, fall back to frontend calculation
      dataPoint[smaKey] = indicator[smaKey] || smaCache[period][index]
    })

    // Add slope channel data if enabled
    if (slopeChannelInfo && slopeChannelInfo.channelData[index]) {
      const channel = slopeChannelInfo.channelData[index]
      dataPoint.channelUpper = channel.upper
      dataPoint.channelMid = channel.mid
      dataPoint.channelLower = channel.lower
    }

    return dataPoint
  }).reverse() // Show oldest to newest

  // Apply zoom range to chart data
  const endIndex = zoomRange.end === null ? chartData.length : zoomRange.end
  const visibleChartData = chartData.slice(zoomRange.start, endIndex)

  // Handle mouse wheel for zoom
  const handleWheel = (e) => {
    e.preventDefault()
    if (!onZoomChange) return

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

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-slate-800 p-3 border border-slate-600 rounded shadow-lg">
          <p className="font-semibold text-slate-100">{data.date}</p>
          <p className="text-sm text-slate-300">Close: ${data.close?.toFixed(2)}</p>
          {smaPeriods.map(period => {
            const smaKey = `sma${period}`
            const smaValue = data[smaKey]
            if (smaValue && smaVisibility[period]) {
              return (
                <p key={period} className="text-sm" style={{ color: getSmaColor(period) }}>
                  SMA{period}: ${smaValue.toFixed(2)}
                </p>
              )
            }
            return null
          })}
        </div>
      )
    }
    return null
  }

  const getSmaColor = (period) => {
    const colors = ['#3b82f6', '#f97316', '#10b981', '#f59e0b', '#ec4899']
    const index = smaPeriods.indexOf(period) % colors.length
    return colors[index]
  }

  const handleMouseMove = (e) => {
    if (e && e.activeLabel) {
      setSyncedMouseDate(e.activeLabel)
    }
  }

  const handleMouseLeave = () => {
    setSyncedMouseDate(null)
  }

  // Pre-calculate which dates represent month/year transitions
  const getTransitionDates = () => {
    const isLongPeriod = parseInt(days) >= 1095 // 3Y or more
    const transitions = new Set()

    for (let i = 1; i < visibleChartData.length; i++) {
      const current = new Date(visibleChartData[i].date)
      const previous = new Date(visibleChartData[i - 1].date)

      if (isLongPeriod) {
        // Mark year transitions
        if (current.getFullYear() !== previous.getFullYear()) {
          transitions.add(visibleChartData[i].date)
        }
      } else {
        // Mark month transitions
        if (current.getMonth() !== previous.getMonth() || current.getFullYear() !== previous.getFullYear()) {
          transitions.add(visibleChartData[i].date)
        }
      }
    }

    return transitions
  }

  const transitionDates = getTransitionDates()
  const isLongPeriod = parseInt(days) >= 1095

  const CustomXAxisTick = ({ x, y, payload }) => {
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

  const CustomLegend = ({ payload }) => {
    return (
      <div className="flex justify-center gap-4 mt-2 flex-wrap">
        {payload.map((entry, index) => {
          const isSma = entry.dataKey.startsWith('sma')
          const period = isSma ? parseInt(entry.dataKey.replace('sma', '')) : null
          const isVisible = isSma ? smaVisibility[period] : true
          const isTrendLine = entry.dataKey === 'channelMid'

          return (
            <div
              key={`item-${index}`}
              className="flex items-center gap-2 px-2 py-1 rounded transition-all"
            >
              <button
                onClick={() => {
                  if (isSma && onToggleSma) {
                    onToggleSma(period)
                  }
                }}
                className={`flex items-center gap-2 ${
                  isSma ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                }`}
                disabled={!isSma}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    backgroundColor: entry.color,
                    borderRadius: '50%',
                    opacity: isVisible ? 1 : 0.3
                  }}
                />
                <span className={`text-sm text-slate-300 ${!isVisible ? 'line-through opacity-50' : ''}`}>
                  {entry.value}
                </span>
              </button>
              {isSma && onDeleteSma && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteSma(period)
                  }}
                  className="ml-1 p-0.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                  title="Delete SMA line"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              {/* Show controls button next to Trend legend */}
              {isTrendLine && slopeChannelEnabled && onSlopeChannelParamsChange && (
                <button
                  onClick={() => setControlsVisible(!controlsVisible)}
                  className="ml-2 px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors flex items-center gap-1"
                  title={controlsVisible ? "Hide controls" : "Show controls"}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/>
                  </svg>
                  {controlsVisible ? 'Hide' : 'Controls'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Add zone boundaries to chart data
  const chartDataWithZones = visibleChartData.map((point) => {
    if (!slopeChannelEnabled || !point.channelUpper || !point.channelLower) {
      return point
    }

    const channelRange = point.channelUpper - point.channelLower
    const zoneData = {}

    zoneColors.forEach((zone, index) => {
      const lower = point.channelLower + channelRange * zone.zoneStart
      const upper = point.channelLower + channelRange * zone.zoneEnd
      zoneData[`zone${index}Lower`] = lower
      zoneData[`zone${index}Upper`] = upper
    })

    return { ...point, ...zoneData }
  })

  // Custom component to render zone lines with labels
  const CustomZoneLines = (props) => {
    if (!slopeChannelEnabled || zoneColors.length === 0) return null

    const { xAxisMap, yAxisMap, chartWidth, chartHeight, offset } = props
    const xAxis = xAxisMap?.[0]
    const yAxis = yAxisMap?.[0]

    if (!xAxis || !yAxis) return null

    // Generate distinct colors for each zone
    const getZoneColor = (index, total) => {
      const hue = (index / total) * 300 // 0 to 300 degrees (red to blue, avoiding green)
      const saturation = 70
      const lightness = 50 + (index % 2) * 10 // Alternate lightness for better distinction
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`
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

          if (points.length < 2) return null

          // Create path for the zone boundary line
          let pathData = `M ${points[0].x} ${points[0].y}`
          for (let i = 1; i < points.length; i++) {
            pathData += ` L ${points[i].x} ${points[i].y}`
          }

          const color = getZoneColor(zoneIndex, zoneColors.length)
          const lastPoint = points[points.length - 1]

          return (
            <g key={`zone-line-${zoneIndex}`}>
              {/* Zone boundary line */}
              <path
                d={pathData}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray="2 2"
                opacity={0.7}
              />

              {/* Volume percentage label at the end of the line */}
              <text
                x={lastPoint.x + 5}
                y={lastPoint.y}
                fill={color}
                fontSize="11"
                fontWeight="600"
                textAnchor="start"
                dominantBaseline="middle"
              >
                {(zone.volumeWeight * 100).toFixed(1)}%
              </text>
            </g>
          )
        })}
      </g>
    )
  }

  return (
    <div ref={chartContainerRef} style={{ width: '100%', height: chartHeight, position: 'relative' }}>
      {/* Slope Channel Controls Panel */}
      {slopeChannelEnabled && slopeChannelInfo && onSlopeChannelParamsChange && controlsVisible && (
        <div
          style={{
            position: 'absolute',
            bottom: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(30, 41, 59, 0.95)',
            border: '1px solid rgb(71, 85, 105)',
            borderRadius: '8px',
            padding: '12px',
            zIndex: 10,
            minWidth: '280px',
            backdropFilter: 'blur(4px)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'rgb(226, 232, 240)' }}>
              Channel Controls
            </div>
            <button
              onClick={() => setControlsVisible(false)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'rgb(148, 163, 184)',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(71, 85, 105, 0.5)'
                e.currentTarget.style.color = 'rgb(226, 232, 240)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'rgb(148, 163, 184)'
              }}
              title="Hide controls"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Lookback Period */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ fontSize: '11px', color: 'rgb(203, 213, 225)', fontWeight: '500' }}>
                Lookback
              </label>
              <span style={{ fontSize: '11px', color: 'rgb(203, 213, 225)', fontFamily: 'monospace', fontWeight: '600' }}>
                {localDataPercent}%
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={localDataPercent}
              onChange={(e) => {
                const newValue = parseInt(e.target.value)
                setLocalDataPercent(newValue)
                onSlopeChannelParamsChange({ slopeChannelDataPercent: newValue })
              }}
              style={{
                width: '100%',
                height: '4px',
                borderRadius: '2px',
                outline: 'none',
                background: 'linear-gradient(to right, rgb(139, 92, 246) 0%, rgb(139, 92, 246) ' + localDataPercent + '%, rgb(71, 85, 105) ' + localDataPercent + '%, rgb(71, 85, 105) 100%)',
                cursor: 'pointer'
              }}
            />
          </div>

          {/* Channel Width */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ fontSize: '11px', color: 'rgb(203, 213, 225)', fontWeight: '500' }}>
                Width
              </label>
              <span style={{ fontSize: '11px', color: 'rgb(203, 213, 225)', fontFamily: 'monospace', fontWeight: '600' }}>
                {localWidthMultiplier.toFixed(1)}σ
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="4"
              step="0.1"
              value={localWidthMultiplier}
              onChange={(e) => {
                const newValue = parseFloat(e.target.value)
                setLocalWidthMultiplier(newValue)
                onSlopeChannelParamsChange({ slopeChannelWidthMultiplier: newValue })
              }}
              style={{
                width: '100%',
                height: '4px',
                borderRadius: '2px',
                outline: 'none',
                background: 'linear-gradient(to right, rgb(139, 92, 246) 0%, rgb(139, 92, 246) ' + ((localWidthMultiplier - 1) / 3 * 100) + '%, rgb(71, 85, 105) ' + ((localWidthMultiplier - 1) / 3 * 100) + '%, rgb(71, 85, 105) 100%)',
                cursor: 'pointer'
              }}
            />
          </div>

          {/* Channel Info */}
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgb(71, 85, 105)' }}>
            <div style={{ fontSize: '10px', color: 'rgb(148, 163, 184)', lineHeight: '1.4' }}>
              <div>Points: {slopeChannelInfo.recentDataCount}</div>
              <div>Touches: {slopeChannelInfo.touchCount} ({((slopeChannelInfo.touchCount / slopeChannelInfo.recentDataCount) * 100).toFixed(1)}%)</div>
              <div>StdDev: {slopeChannelInfo.optimalStdevMult.toFixed(2)}σ</div>
              <div>R²: {(slopeChannelInfo.rSquared * 100).toFixed(1)}%</div>
            </div>
          </div>
        </div>
      )}

      <ResponsiveContainer>
        <ComposedChart
          data={chartDataWithZones}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {slopeChannelEnabled && zoneColors.map((zone, index) => (
              <linearGradient key={`gradient-${index}`} id={`zoneGradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={zone.color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={zone.color} stopOpacity={0.2} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
          <XAxis
            dataKey="date"
            tick={<CustomXAxisTick />}
            interval={Math.floor(chartDataWithZones.length / 10)}
            stroke="#475569"
          />
          <YAxis domain={['auto', 'auto']} tick={{ fill: '#94a3b8' }} stroke="#475569" />
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
          {syncedMouseDate && (
            <ReferenceLine
              x={syncedMouseDate}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {/* Slope Channel Zones as Parallel Lines */}
          <Customized component={CustomZoneLines} />

          {/* Slope Channel Lines */}
          {slopeChannelEnabled && slopeChannelInfo && (
            <>
              <Line
                type="monotone"
                dataKey="channelUpper"
                stroke="#10b981"
                strokeWidth={1.5}
                dot={false}
                name={`Upper (+${slopeChannelInfo.optimalStdevMult.toFixed(2)}σ)`}
                strokeDasharray="3 3"
              />
              <Line
                type="monotone"
                dataKey="channelMid"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dot={false}
                name={`Trend (${slopeChannelInfo.recentDataCount}pts, ${slopeChannelInfo.touchCount} touches, R²=${(slopeChannelInfo.rSquared * 100).toFixed(1)}%)`}
                strokeDasharray="3 3"
              />
              <Line
                type="monotone"
                dataKey="channelLower"
                stroke="#ef4444"
                strokeWidth={1.5}
                dot={false}
                name={`Lower (-${slopeChannelInfo.optimalStdevMult.toFixed(2)}σ)`}
                strokeDasharray="3 3"
              />
            </>
          )}

          <Line
            type="monotone"
            dataKey="close"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={false}
            name="Close Price"
          />
          {smaPeriods.map((period, index) => {
            const smaKey = `sma${period}`
            const isVisible = smaVisibility[period]

            return (
              <Line
                key={smaKey}
                type="monotone"
                dataKey={smaKey}
                stroke={getSmaColor(period)}
                strokeWidth={1.5}
                dot={false}
                name={`SMA ${period}`}
                strokeDasharray="5 5"
                hide={!isVisible}
              />
            )
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export default PriceChart
