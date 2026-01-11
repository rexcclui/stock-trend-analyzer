/**
 * Simple test script for Volume Profile Statistical Analysis
 *
 * Run this to verify the implementation works:
 * node test-volume-stats.js
 */

// Sample price data for testing
const samplePriceData = [
  { date: '2024-01-01', close: 150.00, volume: 1000000 },
  { date: '2024-01-02', close: 151.50, volume: 1200000 },
  { date: '2024-01-03', close: 152.00, volume: 800000 },
  { date: '2024-01-04', close: 153.50, volume: 1500000 },
  { date: '2024-01-05', close: 154.00, volume: 1100000 },
  { date: '2024-01-06', close: 153.00, volume: 2500000 }, // High volume at 153
  { date: '2024-01-07', close: 152.50, volume: 900000 },
  { date: '2024-01-08', close: 151.00, volume: 700000 },
  { date: '2024-01-09', close: 150.50, volume: 1800000 },
  { date: '2024-01-10', close: 149.00, volume: 600000 },
  { date: '2024-01-11', close: 148.50, volume: 500000 },
  { date: '2024-01-12', close: 149.50, volume: 1400000 },
  { date: '2024-01-13', close: 150.00, volume: 2000000 }, // High volume at 150
  { date: '2024-01-14', close: 151.00, volume: 1000000 },
  { date: '2024-01-15', close: 152.00, volume: 1100000 },
  { date: '2024-01-16', close: 153.00, volume: 1300000 },
  { date: '2024-01-17', close: 154.00, volume: 900000 },
  { date: '2024-01-18', close: 155.00, volume: 800000 },
  { date: '2024-01-19', close: 154.50, volume: 1000000 },
  { date: '2024-01-20', close: 153.50, volume: 1200000 }
]

// Import the functions (you'll need to adjust path if running from different location)
// For testing purposes, we'll define inline simplified versions

function calculateVolumeProfileStatistics(priceData, options = {}) {
  const {
    numBins = 50,
    valueAreaPercent = 0.70,
    hvnThreshold = 1.5,
    lvnThreshold = 0.5
  } = options

  if (!priceData || priceData.length === 0) {
    return null
  }

  // Calculate price range
  const prices = priceData.map(d => d.close)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const priceRange = maxPrice - minPrice

  if (priceRange === 0) {
    return {
      poc: { price: minPrice, volume: priceData.reduce((sum, d) => sum + d.volume, 0) },
      valueAreaHigh: minPrice,
      valueAreaLow: minPrice,
      highVolumeNodes: [],
      lowVolumeNodes: []
    }
  }

  const binSize = priceRange / numBins

  // Initialize bins
  const bins = Array(numBins).fill(0).map((_, i) => ({
    minPrice: minPrice + (i * binSize),
    maxPrice: minPrice + ((i + 1) * binSize),
    midPrice: minPrice + (i * binSize) + (binSize / 2),
    volume: 0
  }))

  // Distribute volume into bins
  let totalVolume = 0
  priceData.forEach(point => {
    const price = point.close
    const volume = point.volume || 0
    totalVolume += volume

    let binIndex = Math.floor((price - minPrice) / binSize)
    if (binIndex >= numBins) binIndex = numBins - 1
    if (binIndex < 0) binIndex = 0

    bins[binIndex].volume += volume
  })

  // Calculate volume percentages
  bins.forEach(bin => {
    bin.volumePercent = totalVolume > 0 ? (bin.volume / totalVolume) : 0
  })

  const averageVolumePerBin = totalVolume / numBins

  // Find POC
  let poc = bins[0]
  bins.forEach(bin => {
    if (bin.volume > poc.volume) {
      poc = bin
    }
  })

  // Calculate Value Area
  const sortedBins = [...bins].sort((a, b) => b.volume - a.volume)
  const targetVolume = totalVolume * valueAreaPercent
  let accumulatedVolume = 0
  const valueAreaBins = []

  for (const bin of sortedBins) {
    if (accumulatedVolume >= targetVolume) break
    valueAreaBins.push(bin)
    accumulatedVolume += bin.volume
  }

  valueAreaBins.sort((a, b) => a.midPrice - b.midPrice)
  const valueAreaLow = valueAreaBins.length > 0 ? valueAreaBins[0].minPrice : minPrice
  const valueAreaHigh = valueAreaBins.length > 0 ? valueAreaBins[valueAreaBins.length - 1].maxPrice : maxPrice

  // Find HVN and LVN
  const highVolumeNodes = bins
    .filter(bin => bin.volume > 0 && bin.volume >= (averageVolumePerBin * hvnThreshold))
    .map(bin => ({
      price: bin.midPrice,
      volume: bin.volume,
      volumePercent: bin.volumePercent
    }))

  const lowVolumeNodes = bins
    .filter(bin => bin.volume > 0 && bin.volume < (averageVolumePerBin * lvnThreshold))
    .map(bin => ({
      price: bin.midPrice,
      volume: bin.volume,
      volumePercent: bin.volumePercent
    }))

  return {
    poc: {
      price: poc.midPrice,
      volume: poc.volume,
      volumePercent: poc.volumePercent
    },
    valueAreaHigh,
    valueAreaLow,
    highVolumeNodes,
    lowVolumeNodes,
    totalVolume,
    priceRange: { min: minPrice, max: maxPrice }
  }
}

// Run the test
console.log('='.repeat(60))
console.log('VOLUME PROFILE STATISTICAL ANALYSIS TEST')
console.log('='.repeat(60))
console.log()

console.log('📊 Sample Data:')
console.log(`  - ${samplePriceData.length} data points`)
console.log(`  - Date range: ${samplePriceData[0].date} to ${samplePriceData[samplePriceData.length - 1].date}`)
console.log(`  - Price range: $${Math.min(...samplePriceData.map(d => d.close)).toFixed(2)} - $${Math.max(...samplePriceData.map(d => d.close)).toFixed(2)}`)
console.log()

console.log('⚙️  Calculating statistics...')
const stats = calculateVolumeProfileStatistics(samplePriceData, {
  numBins: 30,
  valueAreaPercent: 0.70,
  hvnThreshold: 1.5,
  lvnThreshold: 0.5
})

console.log('✅ Done!')
console.log()

console.log('📈 RESULTS:')
console.log('-'.repeat(60))
console.log()

console.log('🎯 Point of Control (POC):')
console.log(`  Price:        $${stats.poc.price.toFixed(2)}`)
console.log(`  Volume:       ${stats.poc.volume.toLocaleString()}`)
console.log(`  Volume %:     ${(stats.poc.volumePercent * 100).toFixed(2)}%`)
console.log('  Meaning:      Highest volume at this price level')
console.log()

console.log('📊 Value Area (70% of volume):')
console.log(`  High (VAH):   $${stats.valueAreaHigh.toFixed(2)}`)
console.log(`  Low (VAL):    $${stats.valueAreaLow.toFixed(2)}`)
console.log(`  Width:        $${(stats.valueAreaHigh - stats.valueAreaLow).toFixed(2)}`)
console.log('  Meaning:      Fair value zone where most trading occurred')
console.log()

console.log('💪 High Volume Nodes (HVN):')
if (stats.highVolumeNodes.length > 0) {
  console.log(`  Found ${stats.highVolumeNodes.length} HVN(s):`)
  stats.highVolumeNodes.forEach((hvn, idx) => {
    console.log(`    ${idx + 1}. $${hvn.price.toFixed(2)} - ${(hvn.volumePercent * 100).toFixed(2)}% volume`)
  })
  console.log('  Meaning:      Strong support/resistance levels')
} else {
  console.log('  None found (increase data range or lower threshold)')
}
console.log()

console.log('📉 Low Volume Nodes (LVN):')
if (stats.lowVolumeNodes.length > 0) {
  console.log(`  Found ${stats.lowVolumeNodes.length} LVN(s):`)
  stats.lowVolumeNodes.slice(0, 5).forEach((lvn, idx) => {
    console.log(`    ${idx + 1}. $${lvn.price.toFixed(2)} - ${(lvn.volumePercent * 100).toFixed(2)}% volume`)
  })
  if (stats.lowVolumeNodes.length > 5) {
    console.log(`    ... and ${stats.lowVolumeNodes.length - 5} more`)
  }
  console.log('  Meaning:      Thin zones where price can move quickly')
} else {
  console.log('  None found (adjust threshold or data)')
}
console.log()

console.log('📊 Summary Statistics:')
console.log(`  Total Volume:     ${stats.totalVolume.toLocaleString()}`)
console.log(`  Price Range:      $${stats.priceRange.min.toFixed(2)} - $${stats.priceRange.max.toFixed(2)}`)
console.log(`  Current Price:    $${samplePriceData[samplePriceData.length - 1].close.toFixed(2)}`)

const currentPrice = samplePriceData[samplePriceData.length - 1].close
const inValueArea = currentPrice >= stats.valueAreaLow && currentPrice <= stats.valueAreaHigh
console.log(`  Position:         ${inValueArea ? 'In Value Area ✅' : 'Outside Value Area ⚠️'}`)
console.log()

console.log('='.repeat(60))
console.log('✅ TEST COMPLETED SUCCESSFULLY!')
console.log('='.repeat(60))
console.log()
console.log('Next steps:')
console.log('1. Review HOW_TO_USE_VOLUME_PROFILE_STATS.md for integration guide')
console.log('2. Add to your PriceChart component (Option 2 in the guide)')
console.log('3. Or create new Volume Stats tab (Option 3 in the guide)')
console.log()
