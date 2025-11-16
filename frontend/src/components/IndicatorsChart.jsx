import { useState, useEffect, useCallback } from 'react'
import RSIChart from './RSIChart'
import MACDChart from './MACDChart'

function IndicatorsChart({ indicators, showRSI = true, showMACD = true, syncedMouseDate, setSyncedMouseDate }) {
  const [zoomRange, setZoomRange] = useState({ start: 0, end: null })

  // Reset zoom when indicators change
  useEffect(() => {
    setZoomRange({ start: 0, end: null })
  }, [indicators.length])

  const handleZoomChange = useCallback((newZoomRange) => {
    setZoomRange(newZoomRange)
  }, [])

  return (
    <div className="space-y-6">
      {showRSI && (
        <RSIChart
          indicators={indicators}
          syncedMouseDate={syncedMouseDate}
          setSyncedMouseDate={setSyncedMouseDate}
          zoomRange={zoomRange}
          onZoomChange={handleZoomChange}
        />
      )}

      {showMACD && (
        <MACDChart
          indicators={indicators}
          syncedMouseDate={syncedMouseDate}
          setSyncedMouseDate={setSyncedMouseDate}
          zoomRange={zoomRange}
          onZoomChange={handleZoomChange}
        />
      )}
    </div>
  )
}

export default IndicatorsChart
