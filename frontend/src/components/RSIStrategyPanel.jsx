import { useState, useCallback, useEffect } from 'react'
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import StepSlider from './StepSlider'
import { useRSIStrategy } from '../hooks/useRSIStrategy'

/**
 * RSIStrategyPanel - Reusable component for RSI buy/sell strategy simulation
 *
 * Strategy:
 * - BUY: When RSI crosses above oversold threshold (no position held)
 * - SELL: When RSI crosses below overbought threshold (position held)
 *
 * @param {Array} priceData - Array of price data with {date, close} (chronological order - oldest first)
 * @param {Object} zoomRange - Current zoom range {start, end}
 * @param {function} onParametersChange - Callback when RSI parameters change (period, overbought, oversold)
 */
function RSIStrategyPanel({ priceData, zoomRange, onParametersChange }) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [isSimulating, setIsSimulating] = useState(false)

  const {
    rsiPeriod,
    setRsiPeriod,
    overboughtThreshold,
    setOverboughtThreshold,
    oversoldThreshold,
    setOversoldThreshold,
    simulationResult,
    runSimulation,
    resetSimulation
  } = useRSIStrategy(priceData)

  // Step configurations for sliders
  // RSI Period: increment 1 below 14, 2 below 20, 4 below 50
  const periodSteps = [
    { threshold: 14, step: 1 },
    { threshold: 20, step: 2 },
    { threshold: 50, step: 4 }
  ]

  // Overbought/Oversold: increment 3
  const thresholdSteps = [
    { threshold: 100, step: 3 }
  ]

  // Get visible price data based on zoom range
  const getVisiblePrices = useCallback(() => {
    if (!priceData || priceData.length === 0) return []

    const endIndex = zoomRange.end === null ? priceData.length : zoomRange.end
    return priceData.slice(zoomRange.start, endIndex)
  }, [priceData, zoomRange])

  // Handle refresh button click - run simulation
  const handleRefresh = useCallback(() => {
    setIsSimulating(true)
    const visiblePrices = getVisiblePrices()
    runSimulation(visiblePrices)
    setTimeout(() => setIsSimulating(false), 300)
  }, [getVisiblePrices, runSimulation])

  // Notify parent of parameter changes
  useEffect(() => {
    if (onParametersChange) {
      onParametersChange({
        period: rsiPeriod,
        overbought: overboughtThreshold,
        oversold: oversoldThreshold
      })
    }
  }, [rsiPeriod, overboughtThreshold, oversoldThreshold, onParametersChange])

  const formatPL = (pl) => {
    if (pl === undefined || pl === null) return '-'
    const sign = pl >= 0 ? '+' : ''
    return `${sign}${pl.toFixed(2)}%`
  }

  return (
    <div className="absolute top-0 left-0 z-10 bg-slate-800/95 rounded-lg border border-slate-600 shadow-lg min-w-[200px]">
      {/* Header with results */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-600">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-slate-400 hover:text-slate-200 transition-colors"
        >
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-400">RSI Strategy</span>
          {simulationResult && !simulationResult.error && (
            <>
              <span className="text-slate-300">
                Trades: <span className="font-medium text-white">{simulationResult.trades}</span>
              </span>
              <span className={`font-medium ${simulationResult.plPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                P/L: {formatPL(simulationResult.plPercent)}
              </span>
            </>
          )}
          {simulationResult?.error && (
            <span className="text-amber-400 text-xs">{simulationResult.error}</span>
          )}
          {!simulationResult && (
            <span className="text-slate-500 text-xs">Click refresh to simulate</span>
          )}
        </div>

        <button
          onClick={handleRefresh}
          disabled={isSimulating}
          className="ml-auto p-1.5 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 transition-colors"
          title="Run simulation"
        >
          <RefreshCw size={14} className={`text-white ${isSimulating ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Expanded controls */}
      {isExpanded && (
        <div className="p-3 space-y-3">
          <StepSlider
            label="RSI Period"
            value={rsiPeriod}
            onChange={setRsiPeriod}
            min={9}
            max={50}
            steps={periodSteps}
          />

          <StepSlider
            label="Overbought"
            value={overboughtThreshold}
            onChange={setOverboughtThreshold}
            min={65}
            max={95}
            steps={thresholdSteps}
          />

          <StepSlider
            label="Oversold"
            value={oversoldThreshold}
            onChange={setOversoldThreshold}
            min={5}
            max={35}
            steps={thresholdSteps}
          />

          {/* Trade details (optional expandable) */}
          {simulationResult?.tradeDetails && simulationResult.tradeDetails.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-600">
              <div className="text-xs text-slate-400 mb-1">Trade History:</div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {simulationResult.tradeDetails.map((trade, idx) => (
                  <div key={idx} className="text-xs flex justify-between text-slate-300">
                    <span>#{idx + 1} {trade.buyDate.slice(5)}</span>
                    <span className={trade.plPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {formatPL(trade.plPercent)}
                      {trade.isOpen && <span className="text-amber-400 ml-1">(open)</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default RSIStrategyPanel
