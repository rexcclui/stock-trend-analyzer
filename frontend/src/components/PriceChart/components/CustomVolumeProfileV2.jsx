import React from 'react'

/**
 * Custom component to render Volume Profile V2 - 100 date slots with volume distribution
 * Displays volume heatmap with color gradient (red = low, blue = high)
 * Includes buy/sell signal arrows and P&L statistics
 *
 * @param {Object} props - Component props
 * @param {boolean} props.volumeProfileV2Enabled - Whether volume profile V2 is enabled
 * @param {Array} props.volumeProfileV2Data - Volume profile data with date slots and price zones
 * @param {Array} props.displayPrices - Price data for display
 * @param {Object} props.zoomRange - Current zoom range {start, end}
 * @param {Object} props.volV2HoveredBar - Currently hovered bar state
 * @param {Function} props.setVolV2HoveredBar - Setter for hovered bar state
 * @param {Array} props.volumeProfileV2Breakouts - Breakout signals array
 * @param {Object} props.breakoutPL - P&L statistics for breakout strategy
 * @param {Object} props.xAxisMap - X-axis mapping from recharts
 * @param {Object} props.yAxisMap - Y-axis mapping from recharts
 * @param {Object} props.offset - Chart offset dimensions from recharts
 */
export const CustomVolumeProfileV2 = ({
  volumeProfileV2Enabled,
  volumeProfileV2Data,
  displayPrices,
  zoomRange,
  volV2HoveredBar,
  setVolV2HoveredBar,
  volumeProfileV2Breakouts,
  breakoutPL,
  xAxisMap,
  yAxisMap,
  offset
}) => {
  if (!volumeProfileV2Enabled || volumeProfileV2Data.length === 0) return null

  const xAxis = xAxisMap?.[0]
  const yAxis = yAxisMap?.[0]

  if (!xAxis || !yAxis) {
    return null
  }

  // Get visible data to create clip path excluding price line area
  const reversedDisplayPrices = [...displayPrices].reverse()
  const visibleData = reversedDisplayPrices.slice(zoomRange.start, zoomRange.end === null ? reversedDisplayPrices.length : zoomRange.end)

  // Create path for price line to use as clip exclusion
  const priceLinePath = visibleData.map((price, idx) => {
    const x = xAxis.scale(price.date)
    const y = yAxis.scale(price.close)
    return idx === 0 ? `M ${x},${y}` : `L ${x},${y}`
  }).join(' ')

  return (
    <g>
      <defs>
        {/* Define a clip path that excludes a buffer around the price line */}
        <clipPath id="volPrfV2-clip">
          <rect x={offset.left} y={offset.top} width={offset.width} height={offset.height} />
        </clipPath>

        {/* Mask that creates a buffer zone around the price line */}
        <mask id="volPrfV2-mask">
          {/* White rectangle = visible */}
          <rect x={offset.left} y={offset.top} width={offset.width} height={offset.height} fill="white" />
          {/* Black stroke along price line = hidden (4px buffer) */}
          <path d={priceLinePath} stroke="black" strokeWidth="4" fill="none" />
        </mask>
      </defs>

      <g clipPath="url(#volPrfV2-clip)" mask="url(#volPrfV2-mask)">
        {volumeProfileV2Data.map((slot, slotIdx) => {
          if (!slot) return null

          // Get X positions for this date slot
          const startX = xAxis.scale(slot.startDate)
          let endX = xAxis.scale(slot.endDate)

          if (startX === undefined || endX === undefined) return null

          // Make bars touch by extending to the next bar's start position
          // This eliminates gaps between bars
          if (slotIdx < volumeProfileV2Data.length - 1) {
            const nextSlot = volumeProfileV2Data[slotIdx + 1]
            if (nextSlot) {
              const nextStartX = xAxis.scale(nextSlot.startDate)
              if (nextStartX !== undefined) {
                endX = nextStartX
              }
            }
          }

          // Calculate the width of this vertical strip
          const slotX = startX
          const slotWidth = Math.abs(endX - startX)

          return (
            <g key={`volume-profile-v2-slot-${slotIdx}`}>
              {slot.priceZones.map((zone, zoneIdx) => {
                // Skip zones with no volume
                if (zone.volumeWeight === 0) return null

                // Calculate y positions based on price range
                const yTop = yAxis.scale(zone.maxPrice)
                const yBottom = yAxis.scale(zone.minPrice)
                const height = Math.abs(yBottom - yTop)

                // Normalize weight to reach max color at 35% (0.35)
                // This makes the gradient much more rapid
                const normalizedWeight = Math.min(1, zone.volumeWeight / 0.35)

                // Map volume weight to Hue: 0 (Red) -> 240 (Blue)
                // Using a non-linear power curve to push colors towards blue faster if desired,
                // but linear is usually best for a 2-color gradient.
                // Let's use a slight curve to get past the "muddy" middle colors quickly if needed,
                // but standard HSL interpolation works well.
                const hue = Math.floor(normalizedWeight * 240) // 0 (Red) -> 240 (Blue)

                // Saturation: Keep high for vivid colors
                const saturation = 90 + (normalizedWeight * 10) // 90% -> 100%

                // Lightness: Red is usually brighter (50-60%), Dark Blue is darker (30-40%)
                // We want "Dark Blue" at top, so lightness should decrease as volume increases
                const lightness = 60 - (normalizedWeight * 30) // 60% (Red) -> 30% (Dark Blue)

                // Opacity: Keep it somewhat transparent at low end, solid at high end
                // Using the "rapid" curve from before but slightly relaxed since color helps distinguish now
                const opacity = 0.2 + (Math.pow(normalizedWeight, 0.5) * 0.75) // 0.2 -> 0.95

                const isHovered = volV2HoveredBar?.slotIdx === slotIdx && volV2HoveredBar?.zoneIdx === zoneIdx

                return (
                  <rect
                    key={`volume-profile-v2-slot-${slotIdx}-zone-${zoneIdx}`}
                    x={slotX}
                    y={yTop}
                    width={slotWidth}
                    height={height}
                    fill={`hsl(${hue}, ${saturation}%, ${lightness}%)`}
                    stroke={isHovered ? '#06b6d4' : 'none'}
                    strokeWidth={isHovered ? 2 : 0}
                    opacity={isHovered ? Math.min(opacity + 0.2, 1) : opacity}
                    style={{ pointerEvents: 'all', cursor: 'crosshair' }}
                    onMouseEnter={() => {
                      setVolV2HoveredBar({
                        slotIdx,
                        zoneIdx,
                        volumeWeight: zone.volumeWeight,
                        minPrice: zone.minPrice,
                        maxPrice: zone.maxPrice,
                        x: slotX + slotWidth / 2,
                        y: yTop + height / 2
                      })
                    }}
                    onMouseLeave={() => {
                      setVolV2HoveredBar(null)
                    }}
                  />
                )
              })}
            </g>
          )
        })}
      </g>

      {/* Tooltip for hovered bar */}
      {volV2HoveredBar && (
        <g>
          {(() => {
            const chartRightEdge = offset.left + offset.width
            const tooltipWidthEstimate = 170
            const prefersLeftSide = volV2HoveredBar.x + tooltipWidthEstimate > chartRightEdge

            const tooltipX = prefersLeftSide
              ? Math.max(offset.left + 8, volV2HoveredBar.x - 15)
              : volV2HoveredBar.x + 15
            const textAnchor = prefersLeftSide ? 'end' : 'start'

            return (
              <>
                <text
                  x={tooltipX}
                  y={volV2HoveredBar.y - 30}
                  fill="#06b6d4"
                  fontSize="12"
                  fontWeight="700"
                  textAnchor={textAnchor}
                  style={{ pointerEvents: 'none' }}
                >
                  Vol % {(volV2HoveredBar.volumeWeight * 100).toFixed(1)}%
                </text>
                <text
                  x={tooltipX}
                  y={volV2HoveredBar.y - 15}
                  fill="#cbd5e1"
                  fontSize="11"
                  textAnchor={textAnchor}
                  style={{ pointerEvents: 'none' }}
                >
                  Px: ${volV2HoveredBar.minPrice.toFixed(2)} - ${volV2HoveredBar.maxPrice.toFixed(2)}
                </text>
              </>
            )
          })()}
        </g>
      )}

      {/* Buy signals - blue right arrows for up breakouts */}
      {volumeProfileV2Breakouts.map((breakout, idx) => {
        const x = xAxis.scale(breakout.date)
        const y = yAxis.scale(breakout.price)

        if (x === undefined || y === undefined) return null

        return (
          <g key={`buy-arrow-${idx}`} transform={`translate(${x}, ${y})`}>
            <path
              d="M -6,-4 L 2,0 L -6,4 Z"
              fill="#3b82f6"
              stroke="white"
              strokeWidth={1}
              opacity={0.9}
              style={{ pointerEvents: 'none' }}
            />
          </g>
        )
      })}

      {/* Sell signals - red left arrows for SMA5 slope down */}
      {breakoutPL.sellSignals && breakoutPL.sellSignals.map((signal, idx) => {
        const x = xAxis.scale(signal.date)
        const y = yAxis.scale(signal.price)

        if (x === undefined || y === undefined) return null

        return (
          <g key={`sell-arrow-${idx}`} transform={`translate(${x}, ${y})`}>
            <path
              d="M 6,-4 L -2,0 L 6,4 Z"
              fill="#ef4444"
              stroke="white"
              strokeWidth={1}
              opacity={0.9}
              style={{ pointerEvents: 'none' }}
            />
          </g>
        )
      })}

      {/* P&L Stats Display - show when volume profile v2 is enabled and there are breakouts */}
      {volumeProfileV2Enabled && breakoutPL.trades.length > 0 && (
        <g>
          <text
            x={offset.left + 10}
            y={offset.top + 20}
            fill={breakoutPL.totalPL >= 0 ? '#22c55e' : '#ef4444'}
            fontSize="14"
            fontWeight="700"
            textAnchor="start"
            style={{ pointerEvents: 'none' }}
          >
            P&L: {breakoutPL.totalPL >= 0 ? '+' : ''}{breakoutPL.totalPL.toFixed(2)}%
          </text>
          <text
            x={offset.left + 10}
            y={offset.top + 38}
            fill="#94a3b8"
            fontSize="11"
            textAnchor="start"
            style={{ pointerEvents: 'none' }}
          >
            Market: {breakoutPL.marketChange >= 0 ? '+' : ''}{breakoutPL.marketChange.toFixed(2)}% | α: {((breakoutPL.totalPL - breakoutPL.marketChange) >= 0 ? '+' : '')}{(breakoutPL.totalPL - breakoutPL.marketChange).toFixed(2)}%
          </text>
          <text
            x={offset.left + 10}
            y={offset.top + 54}
            fill="#94a3b8"
            fontSize="10"
            textAnchor="start"
            style={{ pointerEvents: 'none' }}
          >
            Trades: {breakoutPL.closedTradeCount} | Win: {breakoutPL.winRate.toFixed(1)}%
          </text>
        </g>
      )}
    </g>
  )
}
