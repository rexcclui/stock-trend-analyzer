import PropTypes from 'prop-types'

const LEGEND_WINDOW = 11
const LEGEND_SIDE = Math.floor(LEGEND_WINDOW / 2)

function defaultTitleFormatter(slot) {
  if (slot?.start != null && slot?.end != null) {
    return `${slot.start} - ${slot.end}`
  }
  return slot?.label || '—'
}

function buildPlaceholder(index) {
  return {
    legendIndex: `placeholder-${index}`,
    label: '—',
    color: '#1f2937',
    textColor: '#cbd5e1',
    isPlaceholder: true
  }
}

function padLegend(legend = []) {
  const baseLegend = Array.isArray(legend) ? legend.filter(Boolean) : []

  if (baseLegend.length === 0) {
    return Array.from({ length: LEGEND_WINDOW }, (_, idx) => buildPlaceholder(`empty-${idx}`))
  }

  const currentIndex = baseLegend.findIndex(slot => slot?.isCurrent)
  const anchorIndex = currentIndex >= 0 ? currentIndex : Math.floor(baseLegend.length / 2)
  const windowStart = Math.max(0, anchorIndex - LEGEND_SIDE)
  const windowEnd = Math.min(baseLegend.length - 1, anchorIndex + LEGEND_SIDE)
  const windowedLegend = baseLegend.slice(windowStart, windowEnd + 1)
  const anchorInWindow = Math.min(anchorIndex - windowStart, windowedLegend.length - 1)

  const padBefore = Math.max(0, LEGEND_SIDE - anchorInWindow)
  const padAfter = Math.max(0, (anchorInWindow + LEGEND_SIDE) - (windowedLegend.length - 1))

  const padded = [
    ...Array.from({ length: padBefore }, (_, idx) => buildPlaceholder(`leading-${idx}`)),
    ...windowedLegend,
    ...Array.from({ length: padAfter }, (_, idx) => buildPlaceholder(`trailing-${idx}`))
  ]

  if (padded.length < LEGEND_WINDOW) {
    const extra = LEGEND_WINDOW - padded.length
    padded.push(...Array.from({ length: extra }, (_, idx) => buildPlaceholder(`extra-${idx}`)))
  }

  return padded.slice(0, LEGEND_WINDOW)
}

function VolumeLegendPills({ legend, keyPrefix = 'legend', titleFormatter = defaultTitleFormatter, className = '' }) {
  const paddedLegend = padLegend(legend)

  const wrapperClassName = ['flex flex-nowrap gap-0 overflow-x-auto no-scrollbar min-w-[30rem]', className]
    .filter(Boolean)
    .join(' ')

  const currentClasses = 'border-l-4 border-r-4 border-l-cyan-300 border-r-cyan-300 border-y border-y-slate-800/60 shadow-[0_0_0_1px_rgba(34,211,238,0.35)] scale-[1.05]'

  return (
    <div className={wrapperClassName}>
      {paddedLegend.map((slot, index) => (
        <span
          key={`${keyPrefix}-${slot?.legendIndex ?? index}`}
          title={titleFormatter(slot)}
          className={`w-14 min-w-[3.5rem] max-w-[3.5rem] h-8 px-2 py-0.5 text-xs leading-tight font-semibold rounded-sm shadow-sm border text-center shrink-0 flex flex-col items-center justify-center gap-0 overflow-hidden text-ellipsis ${slot?.isCurrent ? currentClasses : 'border-slate-800/60'} ${slot?.isPlaceholder ? 'border-dashed opacity-70' : ''}`}
          style={{
            backgroundColor: slot?.color || '#1f2937',
            color: slot?.textColor || (slot?.isPlaceholder ? '#cbd5e1' : '#0f172a')
          }}
        >
          <span className={slot?.isCurrent ? 'text-sm' : ''}>{slot?.label}</span>
        </span>
      ))}
    </div>
  )
}

VolumeLegendPills.propTypes = {
  legend: PropTypes.arrayOf(
    PropTypes.shape({
      legendIndex: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
      start: PropTypes.number,
      end: PropTypes.number,
      label: PropTypes.string,
      color: PropTypes.string,
      textColor: PropTypes.string,
      isCurrent: PropTypes.bool,
      isPlaceholder: PropTypes.bool
    })
  ),
  keyPrefix: PropTypes.string,
  titleFormatter: PropTypes.func,
  className: PropTypes.string
}

export default VolumeLegendPills
