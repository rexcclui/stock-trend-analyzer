import { BarChart3, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react'

/**
 * Volume Breakthrough Panel Component
 * Displays volume profile analysis and breakthrough detection
 */
function VolumeBreakthroughPanel({ volumeProfile }) {
  if (!volumeProfile || !volumeProfile.slots || volumeProfile.slots.length === 0) {
    return null
  }

  const { slots, currentSlotIndex, previousSlotIndex, currentWeight, previousWeight, weightDifference } = volumeProfile

  // Determine breakthrough status
  const hasLowWeight = currentWeight < 6
  const hasWeightDrop = weightDifference < -6
  const isPotentialBreakthrough = hasLowWeight && hasWeightDrop

  // Find resistance zones
  const resistanceZones = findResistanceZones(slots, currentSlotIndex)

  return (
    <div className="bg-slate-800 rounded-lg p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-purple-400" />
          Volume Profile Analysis
        </h3>
        {isPotentialBreakthrough && (
          <span className="px-3 py-1 rounded-full text-sm font-bold bg-purple-600 text-white animate-pulse">
            ⚡ POTENTIAL BREAKTHROUGH
          </span>
        )}
      </div>

      {/* Current Zone Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          label="Current Zone"
          value={`${currentWeight.toFixed(1)}%`}
          subtitle={
            currentSlotIndex >= 0 && currentSlotIndex < slots.length
              ? `$${slots[currentSlotIndex].start.toFixed(2)} - $${slots[currentSlotIndex].end.toFixed(2)}`
              : 'N/A'
          }
          color={hasLowWeight ? 'green' : 'slate'}
          icon={<BarChart3 className="w-4 h-4" />}
        />
        <MetricCard
          label="Weight Change"
          value={`${weightDifference.toFixed(1)}%`}
          subtitle="from previous slot"
          color={hasWeightDrop ? 'amber' : 'slate'}
          icon={<ArrowDown className="w-4 h-4" />}
        />
        <MetricCard
          label="Breakthrough Status"
          value={isPotentialBreakthrough ? 'POTENTIAL' : 'Normal'}
          subtitle={isPotentialBreakthrough ? 'High probability' : 'Monitor'}
          color={isPotentialBreakthrough ? 'purple' : 'blue'}
          icon={<AlertTriangle className="w-4 h-4" />}
        />
      </div>

      {/* Volume Distribution Histogram */}
      <VolumeHistogram
        slots={slots}
        currentIndex={currentSlotIndex}
        previousIndex={previousSlotIndex}
      />

      {/* Resistance Zones */}
      <ResistanceZones zones={resistanceZones} />
    </div>
  )
}

/**
 * Metric Card Component
 */
function MetricCard({ label, value, subtitle, color, icon }) {
  const colorClasses = {
    green: 'bg-green-900/30 border-green-700 text-green-200',
    amber: 'bg-amber-900/30 border-amber-700 text-amber-200',
    purple: 'bg-purple-900/30 border-purple-700 text-purple-200',
    blue: 'bg-blue-900/30 border-blue-700 text-blue-200',
    slate: 'bg-slate-700/30 border-slate-600 text-slate-300'
  }

  return (
    <div className={`border rounded-lg p-4 ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium opacity-75">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs opacity-60 mt-1">{subtitle}</div>
    </div>
  )
}

/**
 * Volume Histogram Component
 */
function VolumeHistogram({ slots, currentIndex, previousIndex }) {
  if (!slots || slots.length === 0) return null

  const maxWeight = Math.max(...slots.map(s => s.weight || 0))

  // Show only middle section (around current price)
  const startIdx = Math.max(0, currentIndex - 10)
  const endIdx = Math.min(slots.length, currentIndex + 10)
  const visibleSlots = slots.slice(startIdx, endIdx)

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-slate-300">Volume Distribution</h4>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {visibleSlots.map((slot, index) => {
          const actualIndex = startIdx + index
          const isCurrent = actualIndex === currentIndex
          const isPrevious = actualIndex === previousIndex
          const barWidth = maxWeight > 0 ? (slot.weight / maxWeight) * 100 : 0

          return (
            <div key={actualIndex} className="flex items-center gap-2 text-xs">
              <span className="w-24 text-slate-400 text-right">
                ${slot.start?.toFixed(0) || '0'}-${slot.end?.toFixed(0) || '0'}
              </span>
              <div className="flex-1 bg-slate-700 rounded-full h-5 relative overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isCurrent
                      ? 'bg-green-500'
                      : isPrevious
                        ? 'bg-amber-500'
                        : 'bg-blue-500'
                    }`}
                  style={{ width: `${barWidth}%` }}
                />
                {isCurrent && (
                  <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">
                    CURRENT
                  </span>
                )}
                {isPrevious && (
                  <span className="absolute inset-0 flex items-center justify-center text-white font-semibold text-xs">
                    PREV
                  </span>
                )}
              </div>
              <span className="w-14 text-right text-slate-300">
                {slot.weight?.toFixed(1) || '0'}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Resistance Zones Component
 */
function ResistanceZones({ zones }) {
  if (!zones) return null

  const { upperResistance, lowerSupport } = zones

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Upper Resistance */}
      <div className="border border-red-700/50 bg-red-900/20 rounded-lg p-3">
        <h5 className="text-xs font-semibold text-red-300 mb-2 flex items-center gap-1">
          <ArrowUp className="w-3 h-3" />
          Upper Resistance
        </h5>
        {upperResistance ? (
          <>
            <div className="text-lg font-bold text-red-200">
              ${upperResistance.start?.toFixed(2) || '0'} - ${upperResistance.end?.toFixed(2) || '0'}
            </div>
            <div className="text-sm text-red-300">
              {upperResistance.weight?.toFixed(1) || '0'}% volume
            </div>
            <div className="text-xs text-red-400 mt-1">
              {upperResistance.distance || 'N/A'} above
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-400">No significant resistance</div>
        )}
      </div>

      {/* Lower Support */}
      <div className="border border-green-700/50 bg-green-900/20 rounded-lg p-3">
        <h5 className="text-xs font-semibold text-green-300 mb-2 flex items-center gap-1">
          <ArrowDown className="w-3 h-3" />
          Lower Support
        </h5>
        {lowerSupport ? (
          <>
            <div className="text-lg font-bold text-green-200">
              ${lowerSupport.start?.toFixed(2) || '0'} - ${lowerSupport.end?.toFixed(2) || '0'}
            </div>
            <div className="text-sm text-green-300">
              {lowerSupport.weight?.toFixed(1) || '0'}% volume
            </div>
            <div className="text-xs text-green-400 mt-1">
              {lowerSupport.distance || 'N/A'} below
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-400">No significant support</div>
        )}
      </div>
    </div>
  )
}

/**
 * Find resistance and support zones
 */
function findResistanceZones(slots, currentIndex) {
  if (!slots || currentIndex < 0 || currentIndex >= slots.length) {
    return { upperResistance: null, lowerSupport: null }
  }

  const currentWeight = slots[currentIndex]?.weight || 0
  const threshold = currentWeight + 5

  let upperResistance = null
  let lowerSupport = null

  // Search upward for resistance
  for (let i = currentIndex + 1; i < slots.length; i++) {
    if (slots[i].weight >= threshold) {
      const distance = ((slots[i].start / slots[currentIndex].end - 1) * 100).toFixed(1) + '%'
      upperResistance = { ...slots[i], distance }
      break
    }
  }

  // Search downward for support
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (slots[i].weight >= threshold) {
      const distance = ((1 - slots[i].end / slots[currentIndex].start) * 100).toFixed(1) + '%'
      lowerSupport = { ...slots[i], distance }
      break
    }
  }

  return { upperResistance, lowerSupport }
}

export default VolumeBreakthroughPanel
