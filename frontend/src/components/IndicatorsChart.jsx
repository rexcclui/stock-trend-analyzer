import { useEffect } from 'react'
import RSIChart from './RSIChart'
import MACDChart from './MACDChart'

function IndicatorsChart({ indicators, showRSI = true, showMACD = true, syncedMouseDate, setSyncedMouseDate, zoomRange = { start: 0, end: null }, onZoomChange, onExtendPeriod }) {
  // Reset zoom when indicators change
  useEffect(() => {
    if (onZoomChange) {
      onZoomChange({ start: 0, end: null })
    }
  }, [indicators.length, onZoomChange])

  return (
    <div className="space-y-6">
      {showRSI && (
        <RSIChart
          indicators={indicators}
          syncedMouseDate={syncedMouseDate}
          setSyncedMouseDate={setSyncedMouseDate}
          zoomRange={zoomRange}
          onZoomChange={onZoomChange}
          onExtendPeriod={onExtendPeriod}
        />
      )}

      {showMACD && (
        <MACDChart
          indicators={indicators}
          syncedMouseDate={syncedMouseDate}
          setSyncedMouseDate={setSyncedMouseDate}
          zoomRange={zoomRange}
          onZoomChange={onZoomChange}
          onExtendPeriod={onExtendPeriod}
        />
      )}
    </div>
  )
}

export default IndicatorsChart
