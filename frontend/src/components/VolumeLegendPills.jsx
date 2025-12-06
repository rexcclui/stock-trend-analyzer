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

  const wrapperClassName = ['flex flex-nowrap gap-0 overflow-x-auto', className].filter(Boolean).join(' ')

  return (
    <div className={wrapperClassName}>
      {legend.map((slot, index) => (
        <span
          key={`${keyPrefix}-${slot?.legendIndex ?? index}`}
          title={titleFormatter(slot)}
          className={`px-1 py-0.5 text-[10px] leading-tight font-semibold rounded-sm shadow-sm border border-slate-800/60 text-center min-w-[2.25rem] shrink-0 ${slot?.isCurrent ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900' : ''}`}
          style={{
            backgroundColor: slot?.color,
            color: slot?.textColor || '#0f172a'
          }}
        >
          {slot?.label}
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
