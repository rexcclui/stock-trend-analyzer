import React from 'react'

/**
 * Custom Volume Breakthrough Markers Component
 * Displays volume breakthrough signals and volume zones on price chart
 */
export const CustomVolumeBreakthroughMarkers = (props) => {
  const {
    signals,  // Trading signals (including volume breakthroughs)
    volumeProfile,  // Volume profile data
    displayPrices
  } = props

  const { xAxisMap, yAxisMap, offset } = props
  const xAxis = xAxisMap?.[0]
  const yAxis = yAxisMap?.[0]

  if (!xAxis || !yAxis) {
    return null
  }

  const hasVolumeProfile = volumeProfile && volumeProfile.slots && volumeProfile.slots.length > 0

  return (
    <g>
      {/* Draw volume zones (colored background) */}
      {hasVolumeProfile && volumeProfile.slots.map((slot, index) => {
        const yTop = yAxis.scale(slot.end)
        const yBottom = yAxis.scale(slot.start)
        const height = Math.abs(yBottom - yTop)

        // Skip if height is invalid
        if (!isFinite(height) || height <= 0) return null

        // Color based on volume weight
        const isThin = slot.weight < 6
        const isThick = slot.weight > 15
        const isCurrent = index === volumeProfile.currentSlotIndex

        let fill = 'rgba(100, 116, 139, 0.05)'  // Default slate
        if (isCurrent && isThin) {
          fill = 'rgba(34, 197, 94, 0.15)'  // Green for current thin zone
        } else if (isThin) {
          fill = 'rgba(59, 130, 246, 0.1)'  // Blue for thin zones
        } else if (isThick) {
          fill = 'rgba(239, 68, 68, 0.1)'  // Red for thick zones
        }

        return (
          <rect
            key={`zone-${index}`}
            x={offset.left}
            y={yTop}
            width={offset.width}
            height={height}
            fill={fill}
            stroke="none"
            pointerEvents="none"
          />
        )
      })}

      {/* Draw breakthrough markers */}
      {signals && signals
        .filter(s => s.reason && s.reason.includes('Volume Breakthrough'))
        .map((signal, index) => {
          const x = xAxis.scale(signal.date)
          const y = yAxis.scale(signal.price)

          if (x === undefined || y === undefined || !isFinite(x) || !isFinite(y)) {
            return null
          }

          const isUpBreakthrough = signal.type === 'BUY'
          const isPotential = signal.reason && signal.reason.includes('POTENTIAL BREAK')

          // Determine colors
          const markerColor = isPotential ? '#a855f7' : (isUpBreakthrough ? '#22c55e' : '#ef4444')
          const lineOpacity = isPotential ? 0.7 : 0.5

          return (
            <g key={`breakthrough-${index}`}>
              {/* Vertical line */}
              <line
                x1={x}
                y1={offset.top}
                x2={x}
                y2={offset.top + offset.height}
                stroke={markerColor}
                strokeWidth={isPotential ? 2 : 1}
                strokeDasharray={isPotential ? '4 2' : 'none'}
                opacity={lineOpacity}
              />

              {/* Marker circle */}
              <circle
                cx={x}
                cy={y}
                r={isPotential ? 8 : 6}
                fill={markerColor}
                stroke="#fff"
                strokeWidth={2}
                opacity={0.9}
              />

              {/* Lightning bolt for potential breaks */}
              {isPotential && (
                <text
                  x={x}
                  y={y - 15}
                  fontSize="16"
                  textAnchor="middle"
                  fill={markerColor}
                  fontWeight="bold"
                  style={{
                    filter: 'drop-shadow(0px 0px 3px rgba(168, 85, 247, 0.8))'
                  }}
                >
                  ⚡
                </text>
              )}

              {/* Label */}
              <text
                x={x}
                y={y + (isPotential ? 25 : 20)}
                fontSize="10"
                textAnchor="middle"
                fill={markerColor}
                fontWeight="600"
                style={{
                  textShadow: '0 0 3px rgba(0,0,0,0.8)'
                }}
              >
                {signal.type}
              </text>
            </g>
          )
        })
      }
    </g>
  )
}
