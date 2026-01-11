/**
 * Volume Profile Statistical Analysis
 *
 * Provides advanced statistical analysis of volume distribution including:
 * - Point of Control (POC): Price level with highest volume
 * - Value Area (VA): Price range containing 70% of volume
 * - High Volume Nodes (HVN): Significant support/resistance levels
 * - Low Volume Nodes (LVN): Potential breakout zones
 */

/**
 * Calculate comprehensive volume profile statistics
 *
 * @param {Array} priceData - Array of price data {date, close, high, low, volume}
 * @param {Object} options - Configuration options
 * @param {number} options.numBins - Number of price bins (default: 50)
 * @param {number} options.valueAreaPercent - Percentage for value area (default: 0.70 for 70%)
 * @param {number} options.hvnThreshold - Threshold for High Volume Node detection (default: 1.5x average)
 * @param {number} options.lvnThreshold - Threshold for Low Volume Node detection (default: 0.5x average)
 * @returns {Object} Statistical analysis results
 */
export const calculateVolumeProfileStatistics = (priceData, options = {}) => {
  const {
    numBins = 50,
    valueAreaPercent = 0.70,
    hvnThreshold = 1.5,
    lvnThreshold = 0.5
  } = options

  if (!priceData || priceData.length === 0) {
    return {
      poc: null,
      valueAreaHigh: null,
      valueAreaLow: null,
      valueArea: [],
      highVolumeNodes: [],
      lowVolumeNodes: [],
      bins: [],
      totalVolume: 0,
      averageVolumePerBin: 0
    }
  }

  // Step 1: Calculate price range and create bins
  const prices = priceData.map(d => d.close)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const priceRange = maxPrice - minPrice

  if (priceRange === 0) {
    // All prices are the same
    return {
      poc: { price: minPrice, volume: priceData.reduce((sum, d) => sum + (d.volume || 0), 0) },
      valueAreaHigh: minPrice,
      valueAreaLow: minPrice,
      valueArea: [{ minPrice, maxPrice: minPrice, volume: priceData.reduce((sum, d) => sum + (d.volume || 0), 0) }],
      highVolumeNodes: [],
      lowVolumeNodes: [],
      bins: [],
      totalVolume: priceData.reduce((sum, d) => sum + (d.volume || 0), 0),
      averageVolumePerBin: priceData.reduce((sum, d) => sum + (d.volume || 0), 0)
    }
  }

  const binSize = priceRange / numBins

  // Step 2: Initialize bins
  const bins = Array(numBins).fill(0).map((_, i) => ({
    minPrice: minPrice + (i * binSize),
    maxPrice: minPrice + ((i + 1) * binSize),
    midPrice: minPrice + (i * binSize) + (binSize / 2),
    volume: 0,
    volumePercent: 0,
    dataPoints: 0
  }))

  // Step 3: Distribute volume into bins
  let totalVolume = 0
  priceData.forEach(point => {
    const price = point.close
    const volume = point.volume || 0
    totalVolume += volume

    // Find which bin this price falls into
    let binIndex = Math.floor((price - minPrice) / binSize)
    if (binIndex >= numBins) binIndex = numBins - 1
    if (binIndex < 0) binIndex = 0

    bins[binIndex].volume += volume
    bins[binIndex].dataPoints++
  })

  // Step 4: Calculate volume percentages
  bins.forEach(bin => {
    bin.volumePercent = totalVolume > 0 ? (bin.volume / totalVolume) : 0
  })

  const averageVolumePerBin = totalVolume / numBins

  // Step 5: Find Point of Control (POC) - Price level with highest volume
  let poc = bins[0]
  bins.forEach(bin => {
    if (bin.volume > poc.volume) {
      poc = bin
    }
  })

  const pocResult = {
    price: poc.midPrice,
    priceRange: { min: poc.minPrice, max: poc.maxPrice },
    volume: poc.volume,
    volumePercent: poc.volumePercent
  }

  // Step 6: Calculate Value Area (70% of volume)
  // Start from POC and expand outward to include 70% of total volume
  const targetVolume = totalVolume * valueAreaPercent

  // Sort bins by volume in descending order to efficiently find value area
  const sortedBins = [...bins]
    .map((bin, index) => ({ ...bin, originalIndex: index }))
    .sort((a, b) => b.volume - a.volume)

  let accumulatedVolume = 0
  const valueAreaBins = []

  for (const bin of sortedBins) {
    if (accumulatedVolume >= targetVolume) break
    valueAreaBins.push(bin)
    accumulatedVolume += bin.volume
  }

  // Sort value area bins by price to find VAH and VAL
  valueAreaBins.sort((a, b) => a.midPrice - b.midPrice)

  const valueAreaLow = valueAreaBins.length > 0 ? valueAreaBins[0].minPrice : minPrice
  const valueAreaHigh = valueAreaBins.length > 0 ? valueAreaBins[valueAreaBins.length - 1].maxPrice : maxPrice

  // Step 7: Identify High Volume Nodes (HVN)
  // HVNs are bins with volume significantly above average
  const highVolumeNodes = bins
    .filter(bin => bin.volume > 0 && bin.volume >= (averageVolumePerBin * hvnThreshold))
    .map(bin => ({
      price: bin.midPrice,
      priceRange: { min: bin.minPrice, max: bin.maxPrice },
      volume: bin.volume,
      volumePercent: bin.volumePercent,
      volumeRatio: bin.volume / averageVolumePerBin,
      type: 'HVN',
      strength: bin.volume / poc.volume // Strength relative to POC
    }))
    .sort((a, b) => b.volume - a.volume)

  // Step 8: Identify Low Volume Nodes (LVN)
  // LVNs are bins with volume significantly below average (potential breakout zones)
  const lowVolumeNodes = bins
    .filter(bin => {
      // Only consider bins with some volume but below threshold
      return bin.volume > 0 && bin.volume < (averageVolumePerBin * lvnThreshold)
    })
    .map(bin => ({
      price: bin.midPrice,
      priceRange: { min: bin.minPrice, max: bin.maxPrice },
      volume: bin.volume,
      volumePercent: bin.volumePercent,
      volumeRatio: bin.volume / averageVolumePerBin,
      type: 'LVN',
      weakness: 1 - (bin.volume / averageVolumePerBin) // How weak compared to average
    }))
    .sort((a, b) => a.volume - b.volume)

  // Step 9: Cluster adjacent HVN/LVN nodes
  const clusteredHVNs = clusterNodes(highVolumeNodes, binSize)
  const clusteredLVNs = clusterNodes(lowVolumeNodes, binSize)

  return {
    poc: pocResult,
    valueAreaHigh,
    valueAreaLow,
    valueArea: valueAreaBins.map(bin => ({
      minPrice: bin.minPrice,
      maxPrice: bin.maxPrice,
      midPrice: bin.midPrice,
      volume: bin.volume,
      volumePercent: bin.volumePercent
    })),
    highVolumeNodes: clusteredHVNs,
    lowVolumeNodes: clusteredLVNs,
    bins: bins,
    totalVolume,
    averageVolumePerBin,
    statistics: {
      priceRange: { min: minPrice, max: maxPrice },
      valueAreaPercent: accumulatedVolume / totalVolume,
      hvnCount: clusteredHVNs.length,
      lvnCount: clusteredLVNs.length,
      pocVolumePercent: poc.volumePercent
    }
  }
}

/**
 * Cluster adjacent nodes to form continuous support/resistance zones
 *
 * @param {Array} nodes - Array of volume nodes
 * @param {number} binSize - Size of each price bin
 * @returns {Array} Clustered nodes
 */
const clusterNodes = (nodes, binSize) => {
  if (nodes.length === 0) return []

  // Sort by price
  const sortedNodes = [...nodes].sort((a, b) => a.price - b.price)

  const clusters = []
  let currentCluster = [sortedNodes[0]]

  for (let i = 1; i < sortedNodes.length; i++) {
    const node = sortedNodes[i]
    const lastNode = currentCluster[currentCluster.length - 1]

    // If nodes are adjacent or very close (within 2 bins), merge them
    if (node.priceRange.min - lastNode.priceRange.max <= binSize * 2) {
      currentCluster.push(node)
    } else {
      // Finalize current cluster and start new one
      clusters.push(mergeCluster(currentCluster))
      currentCluster = [node]
    }
  }

  // Add the last cluster
  if (currentCluster.length > 0) {
    clusters.push(mergeCluster(currentCluster))
  }

  return clusters
}

/**
 * Merge multiple nodes into a single cluster
 *
 * @param {Array} nodes - Array of nodes to merge
 * @returns {Object} Merged cluster
 */
const mergeCluster = (nodes) => {
  if (nodes.length === 1) return nodes[0]

  const minPrice = Math.min(...nodes.map(n => n.priceRange.min))
  const maxPrice = Math.max(...nodes.map(n => n.priceRange.max))
  const totalVolume = nodes.reduce((sum, n) => n.volume, 0)
  const avgVolumePercent = nodes.reduce((sum, n) => sum + n.volumePercent, 0) / nodes.length
  const avgStrength = nodes.reduce((sum, n) => sum + (n.strength || n.weakness || 0), 0) / nodes.length

  return {
    price: (minPrice + maxPrice) / 2,
    priceRange: { min: minPrice, max: maxPrice },
    volume: totalVolume,
    volumePercent: avgVolumePercent,
    type: nodes[0].type,
    strength: nodes[0].type === 'HVN' ? avgStrength : undefined,
    weakness: nodes[0].type === 'LVN' ? avgStrength : undefined,
    nodeCount: nodes.length,
    isCluster: true
  }
}

/**
 * Calculate time-based volume profile statistics (for intraday or multi-period analysis)
 *
 * @param {Array} priceData - Array of price data with timestamps
 * @param {Object} options - Configuration options
 * @returns {Object} Time-based volume profile statistics
 */
export const calculateTimeBasedVolumeProfile = (priceData, options = {}) => {
  const {
    periods = 'day', // 'hour', 'day', 'week', 'month'
    numBins = 50,
    valueAreaPercent = 0.70
  } = options

  if (!priceData || priceData.length === 0) return { periods: [] }

  // Group data by time periods
  const periodGroups = groupByTimePeriod(priceData, periods)

  // Calculate volume profile statistics for each period
  const periodResults = periodGroups.map(periodData => {
    const stats = calculateVolumeProfileStatistics(periodData.data, {
      numBins,
      valueAreaPercent
    })

    return {
      period: periodData.period,
      startDate: periodData.startDate,
      endDate: periodData.endDate,
      ...stats
    }
  })

  return {
    periods: periodResults,
    totalPeriods: periodResults.length
  }
}

/**
 * Group price data by time periods
 *
 * @param {Array} priceData - Array of price data
 * @param {string} periodType - Type of period ('day', 'week', 'month')
 * @returns {Array} Grouped data by period
 */
const groupByTimePeriod = (priceData, periodType) => {
  // Simple grouping by date for now
  // In a real implementation, you'd use a date library like date-fns or moment.js

  const groups = new Map()

  priceData.forEach(point => {
    let periodKey
    const date = new Date(point.date)

    switch (periodType) {
      case 'week':
        // Group by week
        const weekNum = Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000))
        periodKey = `week-${weekNum}`
        break
      case 'month':
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        break
      case 'day':
      default:
        periodKey = point.date.split('T')[0] // Extract date part
        break
    }

    if (!groups.has(periodKey)) {
      groups.set(periodKey, {
        period: periodKey,
        startDate: point.date,
        endDate: point.date,
        data: []
      })
    }

    const group = groups.get(periodKey)
    group.data.push(point)
    group.endDate = point.date
  })

  return Array.from(groups.values())
}

/**
 * Analyze volume profile evolution over time
 * Tracks how POC and Value Area shift over time
 *
 * @param {Array} priceData - Array of price data
 * @param {Object} options - Configuration options
 * @returns {Object} Evolution analysis
 */
export const analyzeVolumeProfileEvolution = (priceData, options = {}) => {
  const {
    windowSize = 30, // Number of days per window
    stepSize = 5,     // Number of days to step forward
    numBins = 50
  } = options

  if (!priceData || priceData.length < windowSize) {
    return { windows: [], pocTrend: [], valueAreaTrend: [] }
  }

  const windows = []
  const pocTrend = []
  const valueAreaTrend = []

  // Slide a window across the data
  for (let i = 0; i <= priceData.length - windowSize; i += stepSize) {
    const windowData = priceData.slice(i, i + windowSize)
    const stats = calculateVolumeProfileStatistics(windowData, { numBins })

    windows.push({
      startIndex: i,
      endIndex: i + windowSize - 1,
      startDate: windowData[0].date,
      endDate: windowData[windowData.length - 1].date,
      ...stats
    })

    pocTrend.push({
      date: windowData[Math.floor(windowData.length / 2)].date, // Middle date of window
      pocPrice: stats.poc.price,
      pocVolume: stats.poc.volume
    })

    valueAreaTrend.push({
      date: windowData[Math.floor(windowData.length / 2)].date,
      valueAreaHigh: stats.valueAreaHigh,
      valueAreaLow: stats.valueAreaLow,
      valueAreaWidth: stats.valueAreaHigh - stats.valueAreaLow
    })
  }

  return {
    windows,
    pocTrend,
    valueAreaTrend,
    analysis: {
      pocVolatility: calculateVolatility(pocTrend.map(p => p.pocPrice)),
      valueAreaExpansion: analyzeValueAreaExpansion(valueAreaTrend)
    }
  }
}

/**
 * Calculate volatility of a price series
 *
 * @param {Array} prices - Array of prices
 * @returns {number} Standard deviation
 */
const calculateVolatility = (prices) => {
  if (prices.length === 0) return 0

  const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length

  return Math.sqrt(variance)
}

/**
 * Analyze how the value area expands or contracts over time
 *
 * @param {Array} valueAreaTrend - Array of value area data
 * @returns {Object} Expansion analysis
 */
const analyzeValueAreaExpansion = (valueAreaTrend) => {
  if (valueAreaTrend.length === 0) return { trend: 'neutral', rate: 0 }

  const widths = valueAreaTrend.map(va => va.valueAreaWidth)
  const firstWidth = widths[0]
  const lastWidth = widths[widths.length - 1]
  const avgWidth = widths.reduce((sum, w) => sum + w, 0) / widths.length

  const expansionRate = ((lastWidth - firstWidth) / firstWidth) * 100

  return {
    trend: expansionRate > 5 ? 'expanding' : expansionRate < -5 ? 'contracting' : 'stable',
    rate: expansionRate,
    avgWidth,
    minWidth: Math.min(...widths),
    maxWidth: Math.max(...widths)
  }
}

/**
 * Generate trading signals based on volume profile statistics
 *
 * @param {Array} priceData - Array of price data
 * @param {Object} volumeStats - Volume profile statistics
 * @returns {Array} Trading signals
 */
export const generateVolumeProfileSignals = (priceData, volumeStats) => {
  if (!priceData || priceData.length === 0 || !volumeStats.poc) {
    return []
  }

  const signals = []
  const currentPrice = priceData[priceData.length - 1].close
  const { poc, valueAreaHigh, valueAreaLow, highVolumeNodes, lowVolumeNodes } = volumeStats

  // Signal 1: Price at POC (potential consolidation or reversal zone)
  if (Math.abs(currentPrice - poc.price) / poc.price < 0.02) { // Within 2% of POC
    signals.push({
      type: 'NEUTRAL',
      reason: 'Price at Point of Control',
      price: currentPrice,
      poc: poc.price,
      confidence: 0.65,
      detail: 'High volume area - expect consolidation or strong move on break'
    })
  }

  // Signal 2: Price breaking above Value Area High (bullish)
  if (currentPrice > valueAreaHigh && priceData[priceData.length - 2].close <= valueAreaHigh) {
    signals.push({
      type: 'BUY',
      reason: 'Breakout above Value Area High',
      price: currentPrice,
      valueAreaHigh,
      confidence: 0.75,
      detail: 'Price moving into low volume territory above 70% value area'
    })
  }

  // Signal 3: Price breaking below Value Area Low (bearish)
  if (currentPrice < valueAreaLow && priceData[priceData.length - 2].close >= valueAreaLow) {
    signals.push({
      type: 'SELL',
      reason: 'Breakdown below Value Area Low',
      price: currentPrice,
      valueAreaLow,
      confidence: 0.75,
      detail: 'Price moving into low volume territory below 70% value area'
    })
  }

  // Signal 4: Price approaching HVN (support/resistance)
  const nearestHVN = findNearestNode(currentPrice, highVolumeNodes)
  if (nearestHVN && Math.abs(currentPrice - nearestHVN.price) / currentPrice < 0.03) { // Within 3%
    const direction = currentPrice > nearestHVN.price ? 'above' : 'below'
    signals.push({
      type: 'HOLD',
      reason: `Price near High Volume Node (${direction})`,
      price: currentPrice,
      hvnPrice: nearestHVN.price,
      confidence: 0.70,
      detail: `Strong ${currentPrice > nearestHVN.price ? 'support' : 'resistance'} zone - expect reaction`
    })
  }

  // Signal 5: Price in LVN (potential for fast move)
  const nearestLVN = findNearestNode(currentPrice, lowVolumeNodes)
  if (nearestLVN && Math.abs(currentPrice - nearestLVN.price) / currentPrice < 0.02) { // Within 2%
    signals.push({
      type: 'WATCH',
      reason: 'Price in Low Volume Node',
      price: currentPrice,
      lvnPrice: nearestLVN.price,
      confidence: 0.60,
      detail: 'Low volume area - price can move quickly through this zone'
    })
  }

  return signals
}

/**
 * Find the nearest volume node to a given price
 *
 * @param {number} price - Target price
 * @param {Array} nodes - Array of volume nodes
 * @returns {Object|null} Nearest node
 */
const findNearestNode = (price, nodes) => {
  if (!nodes || nodes.length === 0) return null

  let nearest = nodes[0]
  let minDistance = Math.abs(price - nearest.price)

  nodes.forEach(node => {
    const distance = Math.abs(price - node.price)
    if (distance < minDistance) {
      minDistance = distance
      nearest = node
    }
  })

  return nearest
}

/**
 * Compare volume profile between stock and market benchmark
 *
 * @param {Array} stockData - Stock price data
 * @param {Array} benchmarkData - Benchmark price data (e.g., SPY)
 * @param {Object} options - Configuration options
 * @returns {Object} Comparison results
 */
export const compareVolumeProfiles = (stockData, benchmarkData, options = {}) => {
  const stockStats = calculateVolumeProfileStatistics(stockData, options)
  const benchmarkStats = calculateVolumeProfileStatistics(benchmarkData, options)

  // Calculate relative metrics
  const relativeVolumeConcentration = stockStats.poc.volumePercent / benchmarkStats.poc.volumePercent
  const relativeHVNCount = stockStats.highVolumeNodes.length / Math.max(benchmarkStats.highVolumeNodes.length, 1)

  return {
    stock: stockStats,
    benchmark: benchmarkStats,
    comparison: {
      relativeVolumeConcentration,
      relativeHVNCount,
      interpretation: interpretComparison(relativeVolumeConcentration, relativeHVNCount)
    }
  }
}

/**
 * Interpret comparison between stock and benchmark
 *
 * @param {number} volumeConcentration - Relative volume concentration
 * @param {number} hvnCount - Relative HVN count
 * @returns {string} Interpretation
 */
const interpretComparison = (volumeConcentration, hvnCount) => {
  if (volumeConcentration > 1.2 && hvnCount > 1.2) {
    return 'Higher volume concentration and more support/resistance levels than benchmark - more institutional interest'
  } else if (volumeConcentration < 0.8 && hvnCount < 0.8) {
    return 'Lower volume concentration and fewer support/resistance levels - less institutional interest'
  } else if (volumeConcentration > 1.2) {
    return 'Higher volume concentration at key levels - strong accumulation/distribution zones'
  } else {
    return 'Volume distribution similar to benchmark - typical trading behavior'
  }
}
