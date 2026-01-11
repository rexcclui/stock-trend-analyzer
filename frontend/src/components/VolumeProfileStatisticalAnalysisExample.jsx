/**
 * Example Integration: Volume Profile Statistical Analysis
 *
 * This file demonstrates how to integrate the Volume Profile Statistical Analysis
 * into your stock analysis application.
 *
 * Features demonstrated:
 * 1. Calculating POC, Value Area, HVN, LVN from price data
 * 2. Visualizing these metrics on a chart
 * 3. Generating trading signals based on volume statistics
 * 4. Comparing with market benchmarks
 * 5. Analyzing evolution over time
 */

import React, { useState, useEffect, useMemo } from 'react'
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Customized } from 'recharts'
import {
  calculateVolumeProfileStatistics,
  generateVolumeProfileSignals,
  analyzeVolumeProfileEvolution,
  compareVolumeProfiles
} from './PriceChart/utils/volumeProfileStatisticalAnalysis'
import {
  CustomVolumeProfileStatisticalOverlay,
  VolumeProfileStatisticalLegend
} from './PriceChart/components/VolumeProfileStatisticalOverlay'

/**
 * Main component demonstrating Volume Profile Statistical Analysis
 */
const VolumeProfileStatisticalAnalysisExample = ({ priceData, benchmarkData = null }) => {
  const [showPOC, setShowPOC] = useState(true)
  const [showValueArea, setShowValueArea] = useState(true)
  const [showHVN, setShowHVN] = useState(true)
  const [showLVN, setShowLVN] = useState(true)
  const [numBins, setNumBins] = useState(50)
  const [valueAreaPercent, setValueAreaPercent] = useState(0.70)
  const [hvnThreshold, setHvnThreshold] = useState(1.5)
  const [lvnThreshold, setLvnThreshold] = useState(0.5)

  // Calculate volume profile statistics
  const volumeStats = useMemo(() => {
    if (!priceData || priceData.length === 0) return null

    return calculateVolumeProfileStatistics(priceData, {
      numBins,
      valueAreaPercent,
      hvnThreshold,
      lvnThreshold
    })
  }, [priceData, numBins, valueAreaPercent, hvnThreshold, lvnThreshold])

  // Generate trading signals
  const signals = useMemo(() => {
    if (!priceData || !volumeStats) return []
    return generateVolumeProfileSignals(priceData, volumeStats)
  }, [priceData, volumeStats])

  // Analyze evolution over time (sliding window analysis)
  const evolution = useMemo(() => {
    if (!priceData || priceData.length < 30) return null

    return analyzeVolumeProfileEvolution(priceData, {
      windowSize: 30,
      stepSize: 5,
      numBins
    })
  }, [priceData, numBins])

  // Compare with benchmark if available
  const comparison = useMemo(() => {
    if (!priceData || !benchmarkData) return null

    return compareVolumeProfiles(priceData, benchmarkData, {
      numBins,
      valueAreaPercent,
      hvnThreshold,
      lvnThreshold
    })
  }, [priceData, benchmarkData, numBins, valueAreaPercent, hvnThreshold, lvnThreshold])

  if (!volumeStats) {
    return <div className="text-white">Loading volume profile statistics...</div>
  }

  return (
    <div className="volume-profile-statistical-analysis" style={{ padding: '20px', backgroundColor: '#0f172a' }}>
      <h2 style={{ color: '#f1f5f9', marginBottom: '20px' }}>
        Volume Profile Statistical Analysis
      </h2>

      {/* Control Panel */}
      <div className="controls" style={{
        backgroundColor: '#1e293b',
        padding: '15px',
        borderRadius: '8px',
        marginBottom: '20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '15px'
      }}>
        <div>
          <label style={{ color: '#cbd5e1', display: 'block', marginBottom: '5px', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={showPOC}
              onChange={(e) => setShowPOC(e.target.checked)}
              style={{ marginRight: '8px' }}
            />
            Show Point of Control (POC)
          </label>
        </div>

        <div>
          <label style={{ color: '#cbd5e1', display: 'block', marginBottom: '5px', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={showValueArea}
              onChange={(e) => setShowValueArea(e.target.checked)}
              style={{ marginRight: '8px' }}
            />
            Show Value Area (70%)
          </label>
        </div>

        <div>
          <label style={{ color: '#cbd5e1', display: 'block', marginBottom: '5px', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={showHVN}
              onChange={(e) => setShowHVN(e.target.checked)}
              style={{ marginRight: '8px' }}
            />
            Show High Volume Nodes
          </label>
        </div>

        <div>
          <label style={{ color: '#cbd5e1', display: 'block', marginBottom: '5px', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={showLVN}
              onChange={(e) => setShowLVN(e.target.checked)}
              style={{ marginRight: '8px' }}
            />
            Show Low Volume Nodes
          </label>
        </div>

        <div>
          <label style={{ color: '#cbd5e1', display: 'block', marginBottom: '5px', fontSize: '13px' }}>
            Number of Price Bins: {numBins}
          </label>
          <input
            type="range"
            min="20"
            max="100"
            value={numBins}
            onChange={(e) => setNumBins(parseInt(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <label style={{ color: '#cbd5e1', display: 'block', marginBottom: '5px', fontSize: '13px' }}>
            HVN Threshold: {hvnThreshold}x
          </label>
          <input
            type="range"
            min="1.0"
            max="3.0"
            step="0.1"
            value={hvnThreshold}
            onChange={(e) => setHvnThreshold(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* Main Chart with Overlays */}
      <div style={{ marginBottom: '20px' }}>
        <ResponsiveContainer width="100%" height={500}>
          <ComposedChart data={priceData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="date"
              stroke="#94a3b8"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
            />
            <YAxis
              domain={['auto', 'auto']}
              stroke="#94a3b8"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#e2e8f0'
              }}
            />
            <Legend />

            <Line
              type="monotone"
              dataKey="close"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
              name="Price"
            />

            {/* Custom overlay for Volume Profile Statistics */}
            <Customized
              component={(props) => (
                <CustomVolumeProfileStatisticalOverlay
                  {...props}
                  volumeStats={volumeStats}
                  showPOC={showPOC}
                  showValueArea={showValueArea}
                  showHVN={showHVN}
                  showLVN={showLVN}
                />
              )}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Statistics and Signals Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '20px',
        marginBottom: '20px'
      }}>
        {/* Volume Profile Statistics Legend */}
        <VolumeProfileStatisticalLegend volumeStats={volumeStats} />

        {/* Trading Signals */}
        {signals.length > 0 && (
          <div style={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '12px'
          }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: '#f1f5f9' }}>
              Trading Signals
            </h4>
            {signals.map((signal, idx) => (
              <div key={idx} style={{
                marginBottom: '10px',
                padding: '8px',
                backgroundColor: '#0f172a',
                borderRadius: '4px',
                borderLeft: `3px solid ${getSignalColor(signal.type)}`
              }}>
                <div style={{ fontWeight: '600', color: getSignalColor(signal.type), marginBottom: '4px' }}>
                  {signal.type} - Confidence: {(signal.confidence * 100).toFixed(0)}%
                </div>
                <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                  {signal.reason}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  {signal.detail}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Benchmark Comparison */}
        {comparison && (
          <div style={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '12px'
          }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: '#f1f5f9' }}>
              vs Benchmark
            </h4>
            <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
              <div style={{ marginBottom: '6px' }}>
                <strong>Volume Concentration:</strong> {(comparison.comparison.relativeVolumeConcentration * 100).toFixed(0)}%
              </div>
              <div style={{ marginBottom: '6px' }}>
                <strong>HVN Count Ratio:</strong> {comparison.comparison.relativeHVNCount.toFixed(2)}x
              </div>
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                {comparison.comparison.interpretation}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Evolution Analysis */}
      {evolution && evolution.pocTrend.length > 0 && (
        <div style={{
          backgroundColor: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '15px',
          marginTop: '20px'
        }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold', color: '#f1f5f9' }}>
            Volume Profile Evolution (30-day sliding window)
          </h4>

          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={evolution.pocTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
              />
              <YAxis
                stroke="#94a3b8"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0'
                }}
              />
              <Legend />

              <Line
                type="monotone"
                dataKey="pocPrice"
                stroke="#ff6b6b"
                strokeWidth={2}
                dot={false}
                name="POC Price"
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div style={{ marginTop: '12px', fontSize: '12px', color: '#cbd5e1' }}>
            <strong>POC Volatility:</strong> ${evolution.analysis.pocVolatility.toFixed(2)}
          </div>
          <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '4px' }}>
            <strong>Value Area Trend:</strong> {evolution.analysis.valueAreaExpansion.trend} ({evolution.analysis.valueAreaExpansion.rate.toFixed(1)}%)
          </div>
        </div>
      )}

      {/* Key Statistics Summary */}
      <div style={{
        backgroundColor: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '8px',
        padding: '15px',
        marginTop: '20px'
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold', color: '#f1f5f9' }}>
          Summary Statistics
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', fontSize: '12px', color: '#cbd5e1' }}>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '11px' }}>Price Range</div>
            <div>${volumeStats.statistics.priceRange.min.toFixed(2)} - ${volumeStats.statistics.priceRange.max.toFixed(2)}</div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '11px' }}>POC Volume %</div>
            <div>{(volumeStats.statistics.pocVolumePercent * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '11px' }}>Value Area %</div>
            <div>{(volumeStats.statistics.valueAreaPercent * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '11px' }}>HVN Count</div>
            <div>{volumeStats.statistics.hvnCount}</div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '11px' }}>LVN Count</div>
            <div>{volumeStats.statistics.lvnCount}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Helper function to get signal color
 */
const getSignalColor = (signalType) => {
  switch (signalType) {
    case 'BUY':
      return '#51cf66'
    case 'SELL':
      return '#ff6b6b'
    case 'HOLD':
      return '#ffd43b'
    case 'WATCH':
      return '#74c0fc'
    case 'NEUTRAL':
      return '#94a3b8'
    default:
      return '#cbd5e1'
  }
}

export default VolumeProfileStatisticalAnalysisExample
