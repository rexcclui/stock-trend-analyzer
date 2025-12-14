/**
 * Volume Profile V2 Backtesting Utilities
 *
 * This module contains the Volume Profile V2 breakout detection algorithm
 * used in the backtesting tab. It divides price data into date slots and
 * detects breakouts based on volume weight thresholds.
 */

/**
 * Calculate Vol Prf V2 breakouts with configurable parameters
 *
 * @param {Array} prices - Array of price data {date, close, volume}
 * @param {Object} params - Configuration parameters
 * @param {number} params.breakoutThreshold - Volume weight difference threshold (default: 0.06)
 * @param {number} params.lookbackZones - Number of zones to check below (default: 5)
 * @param {number} params.resetThreshold - Reaccumulation threshold (default: 0.03)
 * @param {number} params.timeoutSlots - Number of slots before timeout (default: 5)
 * @returns {Object} {slots, breakouts} - Slots with volume profile data and breakout signals
 */
export function calculateVolPrfV2Breakouts(prices, params = {}) {
  const {
    breakoutThreshold = 0.06,  // 6%
    lookbackZones = 5,          // Check 5 zones below
    resetThreshold = 0.03,      // 3% reaccumulation
    timeoutSlots = 5            // 5-slot timeout
  } = params

  if (!prices || prices.length === 0) return { slots: [], breakouts: [] }

  const reversedDisplayPrices = [...prices].reverse()
  const visibleData = reversedDisplayPrices

  if (visibleData.length === 0) return { slots: [], breakouts: [] }

  // Calculate global min and max from all visible data
  const allPrices = visibleData.map(p => p.close)
  const globalMin = Math.min(...allPrices)
  const globalMax = Math.max(...allPrices)
  const globalRange = globalMax - globalMin

  if (globalRange === 0) return { slots: [], breakouts: [] }

  // Divide data into date slots
  const minSlotSize = 2
  const maxPossibleSlots = Math.floor(visibleData.length / minSlotSize)
  const numDateSlots = Math.min(200, Math.max(1, maxPossibleSlots))
  const slotSize = Math.ceil(visibleData.length / numDateSlots)
  const slots = []

  for (let slotIdx = 0; slotIdx < numDateSlots; slotIdx++) {
    const endIdx = Math.min((slotIdx + 1) * slotSize, visibleData.length)

    if (endIdx === 0) break

    const cumulativeData = visibleData.slice(0, endIdx)
    const slotData = visibleData.slice(slotIdx * slotSize, endIdx)

    if (slotData.length === 0) continue

    const cumulativePrices = cumulativeData.map(p => p.close)
    const cumulativeMin = Math.min(...cumulativePrices)
    const cumulativeMax = Math.max(...cumulativePrices)
    const cumulativeRange = cumulativeMax - cumulativeMin

    if (cumulativeRange === 0) continue

    const numPriceZones = Math.max(3, Math.round((cumulativeRange / globalRange) / 0.03))
    const priceZoneHeight = cumulativeRange / numPriceZones

    // Initialize price zones
    const priceZones = []
    for (let i = 0; i < numPriceZones; i++) {
      priceZones.push({
        minPrice: cumulativeMin + (i * priceZoneHeight),
        maxPrice: cumulativeMin + ((i + 1) * priceZoneHeight),
        volume: 0,
        volumeWeight: 0
      })
    }

    // Accumulate volume
    let totalVolume = 0
    cumulativeData.forEach(price => {
      const priceValue = price.close
      const volume = price.volume || 0
      totalVolume += volume

      let zoneIndex = Math.floor((priceValue - cumulativeMin) / priceZoneHeight)
      if (zoneIndex >= numPriceZones) zoneIndex = numPriceZones - 1
      if (zoneIndex < 0) zoneIndex = 0

      priceZones[zoneIndex].volume += volume
    })

    // Calculate volume weights
    priceZones.forEach(zone => {
      zone.volumeWeight = totalVolume > 0 ? zone.volume / totalVolume : 0
    })

    const currentPrice = slotData[slotData.length - 1].close

    slots.push({
      slotIndex: slotIdx,
      startDate: slotData[0].date,
      endDate: slotData[slotData.length - 1].date,
      priceZones,
      totalVolume,
      currentPrice
    })
  }

  // Detect breakouts with state-based logic using provided parameters
  const breakouts = []

  let isInBreakout = false
  let breakoutZoneWeight = 0
  let breakoutSlotIdx = -1

  for (let i = 0; i < slots.length; i++) {
    const currentSlot = slots[i]
    if (!currentSlot) continue

    const currentPrice = currentSlot.currentPrice

    const currentZoneIdx = currentSlot.priceZones.findIndex(zone =>
      currentPrice >= zone.minPrice && currentPrice <= zone.maxPrice
    )

    if (currentZoneIdx === -1) continue

    const currentZone = currentSlot.priceZones[currentZoneIdx]
    const currentWeight = currentZone.volumeWeight

    // Check timeout
    if (isInBreakout && i - breakoutSlotIdx >= timeoutSlots) {
      isInBreakout = false
      breakoutZoneWeight = 0
      breakoutSlotIdx = -1
    }

    // Check reset condition
    if (isInBreakout && currentWeight >= breakoutZoneWeight + resetThreshold) {
      isInBreakout = false
      breakoutZoneWeight = 0
      breakoutSlotIdx = -1
    }

    // Only detect new breakouts if NOT in breakout state
    if (!isInBreakout && currentZoneIdx > 0) {
      // Check price direction (must be moving UP)
      if (i > 0) {
        const previousSlot = slots[i - 1]
        if (previousSlot) {
          const previousPrice = previousSlot.currentPrice
          if (currentPrice <= previousPrice) {
            continue
          }
        }
      }

      // Find max volume zone within N zones below (configurable)
      const lookbackDepth = Math.min(lookbackZones, currentZoneIdx)
      let maxLowerWeight = 0
      let maxZoneIdx = -1

      for (let lookback = 1; lookback <= lookbackDepth; lookback++) {
        const lowerZone = currentSlot.priceZones[currentZoneIdx - lookback]
        if (lowerZone.volumeWeight > maxLowerWeight) {
          maxLowerWeight = lowerZone.volumeWeight
          maxZoneIdx = currentZoneIdx - lookback
        }
      }

      // Check breakout condition
      if (currentWeight < maxLowerWeight && maxLowerWeight - currentWeight >= breakoutThreshold) {
        breakouts.push({
          slotIdx: i,
          date: currentSlot.endDate,
          price: currentPrice,
          isUpBreak: true,
          currentWeight: currentWeight,
          lowerWeight: maxLowerWeight,
          weightDiff: maxLowerWeight - currentWeight
        })

        // Enter breakout state
        isInBreakout = true
        breakoutZoneWeight = currentWeight
        breakoutSlotIdx = i
      }
    }
  }

  return { slots, breakouts }
}

/**
 * Check if breakout occurred in last N days (relative to today)
 *
 * @param {Array} breakouts - Array of breakout signals
 * @param {number} days - Number of days to look back (default: 10)
 * @returns {Array} Recent breakouts within the specified time window
 */
export function getRecentBreakouts(breakouts, days = 10) {
  if (!breakouts || breakouts.length === 0) return []

  const now = new Date()
  const cutoffDate = new Date(now)
  cutoffDate.setDate(cutoffDate.getDate() - days)

  return breakouts.filter(b => new Date(b.date) >= cutoffDate)
}

/**
 * Get latest breakout info
 *
 * @param {Array} breakouts - Array of breakout signals
 * @returns {Object|null} Latest breakout or null if none exist
 */
export function getLatestBreakout(breakouts) {
  if (!breakouts || breakouts.length === 0) return null
  return breakouts[breakouts.length - 1]
}

/**
 * Find resistance zones: price zones with volume weight > current weight + 5%
 * Zones are classified relative to the latest market price (not the breakout price)
 *
 * @param {Object} breakout - Breakout signal
 * @param {Array} slots - Array of slot data
 * @param {number} referencePrice - Current market price for reference
 * @returns {Object} {upResist, downResist} - Resistance zones above and below current price
 */
export function findResistanceZones(breakout, slots, referencePrice) {
  if (!breakout || !slots || slots.length === 0) return { upResist: null, downResist: null }

  const slotIdx = breakout.slotIdx
  if (slotIdx === undefined || slotIdx < 0 || slotIdx >= slots.length) {
    return { upResist: null, downResist: null }
  }

  const slot = slots[slotIdx]
  if (!slot || !slot.priceZones) return { upResist: null, downResist: null }

  const priceZones = slot.priceZones
  const breakoutWeight = breakout.currentWeight

  // Use the reference price to find current zone
  const currentZoneIdx = priceZones.findIndex(zone =>
    referencePrice >= zone.minPrice && referencePrice <= zone.maxPrice
  )

  if (currentZoneIdx === -1) return { upResist: null, downResist: null }

  const RESISTANCE_THRESHOLD = 0.05 // 5% more volume than breakout zone

  // Find first resistance zone ABOVE current price (zones > currentZoneIdx)
  let upResist = null
  for (let i = currentZoneIdx + 1; i < priceZones.length; i++) {
    const zone = priceZones[i]
    if (zone.volumeWeight >= breakoutWeight + RESISTANCE_THRESHOLD) {
      upResist = {
        minPrice: zone.minPrice,
        maxPrice: zone.maxPrice,
        volumeWeight: zone.volumeWeight,
        distancePercent: ((zone.minPrice - referencePrice) / referencePrice) * 100
      }
      break
    }
  }

  // Find first resistance zone BELOW current price (zones < currentZoneIdx)
  let downResist = null
  for (let i = currentZoneIdx - 1; i >= 0; i--) {
    const zone = priceZones[i]
    if (zone.volumeWeight >= breakoutWeight + RESISTANCE_THRESHOLD) {
      downResist = {
        minPrice: zone.minPrice,
        maxPrice: zone.maxPrice,
        volumeWeight: zone.volumeWeight,
        distancePercent: ((referencePrice - zone.maxPrice) / referencePrice) * 100
      }
      break
    }
  }

  return { upResist, downResist }
}
