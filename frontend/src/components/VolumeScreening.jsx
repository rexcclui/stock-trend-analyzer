import { useEffect, useState } from 'react'
import axios from 'axios'
import { Plus, ScanLine, XCircle, Activity, Loader2 } from 'lucide-react'
import { joinUrl } from '../utils/urlHelper'

const STOCK_HISTORY_KEY = 'stockSearchHistory'
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const periods = [
  { label: '1Y', value: '365' },
  { label: '3Y', value: '1095' },
  { label: '5Y', value: '1825' },
  { label: 'Max', value: '3650' }
]

function parseStockSymbols(input) {
  if (!input || !input.trim()) return []
  return input
    .split(/[,\s]+/)
    .map(symbol => symbol.trim().toUpperCase())
    .filter(Boolean)
}

function formatPriceRange(start, end) {
  return `$${Number(start).toFixed(2)} - $${Number(end).toFixed(2)}`
}

function getSlotColor(weight, maxWeight) {
  // Lower volume = yellow, higher volume = red
  const lowColor = [250, 204, 21]   // #facc15
  const highColor = [220, 38, 38]   // #dc2626
  const ratio = maxWeight > 0 ? Math.min(1, Math.max(0, weight / maxWeight)) : 0
  const mix = (start, end) => Math.round(start + (end - start) * ratio)
  return `rgb(${mix(lowColor[0], highColor[0])}, ${mix(lowColor[1], highColor[1])}, ${mix(lowColor[2], highColor[2])})`
}

function findSlotIndex(slots, price) {
  if (!Array.isArray(slots) || slots.length === 0 || price == null) return -1
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    const isLast = i === slots.length - 1
    if ((price >= slot.start && price <= slot.end) || (isLast && price >= slot.start)) {
      return i
    }
  }
  return -1
}

function buildVolumeSlots(prices) {
  if (!Array.isArray(prices) || prices.length === 0) {
    return { slots: [], lastPrice: null, previousPrice: null }
  }

  const sorted = [...prices].sort((a, b) => new Date(a.date) - new Date(b.date))
  const minLow = Math.min(...sorted.map(p => p.low))
  const maxHigh = Math.max(...sorted.map(p => p.high))
  const baseSlotSize = (maxHigh - minLow) / 20 || 0
  const effectiveMax = minLow === maxHigh
    ? maxHigh + Math.max(0.0001, maxHigh * 0.05)
    : maxHigh

  const buildSlots = (getWidth) => {
    const slots = []
    let start = minLow

    while (start < effectiveMax) {
      const width = Math.max(0.0001, getWidth(start))
      const end = Math.min(effectiveMax, start + width)
      if (end === start) break
      slots.push({ start, end, volume: 0, weight: 0 })
      start = end
    }

    return slots
  }

  // Prefer 5% slices when a 20-slice baseline would exceed that width.
  const adaptiveSlots = buildSlots((start) => {
    const percentWidth = Math.max(0.0001, (start || minLow || 1) * 0.05)
    const targetWidth = baseSlotSize || percentWidth
    return targetWidth > percentWidth ? percentWidth : targetWidth
  })

  const slots = adaptiveSlots.length > 40
    ? buildSlots(() => Math.max(0.0001, (effectiveMax - minLow) / 40))
    : adaptiveSlots

  sorted.forEach(price => {
    const refPrice = price.close ?? price.high ?? price.low
    const slotIndex = findSlotIndex(slots, refPrice)
    if (slotIndex >= 0) {
      slots[slotIndex].volume += price.volume || 0
    }
  })

  const totalVolume = slots.reduce((sum, slot) => sum + slot.volume, 0)
  const safeDivisor = totalVolume > 0 ? totalVolume : 1
  slots.forEach(slot => {
    slot.weight = (slot.volume / safeDivisor) * 100
  })

  const lastPoint = sorted[sorted.length - 1]
  const lastPrice = lastPoint?.close ?? lastPoint?.high ?? lastPoint?.low ?? null
  const priorPoint = sorted[sorted.length - 2]
  const previousPrice = priorPoint?.close ?? priorPoint?.high ?? priorPoint?.low ?? null

  return { slots, lastPrice, previousPrice }
}

function buildLegend(slots, currentIndex) {
  if (!Array.isArray(slots) || slots.length === 0 || currentIndex < 0) return []

  const startIndex = Math.max(0, currentIndex - 5)
  const endIndex = Math.min(slots.length - 1, currentIndex + 5)
  const selected = slots.slice(startIndex, endIndex + 1)
  const maxWeight = Math.max(...selected.map(slot => slot.weight), 0)

  return selected.map((slot, idx) => ({
    ...slot,
    legendIndex: startIndex + idx,
    label: `${slot.weight.toFixed(1)}%`,
    color: getSlotColor(slot.weight, maxWeight),
    textColor: slot.weight >= maxWeight * 0.5 ? '#f8fafc' : '#0f172a',
    isCurrent: startIndex + idx === currentIndex
  }))
}

// Break logic:
// - Find the closest slot on the prior date; if it is lower, check up to five slots below the current range.
//   A break is flagged when any of those slots differs from the current weight by ≥5 percentage points.
// - If the prior slot is higher, do the same check on up to five slots above the current range.
// - If the prior slot is the same or unavailable, no break is reported.
function detectBreakout(slots, currentIndex, lastPrice, previousPrice) {
  if (!Array.isArray(slots) || slots.length === 0 || currentIndex < 0 || lastPrice == null) return false
  const currentSlot = slots[currentIndex]
  const prevIndex = findSlotIndex(slots, previousPrice)

  if (prevIndex < 0 || prevIndex === currentIndex) {
    return false
  }

  const currentWeight = currentSlot.weight
  const targetSlots = []

  if (prevIndex < currentIndex) {
    // Prior slot sat below the current one; inspect up to five ranges below for a sharp volume shift.
    for (let i = currentIndex - 1; i >= Math.max(0, currentIndex - 5); i -= 1) {
      targetSlots.push(slots[i])
    }
  } else {
    // Prior slot sat above the current one; inspect up to five ranges above for a sharp volume shift.
    for (let i = currentIndex + 1; i <= Math.min(slots.length - 1, currentIndex + 5); i += 1) {
      targetSlots.push(slots[i])
    }
  }

  return targetSlots.some(slot => Math.abs((slot?.weight ?? 0) - currentWeight) >= 5)
}

function findResistance(slots, currentIndex, direction = 'down') {
  if (!Array.isArray(slots) || slots.length === 0 || currentIndex < 0) return null

  const currentWeight = slots[currentIndex]?.weight ?? null
  if (currentWeight == null) return null

  const threshold = currentWeight + 5
  const step = direction === 'up' ? 1 : -1

  let idx = currentIndex + step
  while (idx >= 0 && idx < slots.length) {
    const slot = slots[idx]
    if (slot?.weight >= threshold) {
      return {
        index: idx,
        range: formatPriceRange(slot.start, slot.end),
        weight: slot.weight
      }
    }
    idx += step
  }

  return null
}

function VolumeScreening({ onStockSelect }) {
  const [symbolInput, setSymbolInput] = useState('')
  const [period, setPeriod] = useState('1825')
  const [stockHistory, setStockHistory] = useState([])
  const [entries, setEntries] = useState([])

  useEffect(() => {
    const savedHistory = localStorage.getItem(STOCK_HISTORY_KEY)
    if (savedHistory) {
      try {
        setStockHistory(JSON.parse(savedHistory))
      } catch (e) {
        console.error('Failed to load stock history:', e)
      }
    }
  }, [])

  useEffect(() => {
    const handleHistoryUpdate = (event) => {
      if (Array.isArray(event.detail)) {
        setStockHistory(event.detail)
      }
    }

    window.addEventListener('stockHistoryUpdated', handleHistoryUpdate)
    return () => window.removeEventListener('stockHistoryUpdated', handleHistoryUpdate)
  }, [])

  const saveToHistory = (symbols) => {
    if (!Array.isArray(symbols) || symbols.length === 0) return
    const uniqueSymbols = Array.from(new Set(symbols.filter(Boolean)))
    const updatedHistory = [...uniqueSymbols, ...stockHistory.filter(s => !uniqueSymbols.includes(s))].slice(0, 10)
    setStockHistory(updatedHistory)
    localStorage.setItem(STOCK_HISTORY_KEY, JSON.stringify(updatedHistory))
    window.dispatchEvent(new CustomEvent('stockHistoryUpdated', { detail: updatedHistory }))
  }

  const addSymbols = () => {
    const symbols = parseStockSymbols(symbolInput)
    if (symbols.length === 0) return

    saveToHistory(symbols)

    const nextEntries = [...entries]
    symbols.forEach(symbol => {
      if (!nextEntries.some(entry => entry.symbol === symbol)) {
        nextEntries.push({
          id: `${symbol}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          symbol,
          priceRange: '—',
          testedDays: '—',
          slotCount: '—',
          volumeLegend: [],
          bottomResist: '—',
          upperResist: '—',
          breakout: '—',
          status: 'idle',
          error: null
        })
      }
    })

    setEntries(nextEntries)
    setSymbolInput('')
  }

  const scanEntries = async () => {
    if (entries.length === 0) return

    const pendingEntries = entries.filter(entry => entry.status !== 'ready')
    if (pendingEntries.length === 0) return

    setEntries(prev => prev.map(entry => (
      entry.status === 'ready'
        ? entry
        : { ...entry, status: 'loading', error: null }
    )))

    const scanned = await Promise.all(entries.map(async entry => {
      if (entry.status === 'ready') {
        return entry
      }

      try {
        const response = await axios.get(joinUrl(API_URL, '/analyze'), {
          params: {
            symbol: entry.symbol,
            days: period
          }
        })

        const prices = response.data?.prices || []
        const { slots, lastPrice, previousPrice } = buildVolumeSlots(prices)
        const slotIndex = findSlotIndex(slots, lastPrice)
        const legend = buildLegend(slots, slotIndex)
        const breakout = detectBreakout(slots, slotIndex, lastPrice, previousPrice)
        const bottomResist = findResistance(slots, slotIndex, 'down')
        const upperResist = findResistance(slots, slotIndex, 'up')

        return {
          ...entry,
          priceRange: slotIndex >= 0 ? formatPriceRange(slots[slotIndex].start, slots[slotIndex].end) : '—',
          testedDays: period,
          slotCount: slots.length,
          volumeLegend: legend,
          bottomResist: bottomResist ? `${bottomResist.range} (${bottomResist.weight.toFixed(1)}%)` : '—',
          upperResist: upperResist ? `${upperResist.range} (${upperResist.weight.toFixed(1)}%)` : '—',
          breakout: breakout ? 'Break' : '—',
          status: 'ready',
          error: null
        }
      } catch (error) {
        console.error('Failed to scan symbol', entry.symbol, error)
        return {
          ...entry,
          priceRange: '—',
          slotCount: '—',
          volumeLegend: [],
          bottomResist: '—',
          upperResist: '—',
          breakout: '—',
          status: 'error',
          error: error?.response?.data?.error || error?.message || 'Failed to scan'
        }
      }
    }))

    setEntries(scanned)
  }

  const removeEntry = (id) => {
    setEntries(entries.filter(entry => entry.id !== id))
  }

  const handleRowClick = (entry) => {
    if (!onStockSelect) return
    onStockSelect(entry.symbol, { days: period, forceVolumeProfileV2: true })
  }

  const handleHistoryClick = (symbol) => {
    setSymbolInput(symbol)
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300">
                Stock Symbol
              </label>
              {stockHistory.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-xs text-slate-400">Recent:</span>
                  {stockHistory.map((stock, index) => (
                    <span key={stock}>
                      <button
                        onClick={() => handleHistoryClick(stock)}
                        className="text-xs text-purple-400 hover:text-purple-300 hover:underline transition-colors"
                      >
                        {stock}
                      </button>
                      {index < stockHistory.length - 1 && (
                        <span className="text-slate-500">, </span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <input
              type="text"
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              placeholder="e.g., AAPL, MSFT, TSLA"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-slate-400"
            />
          </div>
          <div className="w-full lg:w-40">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Period
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {periods.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap lg:flex-nowrap items-end gap-3">
            <button
              type="button"
              onClick={addSymbols}
              className="flex-1 lg:flex-none px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add
            </button>
            <button
              type="button"
              onClick={scanEntries}
              disabled={entries.length === 0}
              className="flex-1 lg:flex-none px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <ScanLine className="w-5 h-5" />
              Scan
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-400 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Add one or multiple symbols using comma or space separators, then run a quick scan for the selected period.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-700">
            <thead className="bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Stock Code
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Current Price Range
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Days Tested
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Price Range Slots
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Volume Weight %
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Bottom Resist
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Upper Resist
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Break
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-4 py-6 text-center text-slate-400">
                    No symbols added yet. Add stocks above to start screening.
                  </td>
                </tr>
              ) : (
                entries.map(entry => (
                  <tr
                    key={entry.id}
                    className="hover:bg-slate-800/60 cursor-pointer"
                    onClick={() => handleRowClick(entry)}
                    title="Click to open in Technical Analysis with Vol Prf V2"
                  >
                    <td className="px-4 py-3 text-slate-100 font-medium">{entry.symbol}</td>
                    <td className="px-4 py-3 text-slate-200">{entry.priceRange}</td>
                    <td className="px-4 py-3 text-slate-200">{entry.testedDays}</td>
                    <td className="px-4 py-3 text-slate-200">{entry.slotCount}</td>
                    <td className="px-4 py-3 text-slate-200">
                    {entry.status === 'loading' ? (
                        <div className="flex items-center gap-2 text-amber-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Scanning…</span>
                        </div>
                      ) : entry.status === 'error' ? (
                        <span className="text-red-400 text-sm">{entry.error || 'Failed to scan'}</span>
                      ) : entry.volumeLegend?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {entry.volumeLegend.map(slot => (
                            <span
                              key={`${entry.id}-${slot.legendIndex}`}
                              title={`${formatPriceRange(slot.start, slot.end)} • ${slot.label}`}
                              className={`px-2 py-1 text-xs font-semibold rounded-md shadow-sm border border-slate-800/60 ${
                                slot.isCurrent ? 'ring-2 ring-amber-400' : ''
                              }`}
                              style={{
                                backgroundColor: slot.color,
                                color: slot.textColor || '#0f172a'
                              }}
                            >
                              {slot.label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-200">{entry.bottomResist}</td>
                    <td className="px-4 py-3 text-slate-200">{entry.upperResist}</td>
                    <td className="px-4 py-3 text-slate-200">{entry.breakout}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeEntry(entry.id)
                        }}
                        className="inline-flex items-center gap-1 text-slate-400 hover:text-red-400 transition-colors"
                        aria-label={`Remove ${entry.symbol}`}
                      >
                        <XCircle className="w-5 h-5" />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-800 text-right text-xs text-slate-400">
          Selected period: {periods.find(p => p.value === period)?.label || period}
        </div>
      </div>
    </div>
  )
}

export default VolumeScreening
