import React from 'react'
import { X, ArrowLeftRight } from 'lucide-react'
import VolumeLegendPills from '../../VolumeLegendPills'

/**
 * Custom Legend component for the chart
 * Handles visibility toggling, deletion, and controls for SMA lines and various channel types
 *
 * @param {Object} props - Component props
 * @param {Array} props.payload - Legend payload from recharts
 * @param {Object} props.smaVisibility - Visibility state for SMA lines
 * @param {Function} props.onToggleSma - Handler to toggle SMA visibility
 * @param {Function} props.onDeleteSma - Handler to delete SMA line
 * @param {Object} props.allChannelsVisibility - Visibility state for all channels
 * @param {Function} props.setAllChannelsVisibility - Setter for all channels visibility
 * @param {Array} props.allChannels - Array of all channel configurations
 * @param {Function} props.setAllChannels - Setter for all channels array
 * @param {Object} props.revAllChannelsVisibility - Visibility state for reversed all channels
 * @param {Function} props.setRevAllChannelsVisibility - Setter for reversed all channels visibility
 * @param {Array} props.revAllChannels - Array of reversed all channel configurations
 * @param {Function} props.setRevAllChannels - Setter for reversed all channels array
 * @param {Function} props.adjustChannelRangeWithoutRecalc - Function to adjust channel range
 * @param {Object} props.bestStdevChannelsVisibility - Visibility state for best stdev channels
 * @param {Function} props.setBestStdevChannelsVisibility - Setter for best stdev channels visibility
 * @param {boolean} props.trendChannelVisible - Visibility state for trend channel
 * @param {Function} props.setTrendChannelVisible - Setter for trend channel visibility
 * @param {boolean} props.slopeChannelEnabled - Whether slope channel is enabled
 * @param {Function} props.onSlopeChannelParamsChange - Handler for slope channel parameter changes
 * @param {boolean} props.controlsVisible - Whether controls panel is visible
 * @param {Function} props.setControlsVisible - Setter for controls visibility
 * @param {Array} props.manualChannels - Array of manual channel configurations
 * @param {Function} props.setManualChannels - Setter for manual channels array
 * @param {Function} props.extendManualChannel - Function to extend manual channel
 * @param {boolean} props.volumeProfileV2Enabled - Whether volume profile V2 is enabled
 * @param {boolean} props.volumeProfileV3Enabled - Whether volume profile V3 is enabled
 * @param {boolean} props.isMobile - Whether the view is mobile
 * @param {Array} props.displayPrices - Price data for display
 * @param {Object} props.zoomRange - Current zoom range {start, end}
 */
export const CustomLegend = ({
  payload,
  smaVisibility,
  onToggleSma,
  onDeleteSma,
  allChannelsVisibility,
  setAllChannelsVisibility,
  allChannels,
  setAllChannels,
  revAllChannelsVisibility,
  setRevAllChannelsVisibility,
  revAllChannels,
  setRevAllChannels,
  adjustChannelRangeWithoutRecalc,
  bestStdevChannelsVisibility,
  setBestStdevChannelsVisibility,
  trendChannelVisible,
  setTrendChannelVisible,
  slopeChannelEnabled,
  onSlopeChannelParamsChange,
  controlsVisible,
  setControlsVisible,
  manualChannels,
  setManualChannels,
  extendManualChannel,
  volumeProfileV2Enabled,
  volumeProfileV3Enabled,
  volumeProfileV3RegressionThreshold,
  onVolumeProfileV3RegressionThresholdChange,
  isMobile,
  displayPrices,
  zoomRange,
  hoveredVolumeLegend,
  hoveredVolumeTitleFormatter
}) => {
  return (
    <div className="flex justify-center gap-4 flex-wrap">
      {payload.map((entry, index) => {
        const isSma = entry.dataKey.startsWith('sma')
        const period = isSma ? parseInt(entry.dataKey.replace('sma', '')) : null

        // Check if this is an all channel line
        const isAllChannel = entry.dataKey.startsWith('allChannel') && entry.dataKey.endsWith('Mid')
        const channelIndex = isAllChannel ? parseInt(entry.dataKey.replace('allChannel', '').replace('Mid', '')) : null

        // Check if this is a reversed all channel line
        const isRevAllChannel = entry.dataKey.startsWith('revAllChannel') && entry.dataKey.endsWith('Mid')
        const revChannelIndex = isRevAllChannel ? parseInt(entry.dataKey.replace('revAllChannel', '').replace('Mid', '')) : null

        // Check if this is a manual channel line
        const isManualChannel = entry.dataKey.startsWith('manualChannel') && entry.dataKey.endsWith('Mid')
        const manualChannelIndex = isManualChannel ? parseInt(entry.dataKey.replace('manualChannel', '').replace('Mid', '')) : null

        // Check if this is a best stdev channel line
        const isBestStdevChannel = entry.dataKey.startsWith('bestStdevChannel') && entry.dataKey.endsWith('Mid')
        const bestStdevChannelIndex = isBestStdevChannel ? parseInt(entry.dataKey.replace('bestStdevChannel', '').replace('Mid', '')) : null

        // Check if this is the main trend channel
        const isTrendLine = entry.dataKey === 'channelMid'
        const isTrendChannelPart = entry.dataKey === 'channelMid' || entry.dataKey === 'channelUpper' || entry.dataKey === 'channelLower'

        // Skip rendering upper/lower bounds in legend (already hidden via legendType="none", but double check)
        if (entry.dataKey === 'channelUpper' || entry.dataKey === 'channelLower') {
          return null
        }

        // Skip rendering allChannel upper/lower bounds in legend
        if (entry.dataKey && (entry.dataKey.includes('allChannel') && (entry.dataKey.endsWith('Upper') || entry.dataKey.endsWith('Lower')))) {
          return null
        }

        // Skip rendering revAllChannel upper/lower bounds in legend
        if (entry.dataKey && (entry.dataKey.includes('revAllChannel') && (entry.dataKey.endsWith('Upper') || entry.dataKey.endsWith('Lower')))) {
          return null
        }

        // Skip rendering manual channel upper/lower bounds in legend
        if (entry.dataKey && (entry.dataKey.includes('manualChannel') && (entry.dataKey.endsWith('Upper') || entry.dataKey.endsWith('Lower')))) {
          return null
        }

        // Skip rendering best channel upper/lower bounds in legend
        if (entry.dataKey && (entry.dataKey.includes('bestChannel') && (entry.dataKey.endsWith('Upper') || entry.dataKey.endsWith('Lower')))) {
          return null
        }

        // Skip rendering bestStdevChannel upper/lower bounds in legend
        if (entry.dataKey && (entry.dataKey.includes('bestStdevChannel') && (entry.dataKey.endsWith('Upper') || entry.dataKey.endsWith('Lower')))) {
          return null
        }

        const isVisible = isSma ? smaVisibility[period] : (isAllChannel ? allChannelsVisibility[channelIndex] : (isRevAllChannel ? revAllChannelsVisibility[revChannelIndex] : (isBestStdevChannel ? bestStdevChannelsVisibility[bestStdevChannelIndex] : (isTrendLine ? trendChannelVisible : true))))
        const isClickable = isSma || isAllChannel || isRevAllChannel || isBestStdevChannel || isTrendLine

        return (
          <div
            key={`item-${index}`}
            className="flex items-center gap-2 px-2 py-1 rounded transition-all"
          >
            <button
              onClick={() => {
                if (isSma && onToggleSma) {
                  onToggleSma(period)
                } else if (isAllChannel) {
                  setAllChannelsVisibility(prev => ({
                    ...prev,
                    [channelIndex]: !prev[channelIndex]
                  }))
                } else if (isRevAllChannel) {
                  setRevAllChannelsVisibility(prev => ({
                    ...prev,
                    [revChannelIndex]: !prev[revChannelIndex]
                  }))
                } else if (isBestStdevChannel) {
                  setBestStdevChannelsVisibility(prev => ({
                    ...prev,
                    [bestStdevChannelIndex]: !prev[bestStdevChannelIndex]
                  }))
                } else if (isTrendLine) {
                  setTrendChannelVisible(!trendChannelVisible)
                }
              }}
              className={`flex items-center gap-2 ${isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                }`}
              disabled={!isClickable}
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
            {isAllChannel && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    // Remove this channel from allChannels array
                    setAllChannels(prev => prev.filter((_, idx) => idx !== channelIndex))
                    // Remove from visibility tracking
                    setAllChannelsVisibility(prev => {
                      const newVis = { ...prev }
                      delete newVis[channelIndex]
                      // Re-index remaining channels
                      const reindexed = {}
                      Object.keys(newVis).forEach(key => {
                        const idx = parseInt(key)
                        if (idx > channelIndex) {
                          reindexed[idx - 1] = newVis[key]
                        } else {
                          reindexed[idx] = newVis[key]
                        }
                      })
                      return reindexed
                    })
                  }}
                  className="ml-1 p-0.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                  title="Remove channel"
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            )}
            {isRevAllChannel && revAllChannels[revChannelIndex] && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    // Decrease range by 5% on each side without refitting
                    setRevAllChannels(prev => prev.map((channel, idx) => {
                      if (idx !== revChannelIndex) return channel
                      const currentLength = channel.endIndex - channel.startIndex + 1
                      const shrinkAmount = Math.max(1, Math.floor(currentLength * 0.05))
                      const newStartIndex = channel.startIndex + shrinkAmount
                      const newEndIndex = channel.endIndex - shrinkAmount
                      return adjustChannelRangeWithoutRecalc(channel, newStartIndex, newEndIndex)
                    }))
                  }}
                  className="ml-1 px-1.5 py-0.5 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors"
                  title="Shrink channel range by 5% on each side"
                >
                  −
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    // Increase range by 5% on each side without refitting
                    setRevAllChannels(prev => prev.map((channel, idx) => {
                      if (idx !== revChannelIndex) return channel
                      const currentLength = channel.endIndex - channel.startIndex + 1
                      const expandAmount = Math.max(1, Math.floor(currentLength * 0.05))
                      const newStartIndex = channel.startIndex - expandAmount
                      const newEndIndex = channel.endIndex + expandAmount
                      return adjustChannelRangeWithoutRecalc(channel, newStartIndex, newEndIndex)
                    }))
                  }}
                  className="ml-1 px-1.5 py-0.5 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors"
                  title="Expand channel range by 5% on each side"
                >
                  +
                </button>
              </>
            )}
            {isTrendLine && slopeChannelEnabled && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  // Disable last channel by calling parent handler
                  if (onSlopeChannelParamsChange) {
                    // Signal to parent to disable last channel
                    onSlopeChannelParamsChange({ slopeChannelEnabled: false })
                  }
                }}
                className="ml-1 p-0.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                title="Remove trend channel"
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
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24" />
                </svg>
                {controlsVisible ? 'Hide' : 'Controls'}
              </button>
            )}
            {/* Manual channel controls */}
            {isManualChannel && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    // Extend this specific channel if it's the last one
                    if (manualChannelIndex === manualChannels.length - 1) {
                      extendManualChannel()
                    }
                  }}
                  className="ml-1 p-0.5 text-slate-400 hover:text-green-400 hover:bg-slate-700 rounded transition-colors"
                  title="Extend channel"
                  disabled={manualChannelIndex !== manualChannels.length - 1}
                  style={{ opacity: manualChannelIndex === manualChannels.length - 1 ? 1 : 0.3 }}
                >
                  <ArrowLeftRight className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    // Remove this channel from manualChannels array
                    setManualChannels(prev => prev.filter((_, idx) => idx !== manualChannelIndex))
                  }}
                  className="ml-1 p-0.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                  title="Remove channel"
                >
                  <X className="w-3 h-3" />
                </button>
                {/* Show "Clear All" button only on the last manual channel */}
                {manualChannelIndex === manualChannels.length - 1 && manualChannels.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setManualChannels([])
                    }}
                    className="ml-2 px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-red-600 hover:text-white transition-colors"
                    title="Clear all manual channels"
                  >
                    Clear All
                  </button>
                )}
              </>
            )}
          </div>
        )
      })}

      {/* Volume Profile V2 Color Legend - inline with other legends (desktop only) */}
      {volumeProfileV2Enabled && !isMobile && (() => {
        // Calculate number of price zones for display
        const reversedDisplayPrices = [...displayPrices].reverse()
        const visibleData = reversedDisplayPrices.slice(zoomRange.start, zoomRange.end === null ? reversedDisplayPrices.length : zoomRange.end)
        const allPrices = visibleData.map(p => p.close)
        const globalMin = Math.min(...allPrices)
        const globalMax = Math.max(...allPrices)
        const globalRange = globalMax - globalMin
        // Dynamic zone count based on cumulative/global range ratio
        const numPriceZones = Math.max(1, Math.round((globalRange / globalRange) / 0.03))

        // Generate color blocks for specific volume weight breakpoints
        const legendSteps = [
          { weight: 0.02, label: '2%' },
          { weight: 0.04, label: '4%' },
          { weight: 0.06, label: '6%' },
          { weight: 0.08, label: '8%' },
          { weight: 0.10, label: '10%' },
          { weight: 0.12, label: '12%' },
          { weight: 0.15, label: '15%' },
          { weight: 0.18, label: '18%' },
          { weight: 0.22, label: '22%' },
          { weight: 0.26, label: '26%' },
          { weight: 0.30, label: '30%' },
          { weight: 0.35, label: '35%+' }
        ]

        return (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            padding: '8px 12px',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            borderRadius: '8px',
            backdropFilter: 'blur(4px)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>
                Volume Weight %
              </span>
              <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>
                {numPriceZones} price zones/bar
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              {legendSteps.map((step, idx) => {
                const normalizedWeight = Math.min(1, step.weight / 0.35)
                const hue = Math.floor(normalizedWeight * 240)
                const saturation = 90 + (normalizedWeight * 10)
                const lightness = 60 - (normalizedWeight * 30)
                const opacity = 0.2 + (Math.pow(normalizedWeight, 0.5) * 0.75)

                return (
                  <div key={idx} style={{
                    width: '32px',
                    height: '20px',
                    background: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
                    opacity: opacity,
                    border: '1px solid rgba(59, 130, 246, 0.5)',
                    borderRadius: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <span style={{ fontSize: '8px', color: '#f1f5f9', fontWeight: 700, textShadow: '0 0 2px rgba(0,0,0,0.8)' }}>
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Volume Profile V3 Color Legend - inline with other legends (desktop only) */}
      {volumeProfileV3Enabled && !isMobile && (() => {
        // Generate color blocks for specific volume weight breakpoints
        const legendSteps = [
          { weight: 0.02, label: '2%' },
          { weight: 0.04, label: '4%' },
          { weight: 0.06, label: '6%' },
          { weight: 0.08, label: '8%' },
          { weight: 0.10, label: '10%' },
          { weight: 0.12, label: '12%' },
          { weight: 0.15, label: '15%' },
          { weight: 0.18, label: '18%' },
          { weight: 0.20, label: '20%' },
          { weight: 0.22, label: '22%' },
          { weight: 0.24, label: '24%' },
          { weight: 0.25, label: '25%+' }
        ]

        return (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            padding: '8px 12px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            backdropFilter: 'blur(4px)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 700 }}>
                V3 Volume Weight %
              </span>
              <span style={{ fontSize: '10px', color: '#6ee7b7', fontWeight: 600 }}>
                10 cumulative zones
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              {legendSteps.map((step, idx) => {
                const normalizedWeight = Math.min(1, step.weight / 0.25)
                const hue = Math.floor(normalizedWeight * 240)
                const saturation = 90 + (normalizedWeight * 10)
                const lightness = 60 - (normalizedWeight * 30)
                const opacity = 0.2 + (Math.pow(normalizedWeight, 0.5) * 0.75)

                return (
                  <div key={idx} style={{
                    width: '32px',
                    height: '20px',
                    background: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
                    opacity: opacity,
                    border: '1px solid rgba(16, 185, 129, 0.5)',
                    borderRadius: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <span style={{ fontSize: '8px', color: '#f1f5f9', fontWeight: 700, textShadow: '0 0 2px rgba(0,0,0,0.8)' }}>
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {hoveredVolumeLegend?.length > 0 && (
        <div className="flex justify-center items-center gap-3">
          <VolumeLegendPills
            legend={hoveredVolumeLegend}
            keyPrefix="chart-hover-volume"
            titleFormatter={hoveredVolumeTitleFormatter}
          />

          {/* V3 Regression Sell Threshold Slider */}
          {volumeProfileV3Enabled && onVolumeProfileV3RegressionThresholdChange && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(30, 41, 59, 0.75)',
                border: '1px solid rgba(168, 85, 247, 0.4)',
                borderRadius: '6px',
                padding: '4px 10px',
                backdropFilter: 'blur(4px)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
              }}
            >
              <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700, whiteSpace: 'nowrap' }}>Regression</span>
              <input
                type="range"
                min={2}
                max={15}
                step={0.5}
                value={volumeProfileV3RegressionThreshold}
                onChange={(e) => onVolumeProfileV3RegressionThresholdChange(Number(e.target.value))}
                title={`Regression sell threshold: ${volumeProfileV3RegressionThreshold}%`}
                style={{
                  width: '100px',
                  height: '4px',
                  margin: 0,
                  padding: 0,
                  cursor: 'pointer',
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  background: 'linear-gradient(to right, #a855f7 0%, #a855f7 100%)',
                  borderRadius: '2px'
                }}
              />
              <span style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 700, minWidth: '35px', textAlign: 'right' }}>
                {volumeProfileV3RegressionThreshold}%
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
