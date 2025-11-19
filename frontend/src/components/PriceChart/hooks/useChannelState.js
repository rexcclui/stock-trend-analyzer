import { useState, useEffect } from 'react'
import { findAllChannels, findAllChannelsReversed } from '../calculations/channelCalculations'

/**
 * Custom hook to manage all channel-related state and effects.
 * This hook handles channel detection, visibility management, and parameter optimization
 * for multiple types of channels (all channels and reversed all channels).
 *
 * @param {Object} params - Parameters object
 * @param {boolean} params.slopeChannelVolumeWeighted - Whether volume weighting is enabled for slope channel
 * @param {boolean} params.findAllChannelEnabled - Whether "find all channels" feature is enabled
 * @param {boolean} params.revAllChannelEnabled - Whether "reversed all channels" feature is enabled
 * @param {Array} params.prices - Array of price data points
 * @param {Array} params.indicators - Array of indicator data points
 *
 * @returns {Object} Object containing all channel state and setters:
 *   - optimizedLookbackCount: Stored absolute optimized lookback count (persists across period changes)
 *   - setOptimizedLookbackCount: Setter for optimized lookback count
 *   - optimizedStdevMult: Stored absolute optimized standard deviation multiplier
 *   - setOptimizedStdevMult: Setter for optimized stdev multiplier
 *   - allChannels: Array of all detected channels (forward direction)
 *   - setAllChannels: Setter for all channels
 *   - allChannelsVisibility: Object mapping channel index to visibility boolean
 *   - setAllChannelsVisibility: Setter for all channels visibility
 *   - revAllChannels: Array of all detected channels (reversed direction)
 *   - setRevAllChannels: Setter for reversed all channels
 *   - revAllChannelsVisibility: Object mapping channel index to visibility boolean
 *   - setRevAllChannelsVisibility: Setter for reversed all channels visibility
 *   - trendChannelVisible: Boolean indicating if main trend channel is visible
 *   - setTrendChannelVisible: Setter for trend channel visibility
 */
export const useChannelState = ({
  slopeChannelVolumeWeighted,
  findAllChannelEnabled,
  revAllChannelEnabled,
  prices,
  indicators
}) => {
  // Store ABSOLUTE optimized parameters (not percentages) so they persist across period changes
  const [optimizedLookbackCount, setOptimizedLookbackCount] = useState(null)
  const [optimizedStdevMult, setOptimizedStdevMult] = useState(null)

  // Store all found channels
  const [allChannels, setAllChannels] = useState([])
  const [allChannelsVisibility, setAllChannelsVisibility] = useState({})

  // Store reversed all channels
  const [revAllChannels, setRevAllChannels] = useState([])
  const [revAllChannelsVisibility, setRevAllChannelsVisibility] = useState({})

  // Track main trend channel visibility
  const [trendChannelVisible, setTrendChannelVisible] = useState(true)

  // Reset optimized parameters when volume weighted mode changes
  useEffect(() => {
    setOptimizedLookbackCount(null)
    setOptimizedStdevMult(null)
  }, [slopeChannelVolumeWeighted])

  // Effect to calculate all channels when findAllChannelEnabled changes
  useEffect(() => {
    if (findAllChannelEnabled && prices.length > 0) {
      const dataLength = Math.min(prices.length, indicators.length)
      const displayPrices = prices.slice(0, dataLength)
      const foundChannels = findAllChannels(displayPrices)
      setAllChannels(foundChannels)

      // Initialize visibility for all channels (all visible by default)
      const visibility = {}
      foundChannels.forEach((_, index) => {
        visibility[index] = true
      })
      setAllChannelsVisibility(visibility)
    } else {
      setAllChannels([])
      setAllChannelsVisibility({})
    }
  }, [findAllChannelEnabled, prices, indicators])

  // Effect to calculate reversed all channels when revAllChannelEnabled changes
  useEffect(() => {
    if (revAllChannelEnabled && prices.length > 0) {
      const dataLength = Math.min(prices.length, indicators.length)
      const displayPrices = prices.slice(0, dataLength)
      const foundChannels = findAllChannelsReversed(displayPrices)
      setRevAllChannels(foundChannels)

      // Initialize visibility for all channels (all visible by default)
      const visibility = {}
      foundChannels.forEach((_, index) => {
        visibility[index] = true
      })
      setRevAllChannelsVisibility(visibility)
    } else {
      setRevAllChannels([])
      setRevAllChannelsVisibility({})
    }
  }, [revAllChannelEnabled, prices, indicators])

  return {
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
  }
}
