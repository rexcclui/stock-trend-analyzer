import { useMemo } from 'react'
import { calculateSlopeChannel } from '../utils/slopeChannelOptimizer'
import { calculateZoneColors } from '../utils/volumeUtils'

/**
 * Custom hook for slope channel calculations
 * @param {Array} data - Price data
 * @param {boolean} enabled - Whether slope channel is enabled
 * @param {Object} channelState - Channel state from useChannelState
 * @param {boolean} volumeWeighted - Whether to use volume weighting
 * @param {number} numZones - Number of zones to calculate
 * @returns {Object} Slope channel data and zone colors
 */
export const useSlopeChannel = (
  data,
  enabled,
  channelState,
  volumeWeighted,
  numZones
) => {
  const {
    optimizedLookbackCount,
    setOptimizedLookbackCount,
    optimizedStdevMult,
    setOptimizedStdevMult
  } = channelState

  const slopeChannelInfo = useMemo(() => {
    if (!enabled || !data || data.length === 0) return null

    return calculateSlopeChannel(
      data,
      { optimizedLookbackCount, optimizedStdevMult },
      ({ optimizedLookbackCount: newLookback, optimizedStdevMult: newStdev }) => {
        setOptimizedLookbackCount(newLookback)
        setOptimizedStdevMult(newStdev)
      },
      true,
      volumeWeighted
    )
  }, [data, enabled, optimizedLookbackCount, optimizedStdevMult, volumeWeighted, setOptimizedLookbackCount, setOptimizedStdevMult])

  const zoneColors = useMemo(() => {
    if (!enabled || !slopeChannelInfo) return []
    return calculateZoneColors(data, slopeChannelInfo, numZones)
  }, [data, enabled, slopeChannelInfo, numZones])

  return {
    slopeChannelInfo,
    zoneColors
  }
}
