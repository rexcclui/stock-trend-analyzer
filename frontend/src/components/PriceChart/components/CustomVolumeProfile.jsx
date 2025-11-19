import React from 'react'

/**
 * Custom volume profile component
 * Displays volume distribution across price levels
 * @param {Object} props - Recharts custom component props
 * @param {boolean} volumeProfileEnabled - Whether volume profile is enabled
 * @param {Array} volumeProfiles - Volume profile data
 * @param {string} volumeProfileMode - Mode ('auto' or 'manual')
 * @param {Array} displayPrices - Price data for slope calculation
 * @param {Function} onVolumeProfileRangeRemove - Callback to remove a profile
 */
export const CustomVolumeProfile = (props) => {
  const {
    volumeProfileEnabled,
    volumeProfiles,
    volumeProfileMode,
    displayPrices,
    onVolumeProfileRangeRemove
  } = props

  if (!volumeProfileEnabled || volumeProfiles.length === 0) return null

  const { xAxisMap, yAxisMap, offset } = props
  const xAxis = xAxisMap?.[0]
  const yAxis = yAxisMap?.[0]

  if (!xAxis || !yAxis) {
    return null
  }

  return (
    <g>
      {volumeProfiles.map((volumeProfile, profileIndex) => {
        // Determine bar x position and width based on mode
        let barX = offset.left
        let barWidth = offset.width

        // In manual mode, only span the selected date range
        if (volumeProfileMode === 'manual' && volumeProfile.dateRange) {
          const { startDate, endDate } = volumeProfile.dateRange
          const startX = xAxis.scale(startDate)
          const endX = xAxis.scale(endDate)

          if (startX !== undefined && endX !== undefined) {
            barX = Math.min(startX, endX)
            barWidth = Math.abs(endX - startX)
          }
        }

        // Determine if price is upward slope (for X button positioning)
        let isUpwardSlope = false
        if (volumeProfileMode === 'manual' && volumeProfile.dateRange) {
          const { startDate, endDate } = volumeProfile.dateRange
          const startPrice = displayPrices.find(p => p.date === startDate)
          const endPrice = displayPrices.find(p => p.date === endDate)
          if (startPrice && endPrice) {
            isUpwardSlope = endPrice.close > startPrice.close
          }
        }

        // Position X button at bottom-right for upward slope, top-right for downward
        const topZone = volumeProfile.zones[volumeProfile.zones.length - 1]
        const bottomZone = volumeProfile.zones[0]
        const xButtonY = isUpwardSlope
          ? (bottomZone ? yAxis.scale(bottomZone.minPrice) - 10 : offset.top + offset.height - 10)
          : (topZone ? yAxis.scale(topZone.maxPrice) + 10 : offset.top + 10)

        return (
          <g key={`volume-profile-${profileIndex}`}>
            {volumeProfile.zones.map((zone, i) => {
              // Calculate y positions based on price range
              const yTop = yAxis.scale(zone.maxPrice)
              const yBottom = yAxis.scale(zone.minPrice)
              const height = Math.abs(yBottom - yTop)

              // Calculate color depth based on volume weight
              const volumeWeight = zone.volume / volumeProfile.maxVolume

              // Use blue/cyan hue with varying lightness
              const hue = 200
              const saturation = 75
              const lightness = 75 - (volumeWeight * 45)

              // Opacity based on volume weight
              const opacity = 0.3 + (volumeWeight * 0.5)

              return (
                <g key={`volume-profile-${profileIndex}-zone-${i}`}>
                  {/* Horizontal bar spanning selected range or full chart */}
                  <rect
                    x={barX}
                    y={yTop}
                    width={barWidth}
                    height={height}
                    fill={`hsl(${hue}, ${saturation}%, ${lightness}%)`}
                    stroke="rgba(59, 130, 246, 0.4)"
                    strokeWidth={0.5}
                    opacity={opacity}
                  />

                  {/* Volume percentage label */}
                  <text
                    x={barX + barWidth / 2}
                    y={yTop + height / 2}
                    fill={volumeWeight > 0.7
                      ? `hsl(45, 100%, ${85 - (volumeWeight * 25)}%)`
                      : volumeWeight > 0.4
                      ? `hsl(0, 0%, ${95 - (volumeWeight * 20)}%)`
                      : `hsl(200, 30%, ${70 + (volumeWeight * 20)}%)`
                    }
                    fontSize="11"
                    fontWeight="700"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    opacity={0.95}
                    style={{
                      textShadow: '0 0 3px rgba(0,0,0,0.8), 0 0 5px rgba(0,0,0,0.5)'
                    }}
                  >
                    {zone.volumePercent.toFixed(1)}%
                  </text>
                </g>
              )
            })}

            {/* X button to remove this volume profile (only in manual mode) */}
            {volumeProfileMode === 'manual' && onVolumeProfileRangeRemove && (
              <g
                style={{ cursor: 'pointer', pointerEvents: 'all' }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  onVolumeProfileRangeRemove(profileIndex)
                }}
              >
                {/* Transparent clickable area */}
                <circle
                  cx={barX + barWidth - 10}
                  cy={xButtonY}
                  r="10"
                  fill="transparent"
                  stroke="none"
                />
                {/* X icon with shadow for visibility */}
                <text
                  x={barX + barWidth - 10}
                  y={xButtonY}
                  fill="#ef4444"
                  fontSize="16"
                  fontWeight="900"
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    filter: 'drop-shadow(0px 0px 2px rgba(0,0,0,0.8))',
                    pointerEvents: 'none'
                  }}
                >
                  ×
                </text>
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}
