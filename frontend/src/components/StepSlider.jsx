import { Minus, Plus } from 'lucide-react'

/**
 * StepSlider - A slider component with +/- buttons and custom step increments
 *
 * @param {number} value - Current value
 * @param {function} onChange - Callback when value changes
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {Array<{threshold: number, step: number}>} steps - Array of step configurations
 *   Each object has: threshold (value below which this step applies), step (increment amount)
 *   Steps are evaluated in order, so list them from lowest threshold to highest
 * @param {string} label - Label for the slider
 * @param {string} className - Additional CSS classes
 */
function StepSlider({ value, onChange, min, max, steps, label, className = '' }) {
  // Get the appropriate step size for current value (for incrementing)
  const getStepForValue = (val, isIncrement) => {
    if (!steps || steps.length === 0) return 1

    // Sort steps by threshold ascending
    const sortedSteps = [...steps].sort((a, b) => a.threshold - b.threshold)

    if (isIncrement) {
      // For increment, find the step for current value
      for (const s of sortedSteps) {
        if (val < s.threshold) {
          return s.step
        }
      }
      // If above all thresholds, use the last step
      return sortedSteps[sortedSteps.length - 1].step
    } else {
      // For decrement, we need to consider where we're coming from
      // Find the step that applies to the value we'd be going to
      for (let i = sortedSteps.length - 1; i >= 0; i--) {
        if (val > sortedSteps[i].threshold || i === 0) {
          return sortedSteps[i].step
        }
      }
      return sortedSteps[0].step
    }
  }

  const handleDecrement = () => {
    const step = getStepForValue(value, false)
    const newValue = Math.max(min, value - step)
    onChange(newValue)
  }

  const handleIncrement = () => {
    const step = getStepForValue(value, true)
    const newValue = Math.min(max, value + step)
    onChange(newValue)
  }

  const handleSliderChange = (e) => {
    onChange(Number(e.target.value))
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400">{label}</span>
          <span className="text-xs font-medium text-slate-200">{value}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={handleDecrement}
          disabled={value <= min}
          className="p-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Decrease"
        >
          <Minus size={14} className="text-slate-300" />
        </button>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={handleSliderChange}
          className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-violet-500"
          style={{
            background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${((value - min) / (max - min)) * 100}%, #334155 ${((value - min) / (max - min)) * 100}%, #334155 100%)`
          }}
        />
        <button
          onClick={handleIncrement}
          disabled={value >= max}
          className="p-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Increase"
        >
          <Plus size={14} className="text-slate-300" />
        </button>
      </div>
    </div>
  )
}

export default StepSlider
