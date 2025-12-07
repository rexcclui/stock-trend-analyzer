import PropTypes from 'prop-types'

function defaultTitleFormatter(slot) {
  if (slot?.start != null && slot?.end != null) {
    return `${slot.start} - ${slot.end}`
  }
  return slot?.label || ''
}

function VolumeLegendPills({ legend, keyPrefix = 'legend', titleFormatter = defaultTitleFormatter, className = '' }) {
  if (!Array.isArray(legend) || legend.length === 0) {
    return null
  }

  const wrapperClassName = ['flex flex-nowrap gap-0 overflow-x-auto no-scrollbar', className].filter(Boolean).join(' ')

  const currentClasses = 'border-l-4 border-r-4 border-l-cyan-300 border-r-cyan-300 border-y border-y-slate-800/60 shadow-[0_0_0_1px_rgba(34,211,238,0.35)] scale-[1.05]'

  return (
    <div className={wrapperClassName}>
      {legend.map((slot, index) => (
        <span
          key={`${keyPrefix}-${slot?.legendIndex ?? index}`}
          title={titleFormatter(slot)}
          className={`px-2 py-1 text-[10px] leading-tight font-semibold rounded-sm shadow-sm border border-slate-800/60 text-center min-w-[2.75rem] shrink-0 flex flex-col items-center justify-center gap-0.5 ${slot?.isCurrent ? currentClasses : ''}`}
          style={{
            backgroundColor: slot?.color,
            color: slot?.textColor || '#0f172a'
          }}
        >
          <span className={slot?.isCurrent ? 'text-[11px]' : ''}>{slot?.label}</span>
        </span>
      ))}
    </div>
  )
}

VolumeLegendPills.propTypes = {
  legend: PropTypes.arrayOf(
    PropTypes.shape({
      legendIndex: PropTypes.number,
      start: PropTypes.number,
      end: PropTypes.number,
      label: PropTypes.string,
      color: PropTypes.string,
      textColor: PropTypes.string,
      isCurrent: PropTypes.bool
    })
  ),
  keyPrefix: PropTypes.string,
  titleFormatter: PropTypes.func,
  className: PropTypes.string
}

export default VolumeLegendPills
