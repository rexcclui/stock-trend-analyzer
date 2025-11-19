import React from 'react'
import { X, ArrowLeftRight } from 'lucide-react'

/**
 * Custom legend component for the price chart.
 * Displays interactive legend items for SMAs, channels, and trend lines with visibility controls.
 *
 * @param {Object} props - Component props
 * @param {Array} props.payload - Legend data payload
 * @param {Object} props.smaVisibility - Visibility state for each SMA period
 * @param {Function} props.onToggleSma - Handler for toggling SMA visibility
 * @param {Function} props.onDeleteSma - Handler for deleting SMA line
 * @param {Object} props.allChannelsVisibility - Visibility state for each all channel
 * @param {Function} props.setAllChannelsVisibility - Handler for setting all channels visibility
 * @param {Function} props.setAllChannels - Handler for setting all channels
 * @param {Object} props.revAllChannelsVisibility - Visibility state for each reversed all channel
 * @param {Function} props.setRevAllChannelsVisibility - Handler for setting reversed all channels visibility
 * @param {boolean} props.trendChannelVisible - Whether the trend channel is visible
 * @param {Function} props.setTrendChannelVisible - Handler for setting trend channel visibility
 * @param {boolean} props.slopeChannelEnabled - Whether slope channel is enabled
 * @param {Function} props.onSlopeChannelParamsChange - Handler for slope channel parameter changes
 * @param {boolean} props.controlsVisible - Whether controls panel is visible
 * @param {Function} props.setControlsVisible - Handler for setting controls visibility
 * @param {Array} props.manualChannels - Array of manual channels
 * @param {Function} props.setManualChannels - Handler for setting manual channels
 * @param {Function} props.extendManualChannel - Handler for extending manual channel
 * @returns {JSX.Element} Legend element
 */
const ChartLegend = ({
  payload,
  smaVisibility = {},
  onToggleSma,
  onDeleteSma,
  allChannelsVisibility = {},
  setAllChannelsVisibility,
  setAllChannels,
  revAllChannelsVisibility = {},
  setRevAllChannelsVisibility,
  trendChannelVisible = true,
  setTrendChannelVisible,
  slopeChannelEnabled = false,
  onSlopeChannelParamsChange,
  controlsVisible = false,
  setControlsVisible,
  manualChannels = [],
  setManualChannels,
  extendManualChannel
}) => {
  return (
    <div className="flex justify-center gap-4 mt-2 flex-wrap">
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

        // Check if this is the main trend channel
        const isTrendLine = entry.dataKey === 'channelMid'

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

        const isVisible = isSma ? smaVisibility[period] : (isAllChannel ? allChannelsVisibility[channelIndex] : (isRevAllChannel ? revAllChannelsVisibility[revChannelIndex] : (isTrendLine ? trendChannelVisible : true)))
        const isClickable = isSma || isAllChannel || isRevAllChannel || isTrendLine

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
                } else if (isTrendLine) {
                  setTrendChannelVisible(!trendChannelVisible)
                }
              }}
              className={`flex items-center gap-2 ${
                isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
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
            )}
            {isTrendLine && slopeChannelEnabled && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  // Disable slope channel by calling parent handler
                  if (onSlopeChannelParamsChange) {
                    // Signal to parent to disable slope channel
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
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/>
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
    </div>
  )
}

export default ChartLegend
