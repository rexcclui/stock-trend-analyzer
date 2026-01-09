import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'
import { useState, useEffect } from 'react'

function StatisticsCharts({ stockData, zoomRange }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [filterThreshold, setFilterThreshold] = useState(0)

  // Track window resize for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Safety check: return early if no data
  if (!stockData || !Array.isArray(stockData) || stockData.length === 0) {
    return (
      <div className="text-center text-slate-400 py-8">
        No data available for statistics
      </div>
    )
  }

  // Prepare data: reverse to chronological order and apply zoom range
  const chartData = stockData.slice().reverse()
  const endIndex = zoomRange.end === null ? chartData.length : zoomRange.end
  const visibleData = chartData.slice(zoomRange.start, endIndex)

  // Calculate daily % change for each data point
  const dataWithChanges = visibleData.map((day, index, array) => {
    let percentChange = 0
    if (index > 0 && array[index - 1].close !== 0) {
      percentChange = ((day.close - array[index - 1].close) / array[index - 1].close) * 100
    }

    return {
      ...day,
      percentChange,
      date: new Date(day.date)
    }
  })

  // Filter out weekends (Saturday = 6, Sunday = 0)
  const weekdayData = dataWithChanges.filter(item => {
    const dayOfWeek = item.date.getDay()
    return dayOfWeek !== 0 && dayOfWeek !== 6
  })

  // Apply threshold filter - only include data where absolute % change > threshold
  const filteredData = weekdayData.filter(item => {
    return Math.abs(item.percentChange) > filterThreshold
  })

  // Helper function to aggregate statistics
  const aggregateStats = (groupedData) => {
    return Object.entries(groupedData).map(([key, items]) => {
      const validChanges = items.filter(item => item.percentChange !== 0)
      const count = validChanges.length
      const avgChange = count > 0 ? validChanges.reduce((sum, item) => sum + item.percentChange, 0) / count : 0

      return {
        name: key,
        count,
        avgChange: parseFloat(avgChange.toFixed(2))
      }
    })
  }

  // Group by weekdays (Mon-Fri only, weekends filtered out)
  const groupByWeekday = () => {
    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    const grouped = {}
    weekdays.forEach(day => grouped[day] = [])

    filteredData.forEach(item => {
      const dayOfWeek = item.date.getDay()
      // Map day number to weekday name (1=Monday, 2=Tuesday, etc.)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const dayName = weekdays[dayOfWeek - 1]
        grouped[dayName].push(item)
      }
    })

    return aggregateStats(grouped)
  }

  // Group by quarters (Q1-Q4)
  const groupByQuarter = () => {
    const grouped = { 'Q1': [], 'Q2': [], 'Q3': [], 'Q4': [] }

    filteredData.forEach(item => {
      const month = item.date.getMonth()
      const quarter = `Q${Math.floor(month / 3) + 1}`
      grouped[quarter].push(item)
    })

    return aggregateStats(grouped)
  }

  // Group by month (Jan-Dec)
  const groupByMonth = () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const grouped = {}
    months.forEach(month => grouped[month] = [])

    filteredData.forEach(item => {
      const monthName = months[item.date.getMonth()]
      grouped[monthName].push(item)
    })

    return aggregateStats(grouped)
  }

  // Group by years
  const groupByYear = () => {
    const grouped = {}

    filteredData.forEach(item => {
      const year = item.date.getFullYear().toString()
      if (!grouped[year]) grouped[year] = []
      grouped[year].push(item)
    })

    return aggregateStats(grouped).sort((a, b) => parseInt(a.name) - parseInt(b.name))
  }

  // Group by month's week (Week 1-5)
  const groupByMonthWeek = () => {
    const grouped = { 'Week 1': [], 'Week 2': [], 'Week 3': [], 'Week 4': [], 'Week 5': [] }

    filteredData.forEach(item => {
      const dayOfMonth = item.date.getDate()
      const weekNum = Math.ceil(dayOfMonth / 7)
      const weekKey = `Week ${weekNum}`
      if (grouped[weekKey]) {
        grouped[weekKey].push(item)
      }
    })

    return aggregateStats(grouped)
  }

  // Prepare all statistics
  const weekdayStats = groupByWeekday()
  const quarterStats = groupByQuarter()
  const monthStats = groupByMonth()
  const yearStats = groupByYear()
  const monthWeekStats = groupByMonthWeek()

  // Calculate global min/max for y-axis alignment across all charts
  const allStats = [...weekdayStats, ...quarterStats, ...monthStats, ...yearStats, ...monthWeekStats]
  const allAvgChanges = allStats.map(stat => stat.avgChange)
  const globalMin = Math.min(...allAvgChanges)
  const globalMax = Math.max(...allAvgChanges)
  // Add 10% padding: max * 1.1, min * 1.1 (if negative, becomes more negative for padding)
  const yAxisMax = globalMax * 1.1
  const yAxisMin = globalMin < 0 ? globalMin * 1.1 : globalMin * -1.1
  const yAxisDomain = [yAxisMin, yAxisMax]

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload

      return (
        <div className="bg-slate-900 border border-slate-600 p-3 rounded shadow-lg">
          <p className="text-slate-200 font-semibold mb-1">{label}</p>
          <p className="text-sm text-slate-300">
            Total Count: {dataPoint.count}
          </p>
          <p className="text-sm" style={{ color: payload[0].color }}>
            Avg Change: {payload[0].value}%
          </p>
        </div>
      )
    }
    return null
  }

  // Function to get color based on value (deeper color for higher values)
  const getColorForValue = (value, minValue, maxValue) => {
    // Handle edge cases
    if (maxValue === minValue) return '#10b981' // Default green

    // Normalize value to 0-1 range
    const normalized = (value - minValue) / (maxValue - minValue)

    // Green color scale: lighter green for lower values, deeper green for higher values
    // HSL format: hue=160 (green), saturation increases with value, lightness decreases with value
    const hue = 160
    const saturation = 50 + (normalized * 30) // 50% to 80%
    const lightness = 70 - (normalized * 40)  // 70% to 30%

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`
  }

  // Render a single chart
  const renderChart = (title, data, metricKey, yAxisLabel, colors, domain) => {
    // Get min and max count values from data for color scaling
    const countValues = data.map(item => item.count)
    const minCount = Math.min(...countValues)
    const maxCount = Math.max(...countValues)

    return (
      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
        <h5 className="text-sm font-semibold mb-3 text-slate-200 text-center">{title}</h5>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: isMobile ? -10 : 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: isMobile ? 9 : 11, fill: '#94a3b8' }}
              angle={isMobile ? -45 : 0}
              textAnchor={isMobile ? 'end' : 'middle'}
              height={isMobile ? 60 : 30}
              stroke="#475569"
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: isMobile ? 9 : 11 }}
              stroke="#475569"
              width={isMobile ? 35 : 50}
              label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: isMobile ? 9 : 11 }}
              domain={domain}
              tickFormatter={(value) => value.toFixed(1)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey={metricKey} radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getColorForValue(entry.count, minCount, maxCount)}
                />
              ))}
              <LabelList
                dataKey="count"
                position="inside"
                style={{ fill: '#ffffff', fontSize: isMobile ? 10 : 12, fontWeight: 'bold' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filter Control */}
      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <label className="text-slate-200 font-medium whitespace-nowrap">
            Filter by Absolute Daily Change:
          </label>
          <div className="flex items-center gap-4 flex-1">
            <input
              type="range"
              min="0"
              max="20"
              step="0.5"
              value={filterThreshold}
              onChange={(e) => setFilterThreshold(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <span className="text-slate-200 font-semibold min-w-[80px] text-right">
              &gt; {filterThreshold.toFixed(1)}%
            </span>
          </div>
        </div>
        <p className="text-sm text-slate-400 mt-2">
          Only include days where absolute % change exceeds the threshold. Total filtered data: {filteredData.length} days
        </p>
      </div>

      {/* All Average Charts in Single Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 overflow-x-auto">
        {renderChart('Weekday Avg % Change', weekdayStats, 'avgChange', '%', null, yAxisDomain)}
        {renderChart('Quarter Avg % Change', quarterStats, 'avgChange', '%', null, yAxisDomain)}
        {renderChart('Month Avg % Change', monthStats, 'avgChange', '%', null, yAxisDomain)}
        {renderChart('Year Avg % Change', yearStats, 'avgChange', '%', null, yAxisDomain)}
        {renderChart("Month's Week Avg % Change", monthWeekStats, 'avgChange', '%', null, yAxisDomain)}
      </div>
    </div>
  )
}

export default StatisticsCharts
