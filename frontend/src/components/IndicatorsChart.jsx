import RSIChart from './RSIChart'
import MACDChart from './MACDChart'

function IndicatorsChart({ indicators, prices, showRSI = true, showMACD = true, syncedMouseDate, setSyncedMouseDate, zoomRange = { start: 0, end: null }, onZoomChange, onExtendPeriod, onRSISimulationResult }) {
  // Note: Zoom reset is handled by parent (StockAnalyzer) when time period changes
  // No need to reset here to avoid infinite loop

  return (
    <div className="space-y-6">
      {showRSI && (
        <RSIChart
          indicators={indicators}
          prices={prices}
          syncedMouseDate={syncedMouseDate}
          setSyncedMouseDate={setSyncedMouseDate}
          zoomRange={zoomRange}
          onZoomChange={onZoomChange}
          onExtendPeriod={onExtendPeriod}
          onSimulationResult={onRSISimulationResult}
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
