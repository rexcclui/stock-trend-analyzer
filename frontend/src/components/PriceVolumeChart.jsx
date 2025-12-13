import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Customized } from 'recharts'

/**
 * Custom tooltip for the Price-Volume chart
 */
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null

  const data = payload[0].payload
  return (
    <div className="bg-slate-800 border border-slate-600 p-3 rounded-lg shadow-lg">
      <p className="text-slate-200 font-semibold mb-2">{data.date}</p>
      <div className="space-y-1 text-sm">
        <p className="text-slate-300">
          <span className="text-slate-400">Price:</span> ${data.close.toFixed(2)}
        </p>
        <p className="text-slate-300">
          <span className="text-slate-400">Volume:</span> {data.volume.toLocaleString()}
        </p>
        <p className="text-slate-300">
          <span className="text-slate-400">Daily Change:</span>{' '}
          <span className={data.dailyChange >= 0 ? 'text-green-400' : 'text-red-400'}>
            {data.dailyChange >= 0 ? '+' : ''}{data.dailyChange.toFixed(2)}%
          </span>
        </p>
      </div>
    </div>
  )
}

/**
 * Custom Dot component with color based on daily change
 */
const CustomDot = (props) => {
  const { cx, cy, payload } = props
  if (!payload || cx === undefined || cy === undefined) return null

  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={payload.color}
      stroke="#1e293b"
      strokeWidth={1}
      opacity={0.9}
    />
  )
}

/**
 * Interpolate between two colors
 */
const interpolateColor = (color1, color2, factor) => {
  // Extract RGB values from rgb(r, g, b) string
  const extractRGB = (colorStr) => {
    const match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : [0, 0, 0]
  }

  const [r1, g1, b1] = extractRGB(color1)
  const [r2, g2, b2] = extractRGB(color2)

  const r = Math.round(r1 + (r2 - r1) * factor)
  const g = Math.round(g1 + (g2 - g1) * factor)
  const b = Math.round(b1 + (b2 - b1) * factor)

  return `rgb(${r}, ${g}, ${b})`
}

/**
 * Custom gradient line segments with directional arrows
 */
const GradientLineWithArrows = ({ xScale, yScale, data, xKey, yKey }) => {
  if (!data || data.length < 2 || !xScale || !yScale) return null

  // Generate line segments with gradients
  const segments = []
  const arrows = []

  for (let i = 0; i < data.length - 1; i++) {
    const current = data[i]
    const next = data[i + 1]

    const x1 = xScale(current[xKey])
    const y1 = yScale(current[yKey])
    const x2 = xScale(next[xKey])
    const y2 = yScale(next[yKey])

    // Skip if coordinates are invalid
    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) continue

    // Create gradient ID for this segment
    const gradientId = `gradient-${i}`
    const color1 = current.color || '#64748b'
    const color2 = next.color || '#64748b'

    segments.push(
      <g key={`segment-${i}`}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color1} stopOpacity={0.8} />
            <stop offset="100%" stopColor={color2} stopOpacity={0.8} />
          </linearGradient>
        </defs>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={`url(#${gradientId})`}
          strokeWidth={3}
          strokeLinecap="round"
        />
      </g>
    )

    // Add arrow every 3 segments, and always add to first and last segments
    const isFirst = i === 0
    const isLast = i === data.length - 2
    const isRegularInterval = i % 3 === 0

    if (isFirst || isLast || isRegularInterval) {
      const dx = x2 - x1
      const dy = y2 - y1
      const angle = Math.atan2(dy, dx)

      // Position arrow at midpoint
      const midX = (x1 + x2) / 2
      const midY = (y1 + y2) / 2

      // Arrow size - larger for first and last
      const arrowSize = (isFirst || isLast) ? 14 : 10

      // Calculate arrow points forming a triangle
      const arrowPoints = [
        [midX, midY],
        [
          midX - arrowSize * Math.cos(angle - Math.PI / 6),
          midY - arrowSize * Math.sin(angle - Math.PI / 6)
        ],
        [
          midX - arrowSize * Math.cos(angle + Math.PI / 6),
          midY - arrowSize * Math.sin(angle + Math.PI / 6)
        ]
      ]

      const midColor = interpolateColor(color1, color2, 0.5)

      arrows.push(
        <polygon
          key={`arrow-${i}`}
          points={arrowPoints.map(p => p.join(',')).join(' ')}
          fill={midColor}
          stroke="#1e293b"
          strokeWidth={1}
          opacity={1}
        />
      )
    }
  }

  // Add start and end markers for clarity
  const startPoint = data[0]
  const endPoint = data[data.length - 1]

  const startX = xScale(startPoint[xKey])
  const startY = yScale(startPoint[yKey])
  const endX = xScale(endPoint[xKey])
  const endY = yScale(endPoint[yKey])

  return (
    <g>
      {segments}
      {arrows}
      {/* Start marker - circle with "S" */}
      {!isNaN(startX) && !isNaN(startY) && (
        <g>
          <circle cx={startX} cy={startY} r={12} fill="#3b82f6" stroke="#1e293b" strokeWidth={2} opacity={0.9} />
          <text x={startX} y={startY} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="10" fontWeight="bold">
            S
          </text>
        </g>
      )}
      {/* End marker - circle with "E" */}
      {!isNaN(endX) && !isNaN(endY) && (
        <g>
          <circle cx={endX} cy={endY} r={12} fill="#ef4444" stroke="#1e293b" strokeWidth={2} opacity={0.9} />
          <text x={endX} y={endY} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="10" fontWeight="bold">
            E
          </text>
        </g>
      )}
    </g>
  )
}

/**
 * Calculate Simple Moving Average for volume
 * @param {Array} data - Array of data points with volume
 * @param {number} period - SMA period
 * @returns {Array} Array with SMA values
 */
const calculateVolumeSMA = (data, period) => {
  return data.map((point, index) => {
    if (index < period - 1) {
      // For early points, use all available data up to current point
      const slice = data.slice(0, index + 1)
      const sum = slice.reduce((acc, p) => acc + p.volume, 0)
      return sum / slice.length
    } else {
      // Calculate SMA for the period
      const slice = data.slice(index - period + 1, index + 1)
      const sum = slice.reduce((acc, p) => acc + p.volume, 0)
      return sum / period
    }
  })
}

/**
 * Calculate color based on price and volume movement direction and slope magnitude
 * @param {number} priceChange - Change in price (current - previous)
 * @param {number} volumeChange - Change in volume (current - previous)
 * @param {number} maxMagnitude - Maximum magnitude for normalization
 * @returns {string} RGB color string
 */
const getColorFromSlope = (priceChange, volumeChange, maxMagnitude) => {
  // Determine base color based on direction
  let baseColor

  if (priceChange >= 0 && volumeChange >= 0) {
    // Price up, Volume up → Green
    baseColor = [0, 255, 0]
  } else if (priceChange < 0 && volumeChange >= 0) {
    // Price down, Volume up → Red
    baseColor = [255, 0, 0]
  } else if (priceChange >= 0 && volumeChange < 0) {
    // Price up, Volume down → Blue
    baseColor = [0, 0, 255]
  } else {
    // Price down, Volume down → Yellow
    baseColor = [255, 255, 0]
  }

  // Calculate magnitude (slope) for color intensity
  const magnitude = Math.sqrt(priceChange * priceChange + volumeChange * volumeChange)

  // Normalize magnitude to 0-1 range, with minimum intensity of 0.3
  const normalizedMagnitude = maxMagnitude > 0
    ? Math.max(0.3, Math.min(1, magnitude / maxMagnitude))
    : 0.5

  // Apply intensity to base color
  // Light background color when magnitude is low, full color when magnitude is high
  const r = Math.round(255 - (255 - baseColor[0]) * normalizedMagnitude)
  const g = Math.round(255 - (255 - baseColor[1]) * normalizedMagnitude)
  const b = Math.round(255 - (255 - baseColor[2]) * normalizedMagnitude)

  return `rgb(${r}, ${g}, ${b})`
}

/**
 * PriceVolumeChart Component
 * Displays a scatter plot with price on x-axis and volume on y-axis
 * Points are colored based on daily percentage change (red to green)
 */
const PriceVolumeChart = ({ prices, zoomRange }) => {
  // Calculate display data with zoom range applied
  const { displayData, priceRange } = useMemo(() => {
    if (!prices || prices.length === 0) return { displayData: [], priceRange: [0, 100] }

    // Apply zoom range
    const start = zoomRange?.start || 0
    const end = zoomRange?.end || prices.length
    const zoomedPrices = prices.slice(start, end)

    // Calculate SMA3 for volume smoothing
    const volumeSMA3 = calculateVolumeSMA(zoomedPrices, 3)

    // Calculate price and volume changes for each data point
    const dataWithChanges = zoomedPrices.map((price, index) => {
      let dailyChange = 0
      let priceChange = 0
      let volumeChange = 0

      if (index > 0) {
        const prevClose = zoomedPrices[index - 1].close
        const prevVolume = volumeSMA3[index - 1]

        dailyChange = ((price.close - prevClose) / prevClose) * 100
        priceChange = price.close - prevClose
        volumeChange = volumeSMA3[index] - prevVolume
      }

      return {
        date: price.date,
        close: price.close,
        volume: volumeSMA3[index],
        dailyChange,
        priceChange,
        volumeChange,
      }
    })

    // Calculate maximum magnitude for normalization
    const magnitudes = dataWithChanges.map(d =>
      Math.sqrt(d.priceChange * d.priceChange + d.volumeChange * d.volumeChange)
    )
    const maxMagnitude = Math.max(...magnitudes, 1) // Ensure non-zero

    // Calculate price range for X-axis domain
    const closePrices = dataWithChanges.map(d => d.close)
    const minPrice = Math.min(...closePrices)
    const maxPrice = Math.max(...closePrices)
    const priceRange = [minPrice * 0.9, maxPrice * 1.1]

    // Add color to each data point based on price/volume slope
    const finalData = dataWithChanges.map(d => ({
      ...d,
      color: getColorFromSlope(d.priceChange, d.volumeChange, maxMagnitude),
    }))

    return { displayData: finalData, priceRange }
  }, [prices, zoomRange])

  if (!prices || prices.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        No data available
      </div>
    )
  }

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4 text-slate-100">Price-Volume Analysis</h3>
      <ResponsiveContainer width="100%" height={800}>
        <LineChart data={displayData} margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
          <XAxis
            dataKey="close"
            type="number"
            name="Price"
            domain={priceRange}
            stroke="#94a3b8"
            label={{ value: 'Price ($)', position: 'insideBottom', offset: -10, fill: '#94a3b8' }}
            tickFormatter={(value) => `$${value.toFixed(2)}`}
          />
          <YAxis
            dataKey="volume"
            type="number"
            name="Volume (SMA3)"
            stroke="#94a3b8"
            label={{ value: 'Volume (SMA3)', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
            tickFormatter={(value) => {
              if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
              if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
              return value.toString()
            }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          {/* Custom gradient line with arrows */}
          <Customized
            component={({ xAxisMap, yAxisMap, ...props }) => {
              const xScale = xAxisMap?.[0]?.scale
              const yScale = yAxisMap?.[0]?.scale
              return (
                <GradientLineWithArrows
                  xScale={xScale}
                  yScale={yScale}
                  data={displayData}
                  xKey="close"
                  yKey="volume"
                />
              )
            }}
          />
          {/* Dots on top of the line */}
          <Line
            type="monotone"
            dataKey="volume"
            stroke="none"
            strokeWidth={0}
            dot={<CustomDot />}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Direction indicator and color legend */}
      <div className="mt-4 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-sm flex-wrap justify-center">
          <span className="text-slate-400">Direction:</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-600/20 border border-blue-500 rounded">
              <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">S</div>
              <span className="text-slate-300 text-xs">Start</span>
            </div>
            <span className="text-slate-400">→</span>
            <span className="text-slate-400">Arrows</span>
            <span className="text-slate-400">→</span>
            <div className="flex items-center gap-1 px-2 py-1 bg-red-600/20 border border-red-500 rounded">
              <span className="text-slate-300 text-xs">End</span>
              <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold">E</div>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 text-sm">
          <span className="text-slate-400 font-semibold">Color Legend (based on Price & Volume movement):</span>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 rounded">
              <div className="w-6 h-6 rounded" style={{ backgroundColor: 'rgb(0, 255, 0)' }}></div>
              <div className="text-left">
                <div className="text-slate-200 font-medium">Green</div>
                <div className="text-xs text-slate-400">Price ↑ Volume ↑</div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 rounded">
              <div className="w-6 h-6 rounded" style={{ backgroundColor: 'rgb(255, 0, 0)' }}></div>
              <div className="text-left">
                <div className="text-slate-200 font-medium">Red</div>
                <div className="text-xs text-slate-400">Price ↓ Volume ↑</div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 rounded">
              <div className="w-6 h-6 rounded" style={{ backgroundColor: 'rgb(0, 0, 255)' }}></div>
              <div className="text-left">
                <div className="text-slate-200 font-medium">Blue</div>
                <div className="text-xs text-slate-400">Price ↑ Volume ↓</div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 rounded">
              <div className="w-6 h-6 rounded" style={{ backgroundColor: 'rgb(255, 255, 0)' }}></div>
              <div className="text-left">
                <div className="text-slate-200 font-medium">Yellow</div>
                <div className="text-xs text-slate-400">Price ↓ Volume ↓</div>
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-400 text-center">
            Color depth indicates slope magnitude (lighter = smaller change, darker = larger change)
          </div>
        </div>
        <div className="text-xs text-slate-400">
          Volume: 3-period SMA smoothing applied
        </div>
      </div>
    </div>
  )
}

export default PriceVolumeChart
