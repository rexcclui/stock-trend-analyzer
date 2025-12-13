import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

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
 * Calculate color based on daily percentage change
 * Maps from red (negative) to green (positive)
 * @param {number} percentChange - Daily percentage change
 * @param {number} minChange - Minimum change in dataset
 * @param {number} maxChange - Maximum change in dataset
 * @returns {string} RGB color string
 */
const getColorFromPercentChange = (percentChange, minChange, maxChange) => {
  // Normalize the percent change to 0-1 range
  const range = maxChange - minChange
  const normalized = range > 0 ? (percentChange - minChange) / range : 0.5

  // Map to color: 0 (red) -> 0.5 (yellow) -> 1 (green)
  let r, g, b

  if (normalized < 0.5) {
    // Red to yellow
    const t = normalized * 2
    r = 255
    g = Math.round(255 * t)
    b = 0
  } else {
    // Yellow to green
    const t = (normalized - 0.5) * 2
    r = Math.round(255 * (1 - t))
    g = 255
    b = 0
  }

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

    // Calculate daily percentage change for each data point
    const dataWithChange = zoomedPrices.map((price, index) => {
      let dailyChange = 0
      if (index > 0) {
        const prevClose = zoomedPrices[index - 1].close
        dailyChange = ((price.close - prevClose) / prevClose) * 100
      }

      return {
        date: price.date,
        close: price.close,
        volume: price.volume,
        dailyChange,
      }
    })

    // Calculate min and max daily change for color mapping
    const changes = dataWithChange.map(d => d.dailyChange)
    const minChange = Math.min(...changes)
    const maxChange = Math.max(...changes)

    // Calculate price range for X-axis domain
    const closePrices = dataWithChange.map(d => d.close)
    const minPrice = Math.min(...closePrices)
    const maxPrice = Math.max(...closePrices)
    const priceRange = [minPrice * 0.9, maxPrice * 1.1]

    // Add color to each data point
    const finalData = dataWithChange.map(d => ({
      ...d,
      color: getColorFromPercentChange(d.dailyChange, minChange, maxChange),
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
      <ResponsiveContainer width="100%" height={400}>
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
            name="Volume"
            stroke="#94a3b8"
            label={{ value: 'Volume', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
            tickFormatter={(value) => {
              if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
              if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
              return value.toString()
            }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Line
            type="monotone"
            dataKey="volume"
            stroke="#64748b"
            strokeWidth={2}
            dot={<CustomDot />}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Direction indicator and color legend */}
      <div className="mt-4 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">Direction:</span>
          <div className="flex items-center gap-1 px-3 py-1 bg-slate-700 rounded">
            <span className="text-slate-300">Old Date</span>
            <span className="text-slate-400 mx-2">→</span>
            <span className="text-slate-300">Latest Date</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">Daily Change:</span>
          <div className="flex items-center gap-1">
            <span className="text-red-500 font-semibold">Very Red</span>
            <div className="w-32 h-3 rounded" style={{
              background: 'linear-gradient(to right, rgb(255,0,0), rgb(255,255,0), rgb(0,255,0))'
            }}></div>
            <span className="text-green-500 font-semibold">Very Green</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PriceVolumeChart
