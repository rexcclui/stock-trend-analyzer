import { useState, useEffect } from 'react'

/**
 * Custom hook to manage channel-related state
 * @param {boolean} slopeChannelVolumeWeighted - Whether volume weighting is enabled
 * @returns {Object} Channel state and setters
 */
export const useChannelState = (slopeChannelVolumeWeighted) => {
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

  // Manual channel selection state
  const [manualChannels, setManualChannels] = useState([])

  // Reset optimized parameters when volume weighted mode changes
  useEffect(() => {
    setOptimizedLookbackCount(null)
    setOptimizedStdevMult(null)
  }, [slopeChannelVolumeWeighted])

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
    setTrendChannelVisible,
    manualChannels,
    setManualChannels
  }
}
