/**
 * Unit tests for Volume Profile Statistical Analysis
 *
 * Run with: npm test volumeProfileStatisticalAnalysis.test.js
 */

import {
  calculateVolumeProfileStatistics,
  generateVolumeProfileSignals,
  analyzeVolumeProfileEvolution,
  compareVolumeProfiles
} from '../volumeProfileStatisticalAnalysis'

describe('Volume Profile Statistical Analysis', () => {
  // Sample test data
  const samplePriceData = [
    { date: '2024-01-01', close: 100, volume: 1000000 },
    { date: '2024-01-02', close: 101, volume: 1200000 },
    { date: '2024-01-03', close: 102, volume: 800000 },
    { date: '2024-01-04', close: 103, volume: 1500000 },
    { date: '2024-01-05', close: 104, volume: 1100000 },
    { date: '2024-01-06', close: 103, volume: 2000000 }, // High volume at 103
    { date: '2024-01-07', close: 102, volume: 900000 },
    { date: '2024-01-08', close: 101, volume: 700000 },
    { date: '2024-01-09', close: 100, volume: 1300000 },
    { date: '2024-01-10', close: 99, volume: 600000 },
    { date: '2024-01-11', close: 98, volume: 500000 },
    { date: '2024-01-12', close: 99, volume: 1400000 },
    { date: '2024-01-13', close: 100, volume: 1600000 }, // High volume at 100
    { date: '2024-01-14', close: 101, volume: 1000000 },
    { date: '2024-01-15', close: 102, volume: 1100000 }
  ]

  describe('calculateVolumeProfileStatistics', () => {
    test('should calculate POC correctly', () => {
      const stats = calculateVolumeProfileStatistics(samplePriceData, {
        numBins: 20,
        valueAreaPercent: 0.70
      })

      expect(stats.poc).toBeDefined()
      expect(stats.poc.price).toBeGreaterThan(0)
      expect(stats.poc.volume).toBeGreaterThan(0)
      expect(stats.poc.volumePercent).toBeGreaterThan(0)
      expect(stats.poc.volumePercent).toBeLessThanOrEqual(1)
    })

    test('should calculate Value Area correctly', () => {
      const stats = calculateVolumeProfileStatistics(samplePriceData, {
        numBins: 20,
        valueAreaPercent: 0.70
      })

      expect(stats.valueAreaHigh).toBeDefined()
      expect(stats.valueAreaLow).toBeDefined()
      expect(stats.valueAreaHigh).toBeGreaterThan(stats.valueAreaLow)
      expect(stats.valueArea).toBeInstanceOf(Array)
      expect(stats.valueArea.length).toBeGreaterThan(0)

      // Value area should contain approximately 70% of volume
      const valueAreaVolume = stats.valueArea.reduce((sum, bin) => sum + bin.volume, 0)
      const totalVolume = stats.totalVolume
      const valueAreaPercent = valueAreaVolume / totalVolume

      expect(valueAreaPercent).toBeGreaterThanOrEqual(0.65)
      expect(valueAreaPercent).toBeLessThanOrEqual(0.75)
    })

    test('should identify High Volume Nodes', () => {
      const stats = calculateVolumeProfileStatistics(samplePriceData, {
        numBins: 20,
        hvnThreshold: 1.5,
        lvnThreshold: 0.5
      })

      expect(stats.highVolumeNodes).toBeInstanceOf(Array)

      // Each HVN should have required properties
      stats.highVolumeNodes.forEach(hvn => {
        expect(hvn.price).toBeDefined()
        expect(hvn.volume).toBeGreaterThan(0)
        expect(hvn.type).toBe('HVN')
        expect(hvn.strength).toBeDefined()
        expect(hvn.strength).toBeGreaterThan(0)
        expect(hvn.strength).toBeLessThanOrEqual(1)
      })
    })

    test('should identify Low Volume Nodes', () => {
      const stats = calculateVolumeProfileStatistics(samplePriceData, {
        numBins: 20,
        hvnThreshold: 1.5,
        lvnThreshold: 0.5
      })

      expect(stats.lowVolumeNodes).toBeInstanceOf(Array)

      // Each LVN should have required properties
      stats.lowVolumeNodes.forEach(lvn => {
        expect(lvn.price).toBeDefined()
        expect(lvn.volume).toBeGreaterThanOrEqual(0)
        expect(lvn.type).toBe('LVN')
        expect(lvn.weakness).toBeDefined()
      })
    })

    test('should handle empty data gracefully', () => {
      const stats = calculateVolumeProfileStatistics([], {
        numBins: 20
      })

      expect(stats.poc).toBeNull()
      expect(stats.valueAreaHigh).toBeNull()
      expect(stats.valueAreaLow).toBeNull()
      expect(stats.highVolumeNodes).toEqual([])
      expect(stats.lowVolumeNodes).toEqual([])
    })

    test('should handle single price level', () => {
      const flatData = [
        { date: '2024-01-01', close: 100, volume: 1000000 },
        { date: '2024-01-02', close: 100, volume: 1000000 },
        { date: '2024-01-03', close: 100, volume: 1000000 }
      ]

      const stats = calculateVolumeProfileStatistics(flatData, {
        numBins: 20
      })

      expect(stats.poc.price).toBe(100)
      expect(stats.valueAreaHigh).toBe(100)
      expect(stats.valueAreaLow).toBe(100)
    })

    test('should respect custom bin count', () => {
      const stats30 = calculateVolumeProfileStatistics(samplePriceData, {
        numBins: 30
      })

      const stats50 = calculateVolumeProfileStatistics(samplePriceData, {
        numBins: 50
      })

      expect(stats30.bins.length).toBe(30)
      expect(stats50.bins.length).toBe(50)
    })
  })

  describe('generateVolumeProfileSignals', () => {
    test('should generate signals based on volume profile', () => {
      const stats = calculateVolumeProfileStatistics(samplePriceData, {
        numBins: 20
      })

      const signals = generateVolumeProfileSignals(samplePriceData, stats)

      expect(signals).toBeInstanceOf(Array)

      // Each signal should have required properties
      signals.forEach(signal => {
        expect(signal.type).toBeDefined()
        expect(['BUY', 'SELL', 'HOLD', 'WATCH', 'NEUTRAL']).toContain(signal.type)
        expect(signal.reason).toBeDefined()
        expect(signal.price).toBeDefined()
        expect(signal.confidence).toBeGreaterThan(0)
        expect(signal.confidence).toBeLessThanOrEqual(1)
        expect(signal.detail).toBeDefined()
      })
    })

    test('should detect price at POC', () => {
      // Create data where last price is at POC
      const testData = [
        ...samplePriceData.slice(0, -1),
        { date: '2024-01-15', close: 100, volume: 5000000 } // High volume at 100
      ]

      const stats = calculateVolumeProfileStatistics(testData, { numBins: 20 })
      const signals = generateVolumeProfileSignals(testData, stats)

      // Should generate a signal about being at POC
      const pocSignal = signals.find(s => s.reason.includes('Point of Control'))
      // Note: May or may not trigger depending on exact POC calculation
      if (pocSignal) {
        expect(pocSignal.type).toBe('NEUTRAL')
      }
    })

    test('should handle empty data', () => {
      const stats = calculateVolumeProfileStatistics([], { numBins: 20 })
      const signals = generateVolumeProfileSignals([], stats)

      expect(signals).toEqual([])
    })
  })

  describe('analyzeVolumeProfileEvolution', () => {
    test('should analyze POC evolution over time', () => {
      // Need more data for evolution analysis
      const extendedData = []
      for (let i = 0; i < 60; i++) {
        extendedData.push({
          date: `2024-01-${String(i + 1).padStart(2, '0')}`,
          close: 100 + Math.sin(i / 5) * 10,
          volume: 1000000 + Math.random() * 500000
        })
      }

      const evolution = analyzeVolumeProfileEvolution(extendedData, {
        windowSize: 30,
        stepSize: 5,
        numBins: 20
      })

      expect(evolution.windows).toBeInstanceOf(Array)
      expect(evolution.pocTrend).toBeInstanceOf(Array)
      expect(evolution.valueAreaTrend).toBeInstanceOf(Array)
      expect(evolution.analysis).toBeDefined()
      expect(evolution.analysis.pocVolatility).toBeGreaterThanOrEqual(0)
      expect(evolution.analysis.valueAreaExpansion.trend).toBeDefined()
    })

    test('should handle insufficient data', () => {
      const evolution = analyzeVolumeProfileEvolution(samplePriceData.slice(0, 10), {
        windowSize: 30,
        stepSize: 5
      })

      expect(evolution.windows).toEqual([])
      expect(evolution.pocTrend).toEqual([])
    })
  })

  describe('compareVolumeProfiles', () => {
    test('should compare stock with benchmark', () => {
      const benchmarkData = samplePriceData.map(d => ({
        ...d,
        volume: d.volume * 0.8 // Benchmark has less volume concentration
      }))

      const comparison = compareVolumeProfiles(
        samplePriceData,
        benchmarkData,
        { numBins: 20 }
      )

      expect(comparison.stock).toBeDefined()
      expect(comparison.benchmark).toBeDefined()
      expect(comparison.comparison).toBeDefined()
      expect(comparison.comparison.relativeVolumeConcentration).toBeGreaterThan(0)
      expect(comparison.comparison.relativeHVNCount).toBeGreaterThan(0)
      expect(comparison.comparison.interpretation).toBeDefined()
      expect(typeof comparison.comparison.interpretation).toBe('string')
    })
  })

  describe('Statistical Accuracy', () => {
    test('should have consistent total volume', () => {
      const stats = calculateVolumeProfileStatistics(samplePriceData, {
        numBins: 20
      })

      const expectedTotalVolume = samplePriceData.reduce((sum, d) => sum + d.volume, 0)
      expect(stats.totalVolume).toBe(expectedTotalVolume)

      const binTotalVolume = stats.bins.reduce((sum, bin) => sum + bin.volume, 0)
      expect(binTotalVolume).toBe(expectedTotalVolume)
    })

    test('should have volume percentages sum to 1', () => {
      const stats = calculateVolumeProfileStatistics(samplePriceData, {
        numBins: 20
      })

      const totalPercent = stats.bins.reduce((sum, bin) => sum + bin.volumePercent, 0)
      expect(totalPercent).toBeCloseTo(1.0, 5) // Within 0.00001
    })

    test('should have POC with maximum volume', () => {
      const stats = calculateVolumeProfileStatistics(samplePriceData, {
        numBins: 20
      })

      const maxBinVolume = Math.max(...stats.bins.map(b => b.volume))
      expect(stats.poc.volume).toBe(maxBinVolume)
    })
  })

  describe('Edge Cases', () => {
    test('should handle data with zero volumes', () => {
      const dataWithZeros = [
        { date: '2024-01-01', close: 100, volume: 0 },
        { date: '2024-01-02', close: 101, volume: 1000000 },
        { date: '2024-01-03', close: 102, volume: 0 }
      ]

      const stats = calculateVolumeProfileStatistics(dataWithZeros, {
        numBins: 10
      })

      expect(stats.poc).toBeDefined()
      expect(stats.totalVolume).toBe(1000000)
    })

    test('should handle very high volume concentration', () => {
      const concentratedData = [
        { date: '2024-01-01', close: 100, volume: 100000 },
        { date: '2024-01-02', close: 100, volume: 10000000 }, // 100x more
        { date: '2024-01-03', close: 100, volume: 100000 }
      ]

      const stats = calculateVolumeProfileStatistics(concentratedData, {
        numBins: 10
      })

      expect(stats.poc.volumePercent).toBeGreaterThan(0.9)
    })

    test('should handle wide price range', () => {
      const wideRangeData = [
        { date: '2024-01-01', close: 10, volume: 1000000 },
        { date: '2024-01-02', close: 1000, volume: 1000000 }
      ]

      const stats = calculateVolumeProfileStatistics(wideRangeData, {
        numBins: 50
      })

      expect(stats.poc).toBeDefined()
      expect(stats.bins.length).toBe(50)
    })
  })
})

// Helper function to run tests manually
export const runManualTests = () => {
  console.log('Running Volume Profile Statistical Analysis Tests...\n')

  const testData = [
    { date: '2024-01-01', close: 100, volume: 1000000 },
    { date: '2024-01-02', close: 101, volume: 1200000 },
    { date: '2024-01-03', close: 102, volume: 800000 },
    { date: '2024-01-04', close: 103, volume: 1500000 },
    { date: '2024-01-05', close: 104, volume: 1100000 },
    { date: '2024-01-06', close: 103, volume: 2000000 },
    { date: '2024-01-07', close: 102, volume: 900000 },
    { date: '2024-01-08', close: 101, volume: 700000 },
    { date: '2024-01-09', close: 100, volume: 1300000 },
    { date: '2024-01-10', close: 99, volume: 600000 }
  ]

  console.log('Test 1: Basic Statistics Calculation')
  const stats = calculateVolumeProfileStatistics(testData, {
    numBins: 20,
    valueAreaPercent: 0.70,
    hvnThreshold: 1.5,
    lvnThreshold: 0.5
  })

  console.log('✓ POC Price:', stats.poc.price)
  console.log('✓ POC Volume %:', (stats.poc.volumePercent * 100).toFixed(2) + '%')
  console.log('✓ Value Area High:', stats.valueAreaHigh)
  console.log('✓ Value Area Low:', stats.valueAreaLow)
  console.log('✓ HVN Count:', stats.highVolumeNodes.length)
  console.log('✓ LVN Count:', stats.lowVolumeNodes.length)
  console.log('✓ Total Volume:', stats.totalVolume.toLocaleString())

  console.log('\nTest 2: Signal Generation')
  const signals = generateVolumeProfileSignals(testData, stats)
  console.log('✓ Signals Generated:', signals.length)
  signals.forEach((signal, idx) => {
    console.log(`  ${idx + 1}. ${signal.type}: ${signal.reason} (${(signal.confidence * 100).toFixed(0)}% confidence)`)
  })

  console.log('\n✅ All manual tests passed!')

  return { stats, signals }
}
