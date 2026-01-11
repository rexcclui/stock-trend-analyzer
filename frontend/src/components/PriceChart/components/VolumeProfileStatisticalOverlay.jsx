import React from 'react'

/**
 * Custom component to render Volume Profile Statistical Analysis overlays
 * Displays POC, Value Area, HVN, and LVN on the price chart
 */
export const CustomVolumeProfileStatisticalOverlay = ({
  xAxisMap,
  yAxisMap,
  volumeStats,
  showPOC = true,
  showValueArea = true,
  showHVN = true,
  showLVN = true,
  pocColor = '#ff6b6b',
  valueAreaColor = '#4dabf7',
  hvnColor = '#51cf66',
  lvnColor = '#ffd43b'
}) => {
  if (!volumeStats || !volumeStats.poc) return null

  const yAxis = yAxisMap[0]
  if (!yAxis) return null

  const chartWidth = xAxisMap[0].width
  const chartHeight = yAxis.height
  const chartY = yAxis.y

  const { poc, valueAreaHigh, valueAreaLow, highVolumeNodes, lowVolumeNodes } = volumeStats

  // Helper function to convert price to y-coordinate
  const priceToY = (price) => {
    return chartY + chartHeight - ((price - yAxis.domain[0]) / (yAxis.domain[1] - yAxis.domain[0]) * chartHeight)
  }

  return (
    <g className="volume-profile-statistical-overlay">
      {/* Value Area Rectangle */}
      {showValueArea && (
        <>
          <rect
            x={0}
            y={priceToY(valueAreaHigh)}
            width={chartWidth}
            height={priceToY(valueAreaLow) - priceToY(valueAreaHigh)}
            fill={valueAreaColor}
            opacity={0.1}
            stroke={valueAreaColor}
            strokeWidth={1}
            strokeDasharray="5,5"
          />

          {/* Value Area High Label */}
          <line
            x1={0}
            y1={priceToY(valueAreaHigh)}
            x2={chartWidth}
            y2={priceToY(valueAreaHigh)}
            stroke={valueAreaColor}
            strokeWidth={1.5}
            strokeDasharray="3,3"
            opacity={0.6}
          />
          <text
            x={chartWidth - 5}
            y={priceToY(valueAreaHigh) - 5}
            fill={valueAreaColor}
            fontSize="11"
            fontWeight="600"
            textAnchor="end"
          >
            VAH: ${valueAreaHigh.toFixed(2)}
          </text>

          {/* Value Area Low Label */}
          <line
            x1={0}
            y1={priceToY(valueAreaLow)}
            x2={chartWidth}
            y2={priceToY(valueAreaLow)}
            stroke={valueAreaColor}
            strokeWidth={1.5}
            strokeDasharray="3,3"
            opacity={0.6}
          />
          <text
            x={chartWidth - 5}
            y={priceToY(valueAreaLow) + 15}
            fill={valueAreaColor}
            fontSize="11"
            fontWeight="600"
            textAnchor="end"
          >
            VAL: ${valueAreaLow.toFixed(2)}
          </text>
        </>
      )}

      {/* Point of Control (POC) */}
      {showPOC && (
        <>
          <line
            x1={0}
            y1={priceToY(poc.price)}
            x2={chartWidth}
            y2={priceToY(poc.price)}
            stroke={pocColor}
            strokeWidth={2.5}
            opacity={0.8}
          />
          <text
            x={10}
            y={priceToY(poc.price) - 8}
            fill={pocColor}
            fontSize="12"
            fontWeight="bold"
          >
            POC: ${poc.price.toFixed(2)} ({(poc.volumePercent * 100).toFixed(1)}%)
          </text>

          {/* POC indicator on right side */}
          <circle
            cx={chartWidth - 10}
            cy={priceToY(poc.price)}
            r={5}
            fill={pocColor}
            opacity={0.8}
          />
        </>
      )}

      {/* High Volume Nodes (HVN) - Support/Resistance */}
      {showHVN && highVolumeNodes.map((hvn, index) => {
        const y = priceToY(hvn.price)
        const isCluster = hvn.isCluster

        return (
          <g key={`hvn-${index}`}>
            {/* HVN zone rectangle for clusters */}
            {isCluster && (
              <rect
                x={0}
                y={priceToY(hvn.priceRange.max)}
                width={chartWidth}
                height={priceToY(hvn.priceRange.min) - priceToY(hvn.priceRange.max)}
                fill={hvnColor}
                opacity={0.08}
              />
            )}

            <line
              x1={0}
              y1={y}
              x2={chartWidth}
              y2={y}
              stroke={hvnColor}
              strokeWidth={1.5}
              strokeDasharray="5,2"
              opacity={0.6}
            />
            <text
              x={chartWidth / 2}
              y={y - 5}
              fill={hvnColor}
              fontSize="10"
              fontWeight="600"
              textAnchor="middle"
              opacity={0.8}
            >
              HVN: ${hvn.price.toFixed(2)} {isCluster ? `(${hvn.nodeCount} nodes)` : ''}
            </text>

            {/* Indicator dot */}
            <circle
              cx={5}
              cy={y}
              r={3}
              fill={hvnColor}
              opacity={0.7}
            />
          </g>
        )
      })}

      {/* Low Volume Nodes (LVN) - Potential breakout zones */}
      {showLVN && lowVolumeNodes.slice(0, 5).map((lvn, index) => {
        const y = priceToY(lvn.price)

        return (
          <g key={`lvn-${index}`}>
            <line
              x1={0}
              y1={y}
              x2={chartWidth}
              y2={y}
              stroke={lvnColor}
              strokeWidth={1}
              strokeDasharray="2,4"
              opacity={0.5}
            />
            <text
              x={chartWidth - 5}
              y={y + 12}
              fill={lvnColor}
              fontSize="9"
              fontWeight="500"
              textAnchor="end"
              opacity={0.7}
            >
              LVN: ${lvn.price.toFixed(2)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/**
 * Legend component for Volume Profile Statistical Analysis
 */
export const VolumeProfileStatisticalLegend = ({ volumeStats, className = '' }) => {
  if (!volumeStats || !volumeStats.poc) return null

  const { poc, valueAreaHigh, valueAreaLow, highVolumeNodes, lowVolumeNodes, statistics } = volumeStats

  return (
    <div className={`volume-profile-stats-legend ${className}`} style={{
      backgroundColor: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '8px',
      padding: '12px',
      fontSize: '13px',
      color: '#e2e8f0'
    }}>
      <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: '#f1f5f9' }}>
        Volume Profile Statistics
      </h4>

      {/* POC Info */}
      <div style={{ marginBottom: '8px', borderBottom: '1px solid #334155', paddingBottom: '6px' }}>
        <div style={{ color: '#ff6b6b', fontWeight: '600' }}>
          Point of Control (POC)
        </div>
        <div style={{ marginLeft: '8px', fontSize: '12px' }}>
          Price: ${poc.price.toFixed(2)} ({(poc.volumePercent * 100).toFixed(1)}% of volume)
        </div>
      </div>

      {/* Value Area Info */}
      <div style={{ marginBottom: '8px', borderBottom: '1px solid #334155', paddingBottom: '6px' }}>
        <div style={{ color: '#4dabf7', fontWeight: '600' }}>
          Value Area (70% of volume)
        </div>
        <div style={{ marginLeft: '8px', fontSize: '12px' }}>
          VAH: ${valueAreaHigh.toFixed(2)}<br />
          VAL: ${valueAreaLow.toFixed(2)}<br />
          Width: ${(valueAreaHigh - valueAreaLow).toFixed(2)} ({((valueAreaHigh - valueAreaLow) / poc.price * 100).toFixed(1)}%)
        </div>
      </div>

      {/* HVN Info */}
      {highVolumeNodes.length > 0 && (
        <div style={{ marginBottom: '8px', borderBottom: '1px solid #334155', paddingBottom: '6px' }}>
          <div style={{ color: '#51cf66', fontWeight: '600' }}>
            High Volume Nodes (HVN): {highVolumeNodes.length}
          </div>
          <div style={{ marginLeft: '8px', fontSize: '11px' }}>
            {highVolumeNodes.slice(0, 3).map((hvn, idx) => (
              <div key={idx}>
                ${hvn.price.toFixed(2)} - {(hvn.strength * 100).toFixed(0)}% strength
              </div>
            ))}
            {highVolumeNodes.length > 3 && <div>...and {highVolumeNodes.length - 3} more</div>}
          </div>
        </div>
      )}

      {/* LVN Info */}
      {lowVolumeNodes.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ color: '#ffd43b', fontWeight: '600' }}>
            Low Volume Nodes (LVN): {lowVolumeNodes.length}
          </div>
          <div style={{ marginLeft: '8px', fontSize: '11px' }}>
            Potential breakout zones with thin volume
          </div>
        </div>
      )}

      {/* Summary Statistics */}
      <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8' }}>
        Total Volume: {(volumeStats.totalVolume / 1000000).toFixed(1)}M shares
      </div>
    </div>
  )
}

export default CustomVolumeProfileStatisticalOverlay
