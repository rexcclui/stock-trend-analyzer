import React, { useState, useRef } from 'react'
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Customized } from 'recharts'
import { X } from 'lucide-react'

// Calculations
import { calculateAllSMAs } from './PriceChart/calculations/smaCalculations'
import { calculateSlopeChannel } from './PriceChart/calculations/channelCalculations'
import { calculateVolumeProfiles } from './PriceChart/calculations/volumeCalculations'
import { calculateZoneColors, calculateAllChannelZones, calculateManualChannelZones } from './PriceChart/calculations/zoneCalculations'

// Utils
import { getSmaColor, CHANNEL_COLORS, COMPARISON_STOCK_COLORS } from './PriceChart/utils/colorUtils'

// Hooks
import { useChannelState } from './PriceChart/hooks/useChannelState'
import { useChartInteraction } from './PriceChart/hooks/useChartInteraction'
import { useChartDataTransform } from './PriceChart/hooks/useChartDataTransform'

// Components
import ChartTooltip from './PriceChart/components/ChartTooltip'
import ChartLegend from './PriceChart/components/ChartLegend'
import ChartAxisTick from './PriceChart/components/ChartAxisTick'
import VolumeProfile from './PriceChart/components/VolumeProfile'
import SlopeChannelZones from './PriceChart/components/channels/SlopeChannelZones'
import SlopeChannelLabels from './PriceChart/components/channels/SlopeChannelLabels'
import AllChannelZones from './PriceChart/components/channels/AllChannelZones'
import AllChannelLabels from './PriceChart/components/channels/AllChannelLabels'
import RevAllChannelZones from './PriceChart/components/channels/RevAllChannelZones'
import RevAllChannelLabels from './PriceChart/components/channels/RevAllChannelLabels'
import ManualChannelZones from './PriceChart/components/channels/ManualChannelZones'
import ManualChannelLabels from './PriceChart/components/channels/ManualChannelLabels'

function PriceChart({ prices, indicators, signals, syncedMouseDate, setSyncedMouseDate, smaPeriods = [], smaVisibility = {}, onToggleSma, onDeleteSma, volumeColorEnabled = false, volumeColorMode = 'absolute', volumeProfileEnabled = false, volumeProfileMode = 'auto', volumeProfileManualRanges = [], onVolumeProfileManualRangeChange, onVolumeProfileRangeRemove, spyData = null, performanceComparisonEnabled = false, performanceComparisonBenchmark = 'SPY', performanceComparisonDays = 30, comparisonMode = 'line', comparisonStocks = [], slopeChannelEnabled = false, slopeChannelVolumeWeighted = false, slopeChannelZones = 8, slopeChannelDataPercent = 30, slopeChannelWidthMultiplier = 2.5, onSlopeChannelParamsChange, findAllChannelEnabled = false, revAllChannelEnabled = false, manualChannelEnabled = false, manualChannelDragMode = false, chartHeight = 400, days = '365', zoomRange = { start: 0, end: null }, onZoomChange, onExtendPeriod }) {
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const [controlsVisible, setControlsVisible] = useState(false)

  // Calculate displayPrices early (needed by interaction hook)
  const dataLength = Math.min(prices.length, indicators.length)
  const displayPrices = prices.slice(0, dataLength)

  // Use channel state hook
  const {
    optimizedLookbackCount,
    setOptimizedLookbackCount,
    optimizedStdevMult,
    setOptimizedStdevMult,
    allChannels,
    setAllChannels,
    allChannelsVisibility,
    setAllChannelsVisibility,
    revAllChannels,
    setRevAllChannels,
    revAllChannelsVisibility,
    setRevAllChannelsVisibility,
    trendChannelVisible,
    setTrendChannelVisible
  } = useChannelState({
    slopeChannelVolumeWeighted,
    findAllChannelEnabled,
    revAllChannelEnabled,
    prices,
    indicators
  })

  // Use chart interaction hook (manages manual channels state)
  const {
    handleWheel,
    handleMouseMove,
    handleMouseLeave,
    handleMouseDown,
    handleMouseUp,
    fitManualChannel,
    extendManualChannel,
    findTurningPoints,
    isSelecting,
    selectionStart,
    selectionEnd,
    isSelectingVolumeProfile,
    volumeProfileSelectionStart,
    volumeProfileSelectionEnd,
    isPanning,
    manualChannels,
    setManualChannels
  } = useChartInteraction({
    chartData: displayPrices, // Use displayPrices initially, handlers will update with actual chartData
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
  })

  // Use chart data transformation hook (needs manualChannels from interaction hook)
  const { chartData, visibleChartData, smaCache, allChannelZones, revAllChannelZones, allManualChannelZones } = useChartDataTransform({
    prices,
    indicators,
    smaPeriods,
    volumeColorEnabled,
    volumeColorMode,
    spyData,
    days,
    slopeChannelEnabled,
    slopeChannelVolumeWeighted,
    slopeChannelZones,
    optimizedLookbackCount,
    optimizedStdevMult,
    setOptimizedLookbackCount,
    setOptimizedStdevMult,
    findAllChannelEnabled,
    allChannels,
    revAllChannelEnabled,
    revAllChannels,
    manualChannelEnabled,
    manualChannels,
    performanceComparisonEnabled,
    performanceComparisonDays,
    comparisonMode,
    comparisonStocks,
    zoomRange
  })

  // Calculate slope channel info for the current data
  const slopeChannelInfo = slopeChannelEnabled
    ? calculateSlopeChannel(
        displayPrices,
        true,
        slopeChannelVolumeWeighted,
        optimizedLookbackCount,
        optimizedStdevMult,
        setOptimizedLookbackCount,
        setOptimizedStdevMult
      )
    : null

  const zoneColors = slopeChannelEnabled && slopeChannelInfo
    ? calculateZoneColors(displayPrices, slopeChannelInfo, slopeChannelZones)
    : []

  // Calculate volume profiles if enabled
  const volumeProfiles = volumeProfileEnabled
    ? calculateVolumeProfiles({
        volumeProfileEnabled,
        volumeProfileMode,
        volumeProfileManualRanges,
        displayPrices,
        zoomRange
      })
    : []

  // Determine cursor style based on state
  const getCursorStyle = () => {
    if (manualChannelDragMode) return 'crosshair'
    if (isPanning) return 'grabbing'
    return 'grab'
  }

  // Prepare chart data with zones for rendering
  const chartDataWithZones = visibleChartData

  // Calculate transition dates for x-axis ticks
  const transitionDates = new Set()
  const isLongPeriod = parseInt(days) >= 1095 // 3+ years

  chartDataWithZones.forEach((point, index) => {
    if (index === 0) return

    const currentDate = new Date(point.date)
    const prevDate = new Date(chartDataWithZones[index - 1].date)

    if (isLongPeriod) {
      // For long periods, mark year transitions
      if (currentDate.getFullYear() !== prevDate.getFullYear()) {
        transitionDates.add(point.date)
      }
    } else {
      // For shorter periods, mark month transitions
      if (currentDate.getMonth() !== prevDate.getMonth() ||
          currentDate.getFullYear() !== prevDate.getFullYear()) {
        transitionDates.add(point.date)
      }
    }
  })

  return (
    <div
      ref={chartContainerRef}
      style={{ width: '100%', height: chartHeight, position: 'relative', cursor: getCursorStyle(), userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}
    >
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

          {/* Manual Parameter Controls */}
          <div style={{ marginBottom: '12px' }}>
            {/* Lookback Slider */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '11px', color: 'rgb(203, 213, 225)', fontWeight: '500' }}>
                  Lookback Period
                </label>
                <span style={{ fontSize: '11px', color: 'rgb(139, 92, 246)', fontFamily: 'monospace', fontWeight: '600' }}>
                  {slopeChannelInfo.recentDataCount} pts
                </span>
              </div>
              <input
                type="range"
                min={Math.min(100, displayPrices.length)}
                max={displayPrices.length}
                step="1"
                value={slopeChannelInfo.recentDataCount}
                onChange={(e) => {
                  const newCount = parseInt(e.target.value)
                  setOptimizedLookbackCount(newCount)
                }}
                style={{
                  width: '100%',
                  height: '4px',
                  borderRadius: '2px',
                  outline: 'none',
                  background: `linear-gradient(to right, rgb(139, 92, 246) 0%, rgb(139, 92, 246) ${((slopeChannelInfo.recentDataCount - Math.min(100, displayPrices.length)) / (displayPrices.length - Math.min(100, displayPrices.length))) * 100}%, rgb(71, 85, 105) ${((slopeChannelInfo.recentDataCount - Math.min(100, displayPrices.length)) / (displayPrices.length - Math.min(100, displayPrices.length))) * 100}%, rgb(71, 85, 105) 100%)`,
                  cursor: 'pointer'
                }}
              />
            </div>

            {/* StdDev Width Slider */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '11px', color: 'rgb(203, 213, 225)', fontWeight: '500' }}>
                  Channel Width
                </label>
                <span style={{ fontSize: '11px', color: 'rgb(139, 92, 246)', fontFamily: 'monospace', fontWeight: '600' }}>
                  {slopeChannelInfo.optimalStdevMult.toFixed(2)}σ
                </span>
              </div>
              <input
                type="range"
                min="1.0"
                max="4.0"
                step="0.1"
                value={slopeChannelInfo.optimalStdevMult}
                onChange={(e) => {
                  const newMult = parseFloat(e.target.value)
                  setOptimizedStdevMult(newMult)
                }}
                style={{
                  width: '100%',
                  height: '4px',
                  borderRadius: '2px',
                  outline: 'none',
                  background: `linear-gradient(to right, rgb(139, 92, 246) 0%, rgb(139, 92, 246) ${((slopeChannelInfo.optimalStdevMult - 1) / 3) * 100}%, rgb(71, 85, 105) ${((slopeChannelInfo.optimalStdevMult - 1) / 3) * 100}%, rgb(71, 85, 105) 100%)`,
                  cursor: 'pointer'
                }}
              />
            </div>

            {/* Find Best Fit Button */}
            <button
              onClick={() => {
                // Trigger re-optimization by clearing stored params
                setOptimizedLookbackCount(null)
                setOptimizedStdevMult(null)
              }}
              style={{
                width: '100%',
                padding: '8px',
                background: 'rgb(139, 92, 246)',
                border: 'none',
                borderRadius: '6px',
                color: 'rgb(226, 232, 240)',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgb(124, 58, 237)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgb(139, 92, 246)'
              }}
            >
              Find Best Fit
            </button>
          </div>

          {/* Channel Statistics */}
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgb(71, 85, 105)' }}>
            <div style={{ fontSize: '10px', color: 'rgb(148, 163, 184)', lineHeight: '1.4' }}>
              <div>Touches: {slopeChannelInfo.touchCount} ({((slopeChannelInfo.touchCount / slopeChannelInfo.recentDataCount) * 100).toFixed(1)}%)</div>
              <div>Outside: {slopeChannelInfo.percentOutside}% (target: ≤5%)</div>
              <div>R²: {(slopeChannelInfo.rSquared * 100).toFixed(1)}%</div>
              {slopeChannelVolumeWeighted && (
                <div style={{ color: 'rgb(139, 92, 246)', fontWeight: '600' }}>Volume Weighted (bottom 20% ignored)</div>
              )}
            </div>
          </div>
        </div>
      )}

      <ResponsiveContainer>
        <ComposedChart
          data={chartDataWithZones}
          margin={{ top: 5, right: 0, left: 20, bottom: 5 }}
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
            tick={<ChartAxisTick transitionDates={transitionDates} isLongPeriod={isLongPeriod} />}
            interval={Math.floor(chartDataWithZones.length / 10)}
            stroke="#475569"
          />
          <YAxis domain={['auto', 'auto']} tick={{ fill: '#94a3b8' }} stroke="#475569" />
          <Tooltip
            content={<ChartTooltip comparisonStocks={comparisonStocks} comparisonMode={comparisonMode} smaPeriods={smaPeriods} smaVisibility={smaVisibility} />}
            cursor={false}
          />
          <Legend content={<ChartLegend
            smaVisibility={smaVisibility}
            onToggleSma={onToggleSma}
            onDeleteSma={onDeleteSma}
            allChannelsVisibility={allChannelsVisibility}
            setAllChannelsVisibility={setAllChannelsVisibility}
            setAllChannels={setAllChannels}
            revAllChannelsVisibility={revAllChannelsVisibility}
            setRevAllChannelsVisibility={setRevAllChannelsVisibility}
            trendChannelVisible={trendChannelVisible}
            setTrendChannelVisible={setTrendChannelVisible}
            slopeChannelEnabled={slopeChannelEnabled}
            findAllChannelEnabled={findAllChannelEnabled}
            revAllChannelEnabled={revAllChannelEnabled}
            manualChannelEnabled={manualChannelEnabled}
            manualChannelDragMode={manualChannelDragMode}
            manualChannels={manualChannels}
            setManualChannels={setManualChannels}
            extendManualChannel={extendManualChannel}
          />} />
          {/* Mouse Event Capture Overlay - captures events on empty space */}
          <Customized component={(props) => {
            const { xAxisMap, yAxisMap, width, height, offset } = props
            if (!xAxisMap || !yAxisMap) return null

            const xAxis = xAxisMap[0]
            const yAxis = yAxisMap[0]
            if (!xAxis || !yAxis) return null

            // Chart area dimensions
            const chartX = offset?.left || 0
            const chartY = offset?.top || 0
            const chartWidth = width - (offset?.left || 0) - (offset?.right || 0)
            const chartHeight = height - (offset?.top || 0) - (offset?.bottom || 0)

            const handleSvgMouseDown = (e) => {
              const svgRect = e.currentTarget.ownerSVGElement.getBoundingClientRect()
              const xPos = e.clientX - svgRect.left - chartX
              const xPercent = xPos / chartWidth
              const dataIndex = Math.round(xPercent * (chartDataWithZones.length - 1))
              const activeLabel = chartDataWithZones[dataIndex]?.date

              console.log('[SVG MouseDown]', {
                clientX: e.clientX,
                svgLeft: svgRect.left,
                chartX,
                xPos,
                xPercent,
                dataIndex,
                activeLabel,
                totalData: chartDataWithZones.length
              })

              if (activeLabel) {
                handleMouseDown({ activeLabel, chartX: xPos })
              }
            }

            const handleSvgMouseMove = (e) => {
              const svgRect = e.currentTarget.ownerSVGElement.getBoundingClientRect()
              const xPos = e.clientX - svgRect.left - chartX
              const xPercent = xPos / chartWidth
              const dataIndex = Math.round(xPercent * (chartDataWithZones.length - 1))
              const activeLabel = chartDataWithZones[dataIndex]?.date

              if (activeLabel) {
                handleMouseMove({ activeLabel, chartX: xPos })
              }
            }

            const handleSvgMouseUp = (e) => {
              handleMouseUp(e)
            }

            const handleSvgMouseLeave = (e) => {
              handleMouseLeave()
            }

            return (
              <rect
                x={chartX}
                y={chartY}
                width={chartWidth}
                height={chartHeight}
                fill="transparent"
                pointerEvents="all"
                onMouseDown={handleSvgMouseDown}
                onMouseMove={handleSvgMouseMove}
                onMouseUp={handleSvgMouseUp}
                onMouseLeave={handleSvgMouseLeave}
              />
            )
          }} />

          {(() => {
            console.log('[ReferenceLine]', { syncedMouseDate })
            return syncedMouseDate
          })() && (
            <ReferenceLine
              x={syncedMouseDate}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {/* Slope Channel Zones as Parallel Lines */}
          <Customized component={(props) => (
            <SlopeChannelZones
              {...props}
              slopeChannelEnabled={slopeChannelEnabled}
              trendChannelVisible={trendChannelVisible}
              zoneColors={zoneColors}
            />
          )} />

          {/* Slope Channel Stdev Label */}
          <Customized component={(props) => (
            <SlopeChannelLabels
              {...props}
              slopeChannelEnabled={slopeChannelEnabled}
              trendChannelVisible={trendChannelVisible}
              slopeChannelInfo={slopeChannelInfo}
              setControlsVisible={setControlsVisible}
            />
          )} />

          {/* All Channels Zones as Parallel Lines */}
          <Customized component={(props) => (
            <AllChannelZones
              {...props}
              findAllChannelEnabled={findAllChannelEnabled}
              allChannels={allChannels}
              allChannelsVisibility={allChannelsVisibility}
              allChannelZones={allChannelZones}
              chartDataWithZones={chartDataWithZones}
            />
          )} />

          {/* Reversed All Channels Zones as Parallel Lines */}
          <Customized component={(props) => (
            <RevAllChannelZones
              {...props}
              revAllChannelEnabled={revAllChannelEnabled}
              revAllChannels={revAllChannels}
              revAllChannelsVisibility={revAllChannelsVisibility}
              revAllChannelZones={revAllChannelZones}
              chartDataWithZones={chartDataWithZones}
            />
          )} />

          {/* All Channels Stdev Labels at Lower Bound Midpoint */}
          <Customized component={(props) => (
            <AllChannelLabels
              {...props}
              findAllChannelEnabled={findAllChannelEnabled}
              allChannels={allChannels}
              allChannelsVisibility={allChannelsVisibility}
              chartDataWithZones={chartDataWithZones}
            />
          )} />

          {/* Reversed All Channels Stdev Labels at Lower Bound Midpoint */}
          <Customized component={(props) => (
            <RevAllChannelLabels
              {...props}
              revAllChannelEnabled={revAllChannelEnabled}
              revAllChannels={revAllChannels}
              revAllChannelsVisibility={revAllChannelsVisibility}
              chartDataWithZones={chartDataWithZones}
            />
          )} />

          {/* Manual Channel Zones as Parallel Lines */}
          <Customized component={(props) => (
            <ManualChannelZones
              {...props}
              manualChannelEnabled={manualChannelEnabled}
              manualChannels={manualChannels}
              allManualChannelZones={allManualChannelZones}
              chartDataWithZones={chartDataWithZones}
            />
          )} />

          {/* Manual Channel Stdev Labels */}
          <Customized component={(props) => (
            <ManualChannelLabels
              {...props}
              manualChannelEnabled={manualChannelEnabled}
              manualChannels={manualChannels}
              setManualChannels={setManualChannels}
              chartDataWithZones={chartDataWithZones}
              displayPrices={displayPrices}
              zoomRange={zoomRange}
            />
          )} />

          {/* Volume Profile Horizontal Bars */}
          <Customized component={(props) => (
            <VolumeProfile
              {...props}
              volumeProfileEnabled={volumeProfileEnabled}
              volumeProfileMode={volumeProfileMode}
              volumeProfiles={volumeProfiles}
              displayPrices={displayPrices}
              onVolumeProfileRangeRemove={onVolumeProfileRangeRemove}
            />
          )} />

          {/* Manual Channel Selection Rectangle */}
          {manualChannelEnabled && manualChannelDragMode && isSelecting && selectionStart && selectionEnd && (
            <Customized component={(props) => {
              const { xAxisMap, yAxisMap, chartWidth, chartHeight, offset } = props
              if (!xAxisMap || !yAxisMap) return null

              const xAxis = xAxisMap[0]
              const yAxis = yAxisMap[0]

              if (!xAxis || !yAxis) return null

              const startX = xAxis.scale(selectionStart)
              const endX = xAxis.scale(selectionEnd)
              const minX = Math.min(startX, endX)
              const maxX = Math.max(startX, endX)
              const width = maxX - minX

              return (
                <g>
                  <rect
                    x={minX}
                    y={offset.top}
                    width={width}
                    height={chartHeight - offset.top - offset.bottom}
                    fill="rgba(139, 92, 246, 0.1)"
                    stroke="rgba(139, 92, 246, 0.5)"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                  />
                </g>
              )
            }} />
          )}

          <Line
            type="monotone"
            dataKey="close"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={false}
            name="Close Price"
          />
          {volumeColorEnabled && (
            <>
              <Line
                type="monotone"
                dataKey="highVolumeClose"
                stroke="#ea580c"
                strokeWidth={3}
                dot={false}
                name={volumeColorMode === 'relative-spy' ? "High Volume vs SPY (Top 20%)" : "High Volume (Top 20%)"}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="lowVolumeClose"
                stroke="#06b6d4"
                strokeWidth={3}
                dot={false}
                name={volumeColorMode === 'relative-spy' ? "Low Volume vs SPY (Bottom 20%)" : "Low Volume (Bottom 20%)"}
                connectNulls={false}
              />
            </>
          )}
          {performanceComparisonEnabled && comparisonMode === 'color' && (
            <>
              <Line
                type="monotone"
                dataKey="topPerformanceClose"
                stroke="#22c55e"
                strokeWidth={3}
                dot={false}
                name={`Top Performance vs ${performanceComparisonBenchmark} (Top 20%)`}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="bottomPerformanceClose"
                stroke="#ef4444"
                strokeWidth={3}
                dot={false}
                name={`Bottom Performance vs ${performanceComparisonBenchmark} (Bottom 20%)`}
                connectNulls={false}
              />
            </>
          )}
          {comparisonMode === 'line' && comparisonStocks && comparisonStocks.map((compStock, index) => {
            const compPositiveKey = `compPos_${compStock.symbol}`
            const compNegativeKey = `compNeg_${compStock.symbol}`

            const colorPair = COMPARISON_STOCK_COLORS[index % COMPARISON_STOCK_COLORS.length]

            return (
              <React.Fragment key={compStock.symbol}>
                {/* Deeper/darker color when ABOVE selected stock (outperforming) */}
                <Line
                  type="monotone"
                  dataKey={compPositiveKey}
                  stroke={colorPair.dark}
                  strokeWidth={2.5}
                  dot={false}
                  name={`${compStock.symbol} (Above)`}
                  connectNulls={false}
                />
                {/* Lighter color when BELOW selected stock (underperforming) */}
                <Line
                  type="monotone"
                  dataKey={compNegativeKey}
                  stroke={colorPair.light}
                  strokeWidth={2.5}
                  dot={false}
                  name={`${compStock.symbol} (Below)`}
                  connectNulls={false}
                />
              </React.Fragment>
            )
          })}
          {smaPeriods.map((period, index) => {
            const smaKey = `sma${period}`
            const isVisible = smaVisibility[period]

            return (
              <Line
                key={smaKey}
                type="monotone"
                dataKey={smaKey}
                stroke={getSmaColor(period, smaPeriods)}
                strokeWidth={1.5}
                dot={false}
                name={`SMA ${period}`}
                strokeDasharray="5 5"
                hide={!isVisible}
              />
            )
          })}

          {/* Volume Profile Selection Rectangle - MUST BE LAST to render on top */}
          {(() => {
            const shouldRender = volumeProfileEnabled && volumeProfileMode === 'manual' && isSelectingVolumeProfile && volumeProfileSelectionStart && volumeProfileSelectionEnd
            console.log('[Selection Rectangle]', {
              shouldRender,
              volumeProfileEnabled,
              volumeProfileMode,
              isSelectingVolumeProfile,
              volumeProfileSelectionStart,
              volumeProfileSelectionEnd
            })
            return shouldRender
          })() && (
            <Customized component={(props) => {
              const { xAxisMap, yAxisMap, chartWidth, chartHeight, offset } = props
              if (!xAxisMap || !yAxisMap) {
                console.log('[Rectangle] No axis maps')
                return null
              }

              const xAxis = xAxisMap[0]
              const yAxis = yAxisMap[0]

              if (!xAxis || !yAxis) {
                console.log('[Rectangle] No axes')
                return null
              }

              const startX = xAxis.scale(volumeProfileSelectionStart)
              const endX = xAxis.scale(volumeProfileSelectionEnd)
              console.log('[Rectangle Render]', {
                volumeProfileSelectionStart,
                volumeProfileSelectionEnd,
                startX,
                endX,
                minX: Math.min(startX, endX),
                width: Math.abs(endX - startX)
              })

              const minX = Math.min(startX, endX)
              const maxX = Math.max(startX, endX)
              const width = maxX - minX

              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect
                    x={minX}
                    y={offset.top}
                    width={width}
                    height={chartHeight - offset.top - offset.bottom}
                    fill="rgba(59, 130, 246, 0.1)"
                    stroke="rgba(59, 130, 246, 0.5)"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    pointerEvents="none"
                  />
                </g>
              )
            }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>

    </div>
  )
}

export default PriceChart
