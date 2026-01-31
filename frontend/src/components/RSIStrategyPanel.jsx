import { useState, useCallback, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import StepSlider from './StepSlider'
import { useRSIStrategy } from '../hooks/useRSIStrategy'

/**
 * RSIStrategyPanel - Reusable component for RSI buy/sell strategy simulation
 *
 * Strategy:
 * - BUY: When RSI crosses above oversold threshold (no position held)
 * - SELL: When RSI crosses above overbought threshold (position held)
 *
 * @param {Array} priceData - Array of price data with {date, close} (chronological order - oldest first)
 * @param {Object} zoomRange - Current zoom range {start, end}
 * @param {function} onParametersChange - Callback when RSI parameters change (period, overbought, oversold)
 * @param {function} onSimulationResult - Callback when simulation completes with result data
 */
function RSIStrategyPanel({ priceData, zoomRange, onParametersChange, onSimulationResult }) {
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

  // Notify parent of parameter changes and auto-trigger simulation
  useEffect(() => {
    if (onParametersChange) {
      onParametersChange({
        period: rsiPeriod,
        overbought: overboughtThreshold,
        oversold: oversoldThreshold
      })
    }
    // Auto-trigger simulation when parameters change
    const visiblePrices = getVisiblePrices()
    if (visiblePrices.length > 0) {
      runSimulation(visiblePrices)
    }
  }, [rsiPeriod, overboughtThreshold, oversoldThreshold, onParametersChange, getVisiblePrices, runSimulation])

  // Notify parent of simulation result changes
  useEffect(() => {
    if (onSimulationResult) {
      onSimulationResult(simulationResult)
    }
  }, [simulationResult, onSimulationResult])

  const formatPL = (pl) => {
    if (pl === undefined || pl === null) return '-'
    const sign = pl >= 0 ? '+' : ''
    return `${sign}${pl.toFixed(2)}%`
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {/* Sliders */}
      <div className="flex items-center gap-3">
        <StepSlider
          label="Period"
          value={rsiPeriod}
          onChange={setRsiPeriod}
          min={9}
          max={50}
          steps={periodSteps}
          className="w-32"
        />

        <StepSlider
          label="Overbought"
          value={overboughtThreshold}
          onChange={setOverboughtThreshold}
          min={65}
          max={95}
          steps={thresholdSteps}
          className="w-32"
        />

        <StepSlider
          label="Oversold"
          value={oversoldThreshold}
          onChange={setOversoldThreshold}
          min={5}
          max={35}
          steps={thresholdSteps}
          className="w-32"
        />
      </div>

      {/* Refresh button */}
      <button
        onClick={handleRefresh}
        disabled={isSimulating}
        className="p-1.5 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 transition-colors"
        title="Run simulation"
      >
        <RefreshCw size={14} className={`text-white ${isSimulating ? 'animate-spin' : ''}`} />
      </button>

      {/* Results */}
      <div className="flex items-center gap-3 text-sm">
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
    </div>
  )
}

export default RSIStrategyPanel
