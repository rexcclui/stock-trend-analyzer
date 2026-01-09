import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LabelList, ReferenceLine } from 'recharts'
import { useState, useEffect } from 'react'

function StatisticsCharts({ stockData, zoomRange }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [activeTab, setActiveTab] = useState('weekday')

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

  // Helper function to calculate percentile
  const calculatePercentile = (values, percentile) => {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.ceil((percentile / 100) * sorted.length) - 1
    return sorted[Math.max(0, index)]
  }

  // Calculate 95th percentile (top 5%) and 5th percentile (bottom 5%)
  const allValidChanges = weekdayData.filter(item => item.percentChange !== 0).map(item => item.percentChange)
  const top5PercentThreshold = calculatePercentile(allValidChanges, 95)
  const bottom5PercentThreshold = calculatePercentile(allValidChanges, 5)

  // Helper function to aggregate statistics with percentile-based counts
  const aggregateStats = (groupedData) => {
    return Object.entries(groupedData).map(([key, items]) => {
      const validChanges = items.filter(item => item.percentChange !== 0)
      const count = validChanges.length
      const avgChange = count > 0 ? validChanges.reduce((sum, item) => sum + item.percentChange, 0) / count : 0

      // Count items in top 5% (>= 95th percentile)
      const maxCount = validChanges.filter(item => item.percentChange >= top5PercentThreshold).length

      // Count items in bottom 5% (<= 5th percentile)
      const minCount = validChanges.filter(item => item.percentChange <= bottom5PercentThreshold).length

      return {
        name: key,
        count,
        avgChange: parseFloat(avgChange.toFixed(2)),
        maxCount,
        minCount
      }
    })
  }

  // Group by weekdays (Mon-Fri only, weekends filtered out)
  const groupByWeekday = () => {
    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    const grouped = {}
    weekdays.forEach(day => grouped[day] = [])

    weekdayData.forEach(item => {
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

    weekdayData.forEach(item => {
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

    weekdayData.forEach(item => {
      const monthName = months[item.date.getMonth()]
      grouped[monthName].push(item)
    })

    return aggregateStats(grouped)
  }

  // Group by years
  const groupByYear = () => {
    const grouped = {}

    weekdayData.forEach(item => {
      const year = item.date.getFullYear().toString()
      if (!grouped[year]) grouped[year] = []
      grouped[year].push(item)
    })

    return aggregateStats(grouped).sort((a, b) => parseInt(a.name) - parseInt(b.name))
  }

  // Group by month's week (Week 1-5)
  const groupByMonthWeek = () => {
    const grouped = { 'Week 1': [], 'Week 2': [], 'Week 3': [], 'Week 4': [], 'Week 5': [] }

    weekdayData.forEach(item => {
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

  // Chart configurations with tabs
  const chartGroups = {
    weekday: { id: 'weekday', title: 'Weekday', data: weekdayStats },
    quarter: { id: 'quarter', title: 'Quarter', data: quarterStats },
    month: { id: 'month', title: 'Month', data: monthStats },
    year: { id: 'year', title: 'Year', data: yearStats },
    monthWeek: { id: 'monthWeek', title: "Month's Week", data: monthWeekStats }
  }

  const tabs = [
    { id: 'weekday', label: 'Weekday' },
    { id: 'quarter', label: 'Quarter' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' },
    { id: 'monthWeek', label: "Month's Week" }
  ]

  const activeGroup = chartGroups[activeTab]

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload
      const metricName = payload[0].dataKey

      return (
        <div className="bg-slate-900 border border-slate-600 p-3 rounded shadow-lg">
          <p className="text-slate-200 font-semibold mb-1">{label}</p>
          <p className="text-sm text-slate-300">
            Total Count: {dataPoint.count}
          </p>
          {payload.map((entry, index) => {
            if (entry.dataKey === 'avgChange') {
              return (
                <p key={index} className="text-sm" style={{ color: entry.color }}>
                  Avg Change: {entry.value}%
                </p>
              )
            } else if (entry.dataKey === 'maxCount') {
              return (
                <p key={index} className="text-sm" style={{ color: entry.color }}>
                  Top 5% Count: {entry.value}
                </p>
              )
            } else if (entry.dataKey === 'minCount') {
              return (
                <p key={index} className="text-sm" style={{ color: entry.color }}>
                  Bottom 5% Count: {entry.value}
                </p>
              )
            } else if (entry.dataKey === 'minCountNegative') {
              return (
                <p key={index} className="text-sm" style={{ color: entry.color }}>
                  Bottom 5% Count: {dataPoint.minCount}
                </p>
              )
            }
            return null
          })}
          {metricName === 'maxCount' && (
            <p className="text-xs text-slate-400 mt-1">
              Threshold: ≥{top5PercentThreshold.toFixed(2)}%
            </p>
          )}
          {(metricName === 'minCount' || metricName === 'minCountNegative') && (
            <p className="text-xs text-slate-400 mt-1">
              Threshold: ≤{bottom5PercentThreshold.toFixed(2)}%
            </p>
          )}
        </div>
      )
    }
    return null
  }

  // Render a single chart
  const renderChart = (title, data, metricKey, yAxisLabel, colors) => {
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
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey={metricKey} radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
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

  // Render combined max/min chart with negative min bars
  const renderCombinedChart = (title, data) => {
    // Transform data to include negative minCount values
    const transformedData = data.map(item => ({
      ...item,
      minCountNegative: -item.minCount
    }))

    return (
      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
        <h5 className="text-sm font-semibold mb-3 text-slate-200 text-center">{title}</h5>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart
            data={transformedData}
            margin={{ top: 5, right: 10, left: isMobile ? -10 : 10, bottom: 5 }}
            barSize={40}
            barGap={-40}
            barCategoryGap="20%"
          >
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
              label={{ value: 'Count', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: isMobile ? 9 : 11 }}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={2} />
            {/* Max bars (positive, orange/gold) */}
            <Bar dataKey="maxCount" radius={[4, 4, 0, 0]} fill="#f59e0b">
              <LabelList
                dataKey="maxCount"
                position="inside"
                style={{ fill: '#ffffff', fontSize: isMobile ? 10 : 12, fontWeight: 'bold' }}
              />
            </Bar>
            {/* Min bars (negative, red) */}
            <Bar dataKey="minCountNegative" radius={[0, 0, 4, 4]} fill="#ef4444">
              <LabelList
                dataKey="minCount"
                position="inside"
                style={{ fill: '#ffffff', fontSize: isMobile ? 10 : 12, fontWeight: 'bold' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // Color schemes for different metrics
  const avgColors = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#6366f1', '#8b5cf6']
  const maxColors = ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fef3c7', '#fb923c', '#fdba74']
  const minColors = ['#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2', '#fb7185', '#fda4af']

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-purple-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Charts - 2 per row with count labels */}
      <div>
        <h4 className="text-lg font-semibold mb-4 text-slate-100">Group by {activeGroup.title}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderChart(`Avg % Change`, activeGroup.data, 'avgChange', '%', avgColors)}
          {renderCombinedChart(`Max/Min Count (Top 5%: ≥${top5PercentThreshold.toFixed(2)}% | Bottom 5%: ≤${bottom5PercentThreshold.toFixed(2)}%)`, activeGroup.data)}
        </div>
      </div>
    </div>
  )
}

export default StatisticsCharts
