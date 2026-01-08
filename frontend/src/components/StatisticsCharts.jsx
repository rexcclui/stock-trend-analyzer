import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { useState, useEffect } from 'react'

function StatisticsCharts({ stockData, zoomRange }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

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

  // Helper function to aggregate statistics
  const aggregateStats = (groupedData) => {
    return Object.entries(groupedData).map(([key, items]) => {
      const validChanges = items.filter(item => item.percentChange !== 0)
      const count = validChanges.length
      const avgChange = count > 0 ? validChanges.reduce((sum, item) => sum + item.percentChange, 0) / count : 0
      const maxChange = count > 0 ? Math.max(...validChanges.map(item => item.percentChange)) : 0
      const minChange = count > 0 ? Math.min(...validChanges.map(item => item.percentChange)) : 0

      return {
        name: key,
        count,
        avgChange: parseFloat(avgChange.toFixed(2)),
        maxChange: parseFloat(maxChange.toFixed(2)),
        minChange: parseFloat(minChange.toFixed(2))
      }
    })
  }

  // Group by weekdays (Mon-Sun)
  const groupByWeekday = () => {
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const grouped = {}
    weekdays.forEach(day => grouped[day] = [])

    dataWithChanges.forEach(item => {
      const dayName = weekdays[item.date.getDay()]
      grouped[dayName].push(item)
    })

    return aggregateStats(grouped)
  }

  // Group by quarters (Q1-Q4)
  const groupByQuarter = () => {
    const grouped = { 'Q1': [], 'Q2': [], 'Q3': [], 'Q4': [] }

    dataWithChanges.forEach(item => {
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

    dataWithChanges.forEach(item => {
      const monthName = months[item.date.getMonth()]
      grouped[monthName].push(item)
    })

    return aggregateStats(grouped)
  }

  // Group by years
  const groupByYear = () => {
    const grouped = {}

    dataWithChanges.forEach(item => {
      const year = item.date.getFullYear().toString()
      if (!grouped[year]) grouped[year] = []
      grouped[year].push(item)
    })

    return aggregateStats(grouped).sort((a, b) => parseInt(a.name) - parseInt(b.name))
  }

  // Group by month's week (Week 1-5)
  const groupByMonthWeek = () => {
    const grouped = { 'Week 1': [], 'Week 2': [], 'Week 3': [], 'Week 4': [], 'Week 5': [] }

    dataWithChanges.forEach(item => {
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

  // Chart configurations
  const chartGroups = [
    { title: 'By Weekday', data: weekdayStats },
    { title: 'By Quarter', data: quarterStats },
    { title: 'By Month', data: monthStats },
    { title: 'By Year', data: yearStats },
    { title: "By Month's Week", data: monthWeekStats }
  ]

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 border border-slate-600 p-3 rounded shadow-lg">
          <p className="text-slate-200 font-semibold mb-1">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value}{entry.name === 'Count' ? '' : '%'}
            </p>
          ))}
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
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // Color schemes for different metrics
  const countColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1']
  const avgColors = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#6366f1', '#8b5cf6']
  const maxColors = ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fef3c7', '#fb923c', '#fdba74']
  const minColors = ['#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2', '#fb7185', '#fda4af']

  return (
    <div className="space-y-8">
      {chartGroups.map((group, groupIndex) => (
        <div key={groupIndex}>
          <h4 className="text-lg font-semibold mb-4 text-slate-100">{group.title}</h4>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {renderChart(`Count`, group.data, 'count', 'Count', countColors)}
            {renderChart(`Avg % Change`, group.data, 'avgChange', '%', avgColors)}
            {renderChart(`Max % Change`, group.data, 'maxChange', '%', maxColors)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            {renderChart(`Min % Change`, group.data, 'minChange', '%', minColors)}
          </div>
        </div>
      ))}
    </div>
  )
}

export default StatisticsCharts
