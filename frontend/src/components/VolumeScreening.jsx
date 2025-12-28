import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { Plus, RefreshCcw, Activity, Loader2, Eraser, Trash2, DownloadCloud, UploadCloud, Pause, Play, Star, X, Search, Clock3, BarChart2, BarChart3, ArrowUpToLine, ArrowDownToLine } from 'lucide-react'
import { joinUrl } from '../utils/urlHelper'
import VolumeLegendPills from './VolumeLegendPills'

const STOCK_HISTORY_KEY = 'stockSearchHistory'
const VOLUME_CACHE_KEY = 'volumeScreeningEntries'
const VOLUME_SYMBOLS_KEY = 'volumeScreeningSymbols'
const VOLUME_RESULT_CACHE_KEY = 'volumeScreeningResultsBySymbol'
const TOP_SYMBOL_CACHE_KEY = 'volumeTopMarketSymbols'
const CACHE_TTL_MS = 16 * 60 * 60 * 1000
const RECENT_SCAN_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000
const TOP_SYMBOL_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 1 month cache for top 2000 symbols
const STALE_DATA_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000 // 1 month threshold for latest data point
const ABNORMAL_VOLUME_WEIGHT_THRESHOLD = 80
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const INVALID_FIVE_CHAR_LENGTH = 5
const BLOCKED_SUFFIX = '.TO'
const HYPHEN = '-'

const periods = [
  { label: '1Y', value: '365' },
  { label: '3Y', value: '1095' },
  { label: '5Y', value: '1825' },
  { label: 'Max', value: '3650' }
]

const defaultSortConfig = {
  field: null,
  direction: 'desc'
}

const PRICE_RANGE_TOOLTIP = 'Current price slot range, span, and volume share within the tested period.'
const BOTTOM_RESIST_TOOLTIP = 'Nearest support zone below the current price range; distance uses % gap from the current slot.'
const UPPER_RESIST_TOOLTIP = 'Nearest resistance zone above the current price range; distance uses % gap from the current slot.'
const BREAK_TOOLTIP = 'Breakout direction detected for the current slot (Up, Down, or Potential).'

// Helper function to convert days to display period (e.g., 1825 -> "5Y")
function formatPeriod(days) {
  const daysNum = parseInt(days, 10)
  if (daysNum >= 3650) return 'Max'
  if (daysNum >= 1825) return '5Y'
  if (daysNum >= 1095) return '3Y'
  if (daysNum >= 730) return '2Y'
  if (daysNum >= 365) return '1Y'
  if (daysNum >= 180) return '6M'
  if (daysNum >= 90) return '3M'
  return `${daysNum}D`
}

// Helper function to create unique key for symbol+period combination
function getEntryKey(symbol, days) {
  return `${symbol}-${days}`
}

// Helper function to process individual stock symbol - convert numbers to .HK format
function processStockSymbol(symbol) {
  const trimmed = symbol.trim().toUpperCase()
  if (!trimmed) return null

  // If it already ends with .HK, just pad the number part
  if (trimmed.endsWith('.HK')) {
    const numberPart = trimmed.replace('.HK', '')
    // Check if it's a pure number
    if (/^\d+$/.test(numberPart)) {
      const padded = numberPart.padStart(4, '0')
      return `${padded}.HK`
    }
    // If not a pure number (e.g., has letters), return as is
    return trimmed
  }

  // Check if it's a pure number (no .HK suffix)
  if (/^\d+$/.test(trimmed)) {
    const padded = trimmed.padStart(4, '0')
    return `${padded}.HK`
  }

  // Otherwise, return as is (e.g., AAPL, MSFT, 000100.SS, etc.)
  return trimmed
}

function parseStockSymbols(input) {
  if (!input || !input.trim()) return []
  return input
    .split(/[,\s]+/)
    .map(processStockSymbol)
    .filter(Boolean)
}

function formatPriceRange(start, end) {
  return `$${Number(start).toFixed(2)} - $${Number(end).toFixed(2)}`
}

function formatTimestamp(dateString) {
  if (!dateString) return '—'
  const parsed = new Date(dateString)
  if (Number.isNaN(parsed.getTime())) return '—'
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}

function isStaleDataDate(dateString) {
  if (!dateString) return false
  const parsed = new Date(dateString)
  const parsedTime = parsed.getTime()
  if (Number.isNaN(parsedTime)) return false

  return Date.now() - parsedTime > STALE_DATA_THRESHOLD_MS
}

function isInvalidFiveCharSymbol(symbol) {
  return typeof symbol === 'string' && symbol.length === INVALID_FIVE_CHAR_LENGTH && !symbol.includes('.')
}

function hasBlockedSuffix(symbol) {
  return typeof symbol === 'string' && symbol.toUpperCase().endsWith(BLOCKED_SUFFIX)
}

function isDisallowedSymbol(symbol) {
  return isInvalidFiveCharSymbol(symbol) || hasBlockedSuffix(symbol) || (typeof symbol === 'string' && symbol.includes(HYPHEN))
}

// Extract market identifier from stock symbol
// e.g., "12.HK" -> "HK", "000100.SS" -> "SS", "AAPL" -> "US"
function extractMarket(symbol) {
  if (!symbol || typeof symbol !== 'string') return 'US'
  const dotIndex = symbol.lastIndexOf('.')
  if (dotIndex === -1) return 'US'
  const market = symbol.substring(dotIndex + 1).toUpperCase()
  return market || 'US'
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (error) {
    const approxSizeKb = typeof value === 'string' ? (value.length * 2) / 1024 : null
    const sizeNote = approxSizeKb ? ` (payload ~${approxSizeKb.toFixed(1)} KB)` : ''
    console.error(`Failed to persist ${key}${sizeNote}:`, error)
    return false
  }
}

function normalizeCachedResult(cached) {
  if (!cached || typeof cached !== 'object') return null

  return {
    priceRange: cached.priceRange ?? cached.pr ?? '—',
    currentRange: cached.currentRange ?? cached.cr ?? null,
    previousRange: cached.previousRange ?? cached.prr ?? null,
    previousPriceRange: cached.previousPriceRange ?? cached.ppr ?? '—',
    testedDays: cached.testedDays ?? cached.td ?? '—',
    slotCount: cached.slotCount ?? cached.sc ?? '—',
    volumeLegend: cached.volumeLegend ?? cached.vl ?? [],
    bottomResist: cached.bottomResist ?? cached.br ?? '—',
    upperResist: cached.upperResist ?? cached.ur ?? '—',
    breakout: cached.breakout ?? cached.bo ?? '—',
    lastScanAt: cached.lastScanAt ?? cached.ls ?? null,
    status: cached.status ?? cached.st ?? 'idle'
  }
}

function compressResultEntry(entry) {
  return {
    pr: entry.priceRange,
    cr: entry.currentRange,
    prr: entry.previousRange,
    ppr: entry.previousPriceRange,
    td: entry.testedDays,
    sc: entry.slotCount,
    vl: entry.volumeLegend,
    br: entry.bottomResist,
    ur: entry.upperResist,
    bo: entry.breakout,
    ls: entry.lastScanAt,
    st: entry.status
  }
}

function loadResultCache() {
  try {
    const stored = localStorage.getItem(VOLUME_RESULT_CACHE_KEY)
    const parsed = stored ? JSON.parse(stored) : {}
    if (!parsed || typeof parsed !== 'object') return {}

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([symbol, data]) => [symbol, normalizeCachedResult(data)])
        .filter(([, value]) => value != null)
    )
  } catch (error) {
    console.error('Failed to load volume result cache:', error)
    return {}
  }
}

function saveResultCache(cache) {
  const compressCache = (payload) => Object.fromEntries(
    Object.entries(payload || {}).map(([symbol, data]) => [symbol, compressResultEntry(data)])
  )

  const tryPersist = (payload) => safeSetItem(VOLUME_RESULT_CACHE_KEY, JSON.stringify(compressCache(payload)))

  if (tryPersist(cache)) return

  // Fall back to a lighter payload (without legends) if quota is exceeded.
  const trimmedLegends = Object.fromEntries(
    Object.entries(cache).map(([symbol, value]) => {
      const { volumeLegend, ...rest } = value || {}
      return [symbol, rest]
    })
  )

  if (tryPersist(trimmedLegends)) return

  // As a last resort, keep only the most recently scanned items and attempt to persist again.
  const sortedByRecency = Object.entries(trimmedLegends).sort(([, a], [, b]) => {
    const aTime = new Date(a?.lastScanAt || 0).getTime()
    const bTime = new Date(b?.lastScanAt || 0).getTime()
    return bTime - aTime
  })

  for (let keep = Math.min(sortedByRecency.length, 100); keep > 0; keep--) {
    const subset = Object.fromEntries(sortedByRecency.slice(0, keep))
    if (tryPersist(subset)) return
  }

  // If persisting still fails, clear the stored cache to avoid repeated quota errors.
  try {
    console.warn('Clearing cached volume results after repeated persistence failures')
    localStorage.removeItem(VOLUME_RESULT_CACHE_KEY)
  } catch (error) {
    console.error('Failed to clear result cache after quota issues:', error)
  }
}

function loadTopSymbolCache() {
  try {
    const stored = localStorage.getItem(TOP_SYMBOL_CACHE_KEY)
    if (!stored) return null

    const parsed = JSON.parse(stored)
    if (!parsed || !Array.isArray(parsed.symbols) || !parsed.cachedAt) return null

    const cachedAt = new Date(parsed.cachedAt).getTime()
    if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > TOP_SYMBOL_TTL_MS) {
      return null
    }

    return parsed.symbols
  } catch (error) {
    console.error('Failed to load top symbol cache:', error)
    return null
  }
}

function saveTopSymbolCache(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) return
  safeSetItem(
    TOP_SYMBOL_CACHE_KEY,
    JSON.stringify({
      symbols,
      cachedAt: new Date().toISOString()
    })
  )
}

function clearResultCache() {
  try {
    localStorage.removeItem(VOLUME_RESULT_CACHE_KEY)
  } catch (error) {
    console.error('Failed to clear volume result cache:', error)
  }
}

function removeResultFromCache(symbol) {
  if (!symbol) return
  try {
    const cache = loadResultCache()
    if (cache && cache[symbol]) {
      delete cache[symbol]
      saveResultCache(cache)
    }
  } catch (error) {
    console.error('Failed to remove cached result:', error)
  }
}

function getSlotColor(weight) {
  const colorStops = [
    { weight: 0, color: [254, 249, 195] },    // Light yellow
    { weight: 2.5, color: [249, 115, 22] },   // Orange
    { weight: 5, color: [239, 68, 68] },      // Red
    { weight: 10, color: [168, 85, 247] },    // Purple
    { weight: 15, color: [59, 130, 246] },    // Blue
    { weight: 20, color: [34, 197, 94] }      // Green
  ]

  const clampWeight = Math.max(0, Math.min(weight ?? 0, 20))
  const lastStop = colorStops[colorStops.length - 1]

  if (clampWeight >= lastStop.weight) {
    const luminance = (0.299 * lastStop.color[0] + 0.587 * lastStop.color[1] + 0.114 * lastStop.color[2]) / 255
    const textColor = luminance > 0.65 ? '#0f172a' : '#f8fafc'
    return { color: `rgb(${lastStop.color.join(', ')})`, textColor }
  }

  let lowerStop = colorStops[0]
  let upperStop = colorStops[1]

  for (let i = 1; i < colorStops.length; i++) {
    if (clampWeight <= colorStops[i].weight) {
      lowerStop = colorStops[i - 1]
      upperStop = colorStops[i]
      break
    }
  }

  const range = upperStop.weight - lowerStop.weight || 1
  const ratio = Math.min(1, Math.max(0, (clampWeight - lowerStop.weight) / range))
  const mix = (start, end) => Math.round(start + (end - start) * ratio)

  const blended = [
    mix(lowerStop.color[0], upperStop.color[0]),
    mix(lowerStop.color[1], upperStop.color[1]),
    mix(lowerStop.color[2], upperStop.color[2])
  ]

  const luminance = (0.299 * blended[0] + 0.587 * blended[1] + 0.114 * blended[2]) / 255
  const textColor = luminance > 0.65 ? '#0f172a' : '#f8fafc'

  return { color: `rgb(${blended.join(', ')})`, textColor }
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

function findPreviousDistinctSlot(prices, slots, currentSlotIndex) {
  for (let i = prices.length - 2; i >= 0; i -= 1) {
    const price = prices[i]
    const refPrice = price.close ?? price.high ?? price.low
    const candidateIdx = findSlotIndex(slots, refPrice)
    if (candidateIdx >= 0 && candidateIdx !== currentSlotIndex) {
      return { price: refPrice, slotIndex: candidateIdx }
    }
  }

  return { price: null, slotIndex: -1 }
}

function buildVolumeSlots(prices) {
  if (!Array.isArray(prices) || prices.length === 0) {
    return { slots: [], lastPrice: null, previousPrice: null, currentSlotIndex: -1, previousSlotIndex: -1 }
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
  const currentSlotIndex = findSlotIndex(slots, lastPrice)

  const { price: previousPrice, slotIndex: previousSlotIndex } =
    findPreviousDistinctSlot(sorted, slots, currentSlotIndex)

  return { slots, lastPrice, previousPrice, currentSlotIndex, previousSlotIndex }
}

function buildLegend(slots, currentIndex) {
  if (!Array.isArray(slots) || slots.length === 0) return []

  // When currentIndex < 0, show a centered window of slots
  const hasCurrentIndex = currentIndex >= 0
  const anchorIndex = hasCurrentIndex ? currentIndex : Math.floor(slots.length / 2)

  const startIndex = Math.max(0, anchorIndex - 5)
  const endIndex = Math.min(slots.length - 1, anchorIndex + 5)
  const selected = slots.slice(startIndex, endIndex + 1)
  return selected.map((slot, idx) => ({
    ...slot,
    legendIndex: startIndex + idx,
    label: `${slot.weight.toFixed(1)}%`,
    ...getSlotColor(slot.weight),
    isCurrent: hasCurrentIndex && (startIndex + idx === currentIndex)
  }))
}

// Break logic:
// - Find the closest slot on the prior date; if it is lower, check up to five slots below the current range.
//   A break is flagged when any of those slots differs from the current weight by ≥5 percentage points.
// - If the prior slot is higher, do the same check on up to five slots above the current range.
// - If the prior slot is the same or unavailable, no break is reported.
// - Returns the direction of the break ("up" | "down") or null when no break is detected.
function detectBreakout(slots, currentIndex, lastPrice, previousPrice) {
  if (!Array.isArray(slots) || slots.length === 0 || currentIndex < 0 || lastPrice == null) return null
  const currentSlot = slots[currentIndex]
  const prevIndex = findSlotIndex(slots, previousPrice)

  if (prevIndex < 0 || prevIndex === currentIndex) {
    return null
  }

  const currentWeight = currentSlot.weight
  const targetSlots = []
  const direction = prevIndex < currentIndex ? 'up' : 'down'

  if (direction === 'up') {
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

  const hasBreak = targetSlots.some(slot => Math.abs((slot?.weight ?? 0) - currentWeight) >= 5)
  return hasBreak ? direction : null
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
        start: slot.start,
        end: slot.end,
        range: formatPriceRange(slot.start, slot.end),
        weight: slot.weight
      }
    }
    idx += step
  }

  return null
}

function parseResistanceWeight(resistanceValue) {
  if (typeof resistanceValue !== 'string') return null
  const matches = [...resistanceValue.matchAll(/([-+]?\d*\.?\d+)%/g)]
  if (matches.length === 0) return null

  const target = matches.length >= 2 ? matches[1][1] : matches[0][1]
  const parsed = parseFloat(target)
  return Number.isFinite(parsed) ? Math.abs(parsed) : null
}

function parsePriceRangeMid(rangeValue) {
  if (typeof rangeValue !== 'string') return null
  const match = rangeValue.replaceAll(',', '').match(/\$?(-?\d*\.?\d+)\s*-\s*\$?(-?\d*\.?\d+)/)
  if (!match) return null

  const start = parseFloat(match[1])
  const end = parseFloat(match[2])
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null

  return (start + end) / 2
}

function getCurrentVolumeWeight(entry) {
  const currentSlot = entry?.volumeLegend?.find(slot => slot?.isCurrent)
  const weight = currentSlot?.weight
  return Number.isFinite(weight) ? weight : null
}

function getNeighborVolumeDiff(entry, direction = 'up') {
  const legend = Array.isArray(entry?.volumeLegend) ? entry.volumeLegend : []
  const currentIdx = legend.findIndex(slot => slot?.isCurrent)
  if (currentIdx === -1) return null

  const neighborIdx = direction === 'up' ? currentIdx + 1 : currentIdx - 1
  const neighbor = legend[neighborIdx]
  const current = legend[currentIdx]

  if (!neighbor || !Number.isFinite(neighbor?.weight) || !Number.isFinite(current?.weight)) {
    return null
  }

  return {
    diff: neighbor.weight - current.weight,
    current,
    neighbor
  }
}

function getPreviousSlotComparison(entry) {
  const current = entry?.currentRange
  const previous = entry?.previousRange

  if (!current || !previous) return null

  const weightsValid = Number.isFinite(current.weight) && Number.isFinite(previous.weight)
  const currentMid = (Number(current.start) + Number(current.end)) / 2
  const previousMid = (Number(previous.start) + Number(previous.end)) / 2
  const midsValid = Number.isFinite(currentMid) && Number.isFinite(previousMid)

  if (!weightsValid && !midsValid) return null

  const weightDiff = weightsValid ? current.weight - previous.weight : null
  const priceDiff = midsValid ? currentMid - previousMid : null
  const pricePct = midsValid && previousMid !== 0 ? (priceDiff / previousMid) * 100 : null

  return {
    weightDiff,
    priceDiff,
    pricePct,
    current,
    previous
  }
}

function getPreviousSlotPricePctMagnitude(entry) {
  const comparison = getPreviousSlotComparison(entry)
  if (!comparison) return null

  const { pricePct } = comparison
  return Number.isFinite(pricePct) ? Math.abs(pricePct) : null
}

function formatPreviousSlotDiff(entry) {
  const comparison = getPreviousSlotComparison(entry)
  if (!comparison) return '—'

  const { weightDiff, pricePct, priceDiff } = comparison
  const weightLabel = Number.isFinite(weightDiff)
    ? `${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(1)}%`
    : '—'

  const priceLabel = Number.isFinite(pricePct)
    ? `${pricePct > 0 ? '+' : ''}${pricePct.toFixed(1)}%`
    : Number.isFinite(priceDiff)
      ? `${priceDiff > 0 ? '+' : ''}$${Math.abs(priceDiff).toFixed(2)}`
      : '—'

  return `${weightLabel} | ${priceLabel}`
}

function getPreviousSlotClass(entry) {
  const comparison = getPreviousSlotComparison(entry)
  if (!comparison) return ''

  const weightFlag = Number.isFinite(comparison.weightDiff) && Math.abs(comparison.weightDiff) > 5
  const priceFlag = Number.isFinite(comparison.pricePct) && Math.abs(comparison.pricePct) > 5

  return weightFlag || priceFlag ? 'text-amber-300 font-semibold' : ''
}

function getPreviousSlotTooltip(entry) {
  const comparison = getPreviousSlotComparison(entry)
  if (!comparison) return undefined

  const { current, previous, weightDiff, priceDiff, pricePct } = comparison
  const weightPart = Number.isFinite(weightDiff)
    ? `${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(1)}%`
    : '—'
  const pricePart = Number.isFinite(priceDiff)
    ? `${priceDiff > 0 ? '+' : ''}${priceDiff.toFixed(2)}`
    : '—'
  const pricePctPart = Number.isFinite(pricePct)
    ? ` (${pricePct > 0 ? '+' : ''}${pricePct.toFixed(1)}%)`
    : ''

  return `Prev ${formatPriceRange(previous.start, previous.end)} @ ${previous.weight?.toFixed(1) ?? '—'}% → Current ${formatPriceRange(current.start, current.end)} @ ${current.weight?.toFixed(1) ?? '—'}% | ΔVol ${weightPart} • ΔPx ${pricePart}${pricePctPart}`
}

function formatVolumeDiff(entry, direction = 'up') {
  const result = getNeighborVolumeDiff(entry, direction)
  if (!result) return undefined

  const sign = result.diff > 0 ? '+' : ''
  return `${sign}${result.diff.toFixed(1)}%`
}

function getVolumeDiffClass(entry, direction = 'up') {
  const diff = getNeighborVolumeDiff(entry, direction)?.diff
  if (diff == null) return ''

  const magnitude = Math.abs(diff)

  if (magnitude > 15) return 'text-rose-400 font-bold'
  if (magnitude > 10) return 'text-red-400 font-bold'
  if (magnitude > 8) return 'text-orange-400 font-semibold'
  if (magnitude > 6) return 'text-amber-300 font-semibold'

  return ''
}

function getVolumeDiffTooltip(entry, direction = 'up') {
  const result = getNeighborVolumeDiff(entry, direction)
  if (!result) return undefined

  const neighborRange = formatPriceRange(result.neighbor.start, result.neighbor.end)
  const currentRange = formatPriceRange(result.current.start, result.current.end)
  const directionLabel = direction === 'up' ? 'next upper' : 'next lower'
  return `${directionLabel} slot ${neighborRange} @ ${result.neighbor.weight.toFixed(1)}% versus current ${currentRange} @ ${result.current.weight.toFixed(1)}%`
}

function meetsPotentialBreakCriteria(entry) {
  const currentWeight = getCurrentVolumeWeight(entry)
  const prevComparison = getPreviousSlotComparison(entry)
  const lowerDiff = getNeighborVolumeDiff(entry, 'down')?.diff
  const upperDiff = getNeighborVolumeDiff(entry, 'up')?.diff

  const hasLowCurrentWeight = currentWeight != null && currentWeight < 6
  const hasPrevWeightDrop = Number.isFinite(prevComparison?.weightDiff) && prevComparison.weightDiff < -6
  const prevPricePct = prevComparison?.pricePct

  const hasBreakUpPattern =
    lowerDiff != null &&
    lowerDiff > 6 &&
    upperDiff != null &&
    upperDiff < 0 &&
    Number.isFinite(prevPricePct) &&
    prevPricePct < 0

  const hasBreakDownPattern =
    upperDiff != null &&
    upperDiff > 6 &&
    lowerDiff != null &&
    lowerDiff < 0 &&
    Number.isFinite(prevPricePct) &&
    prevPricePct > 0

  return hasLowCurrentWeight && hasPrevWeightDrop && (hasBreakUpPattern || hasBreakDownPattern)
}

function isAbnormalVolumeWeight(entry) {
  const weight = getCurrentVolumeWeight(entry)
  return weight != null && weight > ABNORMAL_VOLUME_WEIGHT_THRESHOLD
}

function calculatePercentGap(currentRange, targetRange) {
  if (!currentRange || !targetRange) return null

  const currentStart = Number(currentRange.start)
  const currentEnd = Number(currentRange.end)
  const targetStart = Number(targetRange.start)
  const targetEnd = Number(targetRange.end)

  if (!Number.isFinite(currentStart) || !Number.isFinite(currentEnd) || !Number.isFinite(targetStart) || !Number.isFinite(targetEnd)) {
    return null
  }

  const currentMid = (currentStart + currentEnd) / 2
  if (!Number.isFinite(currentMid) || currentMid === 0) return null

  let gap = 0
  let direction = 0

  if (targetStart > currentEnd) {
    gap = targetStart - currentEnd
    direction = 1
  } else if (targetEnd < currentStart) {
    gap = currentStart - targetEnd
    direction = -1
  }

  const diff = (gap / currentMid) * 100 * (direction || 0)
  return diff
}

function formatResistance(currentRange, resistance) {
  if (!resistance || !currentRange) return '—'
  const diff = calculatePercentGap(currentRange, resistance)
  if (diff == null) return '—'

  const sign = diff > 0 ? '+' : ''
  return `${resistance.range} (${sign}${diff.toFixed(1)}%)`
}

function VolumeScreening({ onStockSelect, triggerSymbol, onSymbolProcessed, onBacktestSelect, onV3BacktestSelect, bulkImport, onImportProcessed }) {
  const [symbolInput, setSymbolInput] = useState('')
  const [period, setPeriod] = useState('1825')
  const [stockHistory, setStockHistory] = useState([])
  const [entries, setEntries] = useState([])
  const [loadingTopSymbols, setLoadingTopSymbols] = useState(false)
  const [loadingHKSymbols, setLoadingHKSymbols] = useState(false)
  const [loadingCNSymbols, setLoadingCNSymbols] = useState(false)
  const [scanQueue, setScanQueue] = useState([])
  const [isScanning, setIsScanning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [scanTotal, setScanTotal] = useState(0)
  const [scanCompleted, setScanCompleted] = useState(0)
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false)
  const [showUpBreakOnly, setShowUpBreakOnly] = useState(false)
  const [showDownBreakOnly, setShowDownBreakOnly] = useState(false)
  const [showPotentialBreakOnly, setShowPotentialBreakOnly] = useState(false)
  const [selectedMarkets, setSelectedMarkets] = useState([])
  const [selectedPeriods, setSelectedPeriods] = useState([])
  const [searchFilter, setSearchFilter] = useState('')
  const [sortConfig, setSortConfig] = useState(defaultSortConfig)
  const [stableRowOrder, setStableRowOrder] = useState([])
  const [hasHydratedCache, setHasHydratedCache] = useState(false)
  const [lastAddedId, setLastAddedId] = useState(null)
  const activeScanIdRef = useRef(null)
  const importInputRef = useRef(null)
  const tableScrollRef = useRef(null)
  const previousSortRef = useRef(sortConfig)

  const baseEntryState = {
    priceRange: '—',
    currentRange: null,
    previousRange: null,
    previousPriceRange: '—',
    testedDays: '—',
    slotCount: '—',
    volumeLegend: [],
    bottomResist: '—',
    upperResist: '—',
    breakout: '—',
    status: 'idle',
    error: null,
    lastScanAt: null
  }

  const clearEntryResults = (entry) => ({
    ...entry,
    ...baseEntryState
  })

  const clearAllEntries = () => {
    clearResultCache()
    activeScanIdRef.current = null
    setIsScanning(false)
    setIsPaused(false)
    setScanTotal(0)
    setScanCompleted(0)
    setScanQueue([])
    setEntries(prev => prev.map(entry => clearEntryResults(entry)))
  }

  const removeAllRows = () => {
    activeScanIdRef.current = null
    setIsScanning(false)
    setIsPaused(false)
    setScanTotal(0)
    setScanCompleted(0)
    setScanQueue([])
    setEntries([])
  }

  const isEntryFresh = (entry) => {
    if (!entry?.lastScanAt || entry.status !== 'ready') return false
    const scannedAt = new Date(entry.lastScanAt).getTime()
    return Number.isFinite(scannedAt) && Date.now() - scannedAt < CACHE_TTL_MS
  }

  const isRecentScan = (timestamp, thresholdMinutes = 60) => {
    if (!timestamp) return false
    const scannedAt = new Date(timestamp).getTime()
    return Number.isFinite(scannedAt) && Date.now() - scannedAt < thresholdMinutes * 60 * 1000
  }

  const isRecentlyScanned = (entry, thresholdMs = RECENT_SCAN_THRESHOLD_MS) => {
    if (!entry?.lastScanAt || entry.status !== 'ready') return false
    const scannedAt = new Date(entry.lastScanAt).getTime()
    return Number.isFinite(scannedAt) && Date.now() - scannedAt < thresholdMs
  }

  const isScanStale = (timestamp, thresholdMs = RECENT_SCAN_THRESHOLD_MS) => {
    if (!timestamp) return false
    const scannedAt = new Date(timestamp).getTime()
    return Number.isFinite(scannedAt) && Date.now() - scannedAt >= thresholdMs
  }

  const hydrateFromResultCache = (symbol, period) => {
    const cache = loadResultCache()
    const cacheKey = `${symbol}-${period}`
    const cached = cache?.[cacheKey]
    if (!cached) return null

    const hydrated = { ...baseEntryState, ...cached, symbol, period, status: cached.status || 'ready' }
    if (!isEntryFresh(hydrated)) return null
    return isAbnormalVolumeWeight(hydrated) ? null : hydrated
  }

  const persistReadyResults = (list) => {
    const cache = {}

    list.forEach(entry => {
      if (entry.status === 'ready' && isEntryFresh(entry)) {
        if (isAbnormalVolumeWeight(entry)) return
        const { id, symbol, period, ...rest } = entry
        const cacheKey = `${symbol}-${period}`

        // Determine if this entry should have full cache
        const isUpBreak = rest.breakout === 'Up'
        const isDownBreak = rest.breakout === 'Down'
        const isPotential = meetsPotentialBreakCriteria(rest)
        const isBookmarked = rest.bookmarked || false

        // Full cache for: bookmarked OR up/down break OR potential break
        const shouldCacheFull = isBookmarked || isUpBreak || isDownBreak || isPotential

        if (shouldCacheFull) {
          // Keep all fields for important entries (excluding identifiers)
          cache[cacheKey] = {
            ...rest,
            bookmarked: isBookmarked
          }
        } else {
          // Slim cache: only essential fields for non-important entries
          cache[cacheKey] = {
            lastScanAt: rest.lastScanAt,
            status: rest.status,
            bookmarked: isBookmarked
          }
        }
      }
    })

    saveResultCache(cache)
  }

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
    const loadCache = async () => {
      const savedEntries = localStorage.getItem(VOLUME_CACHE_KEY)
      if (savedEntries) {
        try {
          const parsed = JSON.parse(savedEntries)
          if (Array.isArray(parsed)) {
            const hydrated = parsed
              .filter(item => !isDisallowedSymbol(item?.symbol))
              .map(item => {
                const cached = hydrateFromResultCache(item.symbol, item.period)
                const merged = { ...baseEntryState, bookmarked: !!item.bookmarked, ...item, ...(cached || {}) }
                if (isAbnormalVolumeWeight(merged)) return null
                return isEntryFresh(merged) ? merged : clearEntryResults(merged)
              })
            const cleanedEntries = hydrated.filter(Boolean)
            if (cleanedEntries.length > 0) {
              setEntries(cleanedEntries)
              setHasHydratedCache(true)
              return
            }
          }
        } catch (error) {
          console.error('Failed to load cached volume entries:', error)
        }
      }

      try {
        const savedSymbolsRaw = localStorage.getItem(VOLUME_SYMBOLS_KEY)
        if (!savedSymbolsRaw) {
          setHasHydratedCache(true)
          return
        }

        const symbols = JSON.parse(savedSymbolsRaw)
        if (!Array.isArray(symbols)) {
          setHasHydratedCache(true)
          return
        }

        const cleanedSymbols = Array.from(
          new Set(
            symbols
              .filter(symbol => typeof symbol === 'string' && symbol.trim())
              .map(symbol => symbol.toUpperCase())
              .filter(symbol => !isDisallowedSymbol(symbol))
          )
        )
        if (cleanedSymbols.length === 0) {
          setHasHydratedCache(true)
          return
        }

        setEntries(cleanedSymbols.map(symbol => ({
          id: `${symbol}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          symbol,
          bookmarked: false,
          ...baseEntryState
        })))
      } catch (error) {
        console.error('Failed to load saved volume symbols:', error)
      } finally {
        setHasHydratedCache(true)
      }
    }

    loadCache()
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

  useEffect(() => {
    const leanEntries = entries.map(entry => {
      const { id, symbol, status, lastScanAt, bookmarked } = entry
      const resultFields = isEntryFresh(entry)
        ? {
          priceRange: entry.priceRange,
          currentRange: entry.currentRange,
          previousRange: entry.previousRange,
          previousPriceRange: entry.previousPriceRange,
          testedDays: entry.testedDays,
          slotCount: entry.slotCount,
          volumeLegend: entry.volumeLegend,
          bottomResist: entry.bottomResist,
          upperResist: entry.upperResist,
          breakout: entry.breakout
        }
        : {}

      return {
        id,
        symbol,
        period: entry.period,
        periodDisplay: entry.periodDisplay,
        status,
        lastScanAt,
        bookmarked: !!bookmarked,
        ...resultFields
      }
    })

    safeSetItem(VOLUME_CACHE_KEY, JSON.stringify(leanEntries))
    safeSetItem(VOLUME_SYMBOLS_KEY, JSON.stringify(entries.map(entry => entry.symbol).filter(Boolean)))
    persistReadyResults(entries)
  }, [entries])

  // Handle trigger symbol from backtest results
  useEffect(() => {
    if (!triggerSymbol) return

    const triggerDays = typeof triggerSymbol === 'object' && triggerSymbol !== null && triggerSymbol.days != null
      ? String(triggerSymbol.days)
      : null

    const rawSymbol = typeof triggerSymbol === 'object' && triggerSymbol !== null
      ? triggerSymbol.symbol
      : triggerSymbol

    const normalizedSymbol = processStockSymbol(rawSymbol || '') || rawSymbol || triggerSymbol
    const targetPeriod = triggerDays || period

    // Keep UI period selection in sync with triggered period
    if (triggerDays && `${period}` !== `${triggerDays}`) {
      setPeriod(String(triggerDays))
    }

    if (!normalizedSymbol) {
      if (onSymbolProcessed) {
        onSymbolProcessed()
      }
      return
    }

    // Check if symbol already exists in entries
    const existingEntry = entries.find(entry =>
      entry.symbol === normalizedSymbol && (!triggerDays || `${entry.period}` === triggerDays)
    )

    if (existingEntry) {
      // Symbol exists, trigger scan for it
      const loadingEntry = {
        ...existingEntry,
        period: existingEntry.period ?? targetPeriod,
        periodDisplay: existingEntry.periodDisplay || formatPeriod(targetPeriod),
        status: 'loading',
        error: null
      }
      setEntries(prev => prev.map(entry =>
        entry.id === existingEntry.id ? loadingEntry : entry
      ))
      setScanQueue([loadingEntry])
      setScanTotal(1)
      setScanCompleted(0)
      setIsScanning(true)
      setIsPaused(false)
      activeScanIdRef.current = null

      setTimeout(() => {
        setLastAddedId(existingEntry.id)
      }, 120)
    } else {
      // Symbol doesn't exist, add it to the top and trigger scan
      const newEntry = {
        id: `${normalizedSymbol}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        symbol: normalizedSymbol,
        period: targetPeriod,
        periodDisplay: formatPeriod(targetPeriod),
        bookmarked: false,
        ...baseEntryState,
        status: 'loading'
      }
      setEntries(prev => [newEntry, ...prev])
      setScanQueue([newEntry])
      setScanTotal(1)
      setScanCompleted(0)
      setIsScanning(true)
      setIsPaused(false)
      activeScanIdRef.current = null

      setTimeout(() => {
        setLastAddedId(newEntry.id)
      }, 180)
    }

    // Notify parent that symbol has been processed
    if (onSymbolProcessed) {
      onSymbolProcessed()
    }
  }, [triggerSymbol, onSymbolProcessed])

  useEffect(() => {
    if (!bulkImport || !Array.isArray(bulkImport.entries)) return

    if (bulkImport.entries.length > 0) {
      mergeSymbolPeriodEntries(bulkImport.entries)
    }

    if (onImportProcessed) {
      onImportProcessed()
    }
  }, [bulkImport, onImportProcessed])

  const saveToHistory = (symbols) => {
    if (!Array.isArray(symbols) || symbols.length === 0) return
    const uniqueSymbols = Array.from(new Set(symbols.filter(Boolean)))
    const updatedHistory = [...uniqueSymbols, ...stockHistory.filter(s => !uniqueSymbols.includes(s))].slice(0, 10)
    setStockHistory(updatedHistory)
    safeSetItem(STOCK_HISTORY_KEY, JSON.stringify(updatedHistory))
    window.dispatchEvent(new CustomEvent('stockHistoryUpdated', { detail: updatedHistory }))
  }

  const mergeSymbolsIntoEntries = (symbols, { persistHistory = false } = {}) => {
    if (!Array.isArray(symbols) || symbols.length === 0) return

    const allowedSymbols = symbols.filter(symbol => !isDisallowedSymbol(symbol))
    if (allowedSymbols.length === 0) return

    let firstNewId = null

    setEntries(prevEntries => {
      // Use symbol+period combination as unique key (filter out entries without period)
      const existingKeys = new Set(
        prevEntries
          .filter(e => e.period != null)
          .map(e => getEntryKey(e.symbol, e.period))
      )

      const newEntries = []

      allowedSymbols.forEach(symbol => {
        const entryKey = getEntryKey(symbol, period)
        if (!existingKeys.has(entryKey)) {
          const cached = hydrateFromResultCache(symbol, period)
          const newId = `${symbol}-${period}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
          if (!firstNewId) {
            firstNewId = newId
          }
          newEntries.push({
            id: newId,
            symbol,
            period,
            periodDisplay: formatPeriod(period),
            bookmarked: false,
            ...(cached || baseEntryState)
          })
          existingKeys.add(entryKey)
        }
      })

      if (newEntries.length === 0) return prevEntries

      // New entries should appear at the top of the table
      return [...newEntries, ...prevEntries]
    })

    if (persistHistory) {
      saveToHistory(symbols)
    }

    // Return firstNewId so caller can trigger scroll after state updates
    return firstNewId
  }

  const mergeSymbolPeriodEntries = (items) => {
    if (!Array.isArray(items) || items.length === 0) return

    let firstNewId = null

    setEntries(prevEntries => {
      const existingKeys = new Set(
        prevEntries
          .filter(e => e.period != null)
          .map(e => getEntryKey(e.symbol, e.period))
      )

      const newEntries = []

      items.forEach(item => {
        if (!item) return

        const normalizedSymbol = processStockSymbol(item.symbol || '')
        const targetPeriod = item.days ?? item.period ?? period

        if (!normalizedSymbol || targetPeriod == null || isDisallowedSymbol(normalizedSymbol)) return

        const normalizedPeriod = String(targetPeriod)
        const entryKey = getEntryKey(normalizedSymbol, normalizedPeriod)

        if (existingKeys.has(entryKey)) return

        const cached = hydrateFromResultCache(normalizedSymbol, normalizedPeriod)
        const newId = `${normalizedSymbol}-${normalizedPeriod}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
        if (!firstNewId) {
          firstNewId = newId
        }

        newEntries.push({
          id: newId,
          symbol: normalizedSymbol,
          period: normalizedPeriod,
          periodDisplay: formatPeriod(normalizedPeriod),
          bookmarked: false,
          ...(cached || baseEntryState)
        })

        existingKeys.add(entryKey)
      })

      if (newEntries.length === 0) return prevEntries

      return [...newEntries, ...prevEntries]
    })

    if (firstNewId) {
      setTimeout(() => {
        setLastAddedId(firstNewId)
      }, 150)
    }
  }

  const dropInvalidScanSymbols = (currentEntries) => {
    const invalidIds = new Set(
      currentEntries
        .filter(entry => isDisallowedSymbol(entry.symbol))
        .map(entry => entry.id)
    )

    if (invalidIds.size === 0) return currentEntries

    currentEntries
      .filter(entry => invalidIds.has(entry.id))
      .forEach(entry => removeResultFromCache(entry.symbol))

    const cleaned = currentEntries.filter(entry => !invalidIds.has(entry.id))

    setEntries(cleaned)
    setScanQueue(prev => prev.filter(item => !invalidIds.has(item.id)))

    return cleaned
  }

  const addSymbols = () => {
    const symbols = parseStockSymbols(symbolInput)
    const allowedSymbols = symbols.filter(symbol => !isDisallowedSymbol(symbol))
    if (allowedSymbols.length === 0) return

    // Get existing entries before adding new ones
    const existingKeys = new Set(
      entries
        .filter(e => e.period != null)
        .map(e => getEntryKey(e.symbol, e.period))
    )

    // Filter to only new symbols that don't exist with current period
    const newSymbols = allowedSymbols.filter(symbol =>
      !existingKeys.has(getEntryKey(symbol, period))
    )

    // Check if any symbols already exist (for scrolling to existing)
    const existingSymbols = allowedSymbols.filter(symbol =>
      existingKeys.has(getEntryKey(symbol, period))
    )

    const firstNewId = mergeSymbolsIntoEntries(allowedSymbols, { persistHistory: true })
    console.log('[VolumeScreening] addSymbols - firstNewId:', firstNewId, 'newSymbols:', newSymbols, 'existingSymbols:', existingSymbols)
    setSymbolInput('')

    // Automatically scan newly added symbols
    if (newSymbols.length > 0) {
      // Small delay to ensure entries are added to state
      setTimeout(() => {
        setEntries(prev => {
          const updatedEntries = prev.map(entry => {
            if (newSymbols.includes(entry.symbol) && entry.period === period) {
              return { ...entry, status: 'loading', error: null }
            }
            return entry
          })

          // Add new entries to scan queue
          const newScanEntries = updatedEntries.filter(entry =>
            newSymbols.includes(entry.symbol) && entry.period === period && entry.status === 'loading'
          )

          if (newScanEntries.length > 0) {
            setScanQueue(prev => [...prev, ...newScanEntries])
            setScanTotal(total => total + newScanEntries.length)
            setIsScanning(true)
            setIsPaused(false)
          }

          return updatedEntries
        })

        // Trigger scroll after entries are updated and rendered
        if (firstNewId) {
          console.log('[VolumeScreening] Setting lastAddedId to:', firstNewId)
          setTimeout(() => {
            setLastAddedId(firstNewId)
          }, 150)
        }
      }, 50)
    } else if (firstNewId) {
      // If no scan needed but entry was added, still trigger scroll
      console.log('[VolumeScreening] No scan needed, setting lastAddedId to:', firstNewId)
      setTimeout(() => {
        setLastAddedId(firstNewId)
      }, 200)
    } else if (existingSymbols.length > 0) {
      // Stock already exists - scroll to the existing entry
      console.log('[VolumeScreening] Stock already exists, scrolling to existing entry')
      const existingEntry = entries.find(e =>
        existingSymbols.includes(e.symbol) && e.period === period
      )
      if (existingEntry) {
        console.log('[VolumeScreening] Found existing entry:', existingEntry.id)
        setTimeout(() => {
          setLastAddedId(existingEntry.id)
        }, 100)
      }
    }
  }

  const loadTopSymbols = async () => {
    if (loadingTopSymbols) return

    setLoadingTopSymbols(true)
    try {
      const cachedSymbols = loadTopSymbolCache()
      let symbols = cachedSymbols

      if (!symbols) {
        const response = await axios.get(joinUrl(API_URL, '/top-market-cap'), {
          params: { limit: 2000 }
        })

        const payload = response.data
        symbols = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.symbols)
            ? payload.symbols
            : []
      }

      const normalized = symbols
        .map(item => (typeof item === 'string' ? item : item?.symbol))
        .filter(Boolean)
        .map(symbol => symbol.toUpperCase())

      if (!cachedSymbols && normalized.length > 0) {
        saveTopSymbolCache(normalized)
      }

      mergeSymbolsIntoEntries(normalized)
    } catch (error) {
      console.error('Failed to load top market cap symbols', error)
    } finally {
      setLoadingTopSymbols(false)
    }
  }

  const loadTopHKSymbols = async () => {
    if (loadingHKSymbols) return

    setLoadingHKSymbols(true)
    try {
      const response = await axios.get(joinUrl(API_URL, '/top-market-cap'), {
        params: { limit: 500, exchange: 'HKG' }
      })

      console.log('[HK500] API Response:', response.data)

      const payload = response.data
      const symbols = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.symbols)
          ? payload.symbols
          : []

      console.log('[HK500] Raw symbols count:', symbols.length)
      console.log('[HK500] First 10 symbols:', symbols.slice(0, 10))

      const normalized = symbols
        .map(item => (typeof item === 'string' ? item : item?.symbol))
        .filter(Boolean)
        .map(symbol => symbol.toUpperCase())
        .filter(symbol => !/^4\d{3}\.HK$/.test(symbol))

      console.log('[HK500] Normalized symbols count:', normalized.length)
      console.log('[HK500] First 10 normalized:', normalized.slice(0, 10))

      if (normalized.length > 0) {
        mergeSymbolsIntoEntries(normalized)
      } else {
        console.warn('[HK500] No symbols returned from API')
      }
    } catch (error) {
      console.error('Failed to load top HK market cap symbols', error)
    } finally {
      setLoadingHKSymbols(false)
    }
  }

  const loadTopCNSymbols = async () => {
    if (loadingCNSymbols) return

    setLoadingCNSymbols(true)
    try {
      const response = await axios.get(joinUrl(API_URL, '/top-market-cap'), {
        params: { limit: 400, exchange: 'CN' }
      })

      console.log('[CN500] API Response:', response.data)

      const payload = response.data
      const symbols = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.symbols)
          ? payload.symbols
          : []

      console.log('[CN500] Raw symbols count:', symbols.length)
      console.log('[CN500] First 10 symbols:', symbols.slice(0, 10))

      const normalized = symbols
        .map(item => (typeof item === 'string' ? item : item?.symbol))
        .filter(Boolean)
        .map(symbol => symbol.toUpperCase())
        .filter(symbol => !/^3\d{5}\.(SZ|SS)$/.test(symbol))

      console.log('[CN500] Normalized symbols count:', normalized.length)
      console.log('[CN500] First 10 normalized:', normalized.slice(0, 10))

      if (normalized.length > 0) {
        mergeSymbolsIntoEntries(normalized)
      } else {
        console.warn('[CN500] No symbols returned from API')
      }
    } catch (error) {
      console.error('Failed to load top CN market cap symbols', error)
    } finally {
      setLoadingCNSymbols(false)
    }
  }

  const scanEntries = async () => {
    const cleanedEntries = dropInvalidScanSymbols(entries)
    if (cleanedEntries.length === 0 || isScanning) return

    const refreshedEntries = cleanedEntries.map(entry => clearEntryResults(entry))
    const loadingEntries = refreshedEntries.map(entry => ({ ...entry, status: 'loading', error: null }))

    setEntries(loadingEntries)
    setScanQueue(loadingEntries)
    setScanTotal(loadingEntries.length)
    setScanCompleted(0)
    setIsScanning(true)
    setIsPaused(false)
    activeScanIdRef.current = null
  }

  const performScan = async (entry) => {
    try {
      const response = await axios.get(joinUrl(API_URL, '/analyze'), {
        params: {
          symbol: entry.symbol,
          days: entry.period
        }
      })

      const prices = response.data?.prices || []
      const hasVolume = prices.some(price => Number(price?.volume) > 0)

      if (!hasVolume) {
        return {
          ...entry,
          removeRow: true,
          stopAll: false
        }
      }

      const { slots, lastPrice, previousPrice, currentSlotIndex, previousSlotIndex } = buildVolumeSlots(prices)
      const slotIndex = currentSlotIndex >= 0 ? currentSlotIndex : findSlotIndex(slots, lastPrice)
      const currentRange = slotIndex >= 0 ? slots[slotIndex] : null
      const previousRange = previousSlotIndex >= 0 ? slots[previousSlotIndex] : null
      const legend = buildLegend(slots, slotIndex)
      const breakout = detectBreakout(slots, slotIndex, lastPrice, previousPrice)
      const bottomResist = findResistance(slots, slotIndex, 'down')
      const upperResist = findResistance(slots, slotIndex, 'up')

      // Get the last data point date (most recent date - prices are in reverse chronological order)
      const lastDataDate = prices.length > 0 ? prices[0].date : null

      if (isStaleDataDate(lastDataDate)) {
        return {
          ...entry,
          removeRow: true,
          stopAll: false
        }
      }

      if (Number.isFinite(currentRange?.weight) && currentRange.weight > ABNORMAL_VOLUME_WEIGHT_THRESHOLD) {
        return {
          ...entry,
          removeRow: true,
          stopAll: false
        }
      }

      return {
        ...entry,
        priceRange: currentRange ? formatPriceRange(currentRange.start, currentRange.end) : '—',
        currentRange: currentRange ? { start: currentRange.start, end: currentRange.end, weight: currentRange.weight } : null,
        previousRange: previousRange
          ? { start: previousRange.start, end: previousRange.end, weight: previousRange.weight }
          : null,
        previousPriceRange: previousRange ? formatPriceRange(previousRange.start, previousRange.end) : '—',
        testedDays: entry.period,
        slotCount: slots.length,
        volumeLegend: legend,
        bottomResist: formatResistance(currentRange, bottomResist),
        upperResist: formatResistance(currentRange, upperResist),
        breakout: breakout ? (breakout === 'up' ? 'Up' : 'Down') : '—',
        lastDataDate,
        lastScanAt: new Date().toISOString(),
        status: 'ready',
        error: null,
        stopAll: false
      }
    } catch (error) {
      console.error('Failed to scan symbol', entry.symbol, error)
      const status = error?.response?.status
      const message = error?.response?.data?.error || error?.message || 'Failed to scan'
      const isNoData =
        status === 404 && typeof message === 'string' && message.includes('No data found for symbol')
      // Treat HTTP failures as stop conditions unless this is the known 404/no-data case,
      // which should simply drop the row and continue.
      const isServerError = typeof status === 'number' && status >= 400 && !isNoData

      return {
        ...entry,
        priceRange: '—',
        slotCount: '—',
        volumeLegend: [],
        bottomResist: '—',
        upperResist: '—',
        breakout: '—',
        lastScanAt: new Date().toISOString(),
        status: 'error',
        error: message,
        stopAll: isServerError,
        removeRow: isNoData
      }
    }
  }

  const removeEntry = (id) => {
    setEntries(prev => prev.filter(entry => entry.id !== id))
    setScanQueue(prev => {
      const filtered = prev.filter(item => item.id !== id)
      const removedCount = prev.length - filtered.length
      if (removedCount > 0) {
        setScanTotal(total => Math.max(0, total - removedCount))
      }
      return filtered
    })
  }

  const clearEntry = (id) => {
    setEntries(prev => prev.map(entry => {
      if (entry.id === id) {
        removeResultFromCache(entry.symbol)
        return clearEntryResults(entry)
      }
      return entry
    }))
    setScanQueue(prev => {
      const filtered = prev.filter(item => item.id !== id)
      const removedCount = prev.length - filtered.length
      if (removedCount > 0) {
        setScanTotal(total => Math.max(0, total - removedCount))
      }
      return filtered
    })
  }

  const toggleBookmark = (id) => {
    setEntries(prev => prev.map(entry => (
      entry.id === id ? { ...entry, bookmarked: !entry.bookmarked } : entry
    )))
  }

  const scanEntryRow = async (id) => {
    const target = entries.find(entry => entry.id === id)
    if (!target) return

    if (isDisallowedSymbol(target.symbol)) {
      removeResultFromCache(target.symbol)
      setEntries(prev => prev.filter(entry => entry.id !== id))
      setScanQueue(prev => prev.filter(item => item.id !== id))
      return
    }

    const prepared = clearEntryResults(target)
    setEntries(prev => prev.map(entry => (
      entry.id === id
        ? { ...prepared, status: 'loading', error: null }
        : entry
    )))

    const result = await performScan(prepared)
    const { stopAll, removeRow, ...entryResult } = result || {}

    if (removeRow) {
      removeResultFromCache(prepared.symbol)
      setEntries(prev => prev.filter(entry => entry.id !== id))
      setScanQueue(prev => prev.filter(item => item.id !== id))
      return
    }

    setEntries(prev => prev.map(entry => (
      entry.id === id
        ? entryResult
        : entry
    )))
    if (stopAll) {
      setScanQueue([])
      setIsScanning(false)
      setIsPaused(false)
      return
    }
    setScanQueue(prev => prev.filter(item => item.id !== id))
  }

  const handleRowClick = (entry) => {
    if (!onStockSelect) return
    onStockSelect(entry.symbol, { days: entry.period, forceVolumeProfileV2: true })
  }

  const handleHistoryClick = (symbol) => {
    setSymbolInput(symbol)
  }

  const togglePauseResume = () => {
    if (!isScanning) return
    setIsPaused(prev => !prev)
  }

  const hasScanResult = (entry) => entry?.status === 'ready' && !!entry?.lastScanAt
  const isPotentialBreak = (entry) => meetsPotentialBreakCriteria(entry)
  const isResistanceClose = (value) => {
    const parsed = parseResistanceWeight(value)
    return parsed != null && parsed < 10
  }

  const matchesBreakFilters = (entry) => {
    const breakout = entry.breakout && entry.breakout !== '—' ? entry.breakout : null

    if (!showUpBreakOnly && !showDownBreakOnly) return true
    if (!breakout) return false

    const matchesUp = showUpBreakOnly && breakout === 'Up'
    const matchesDown = showDownBreakOnly && breakout === 'Down'

    return matchesUp || matchesDown
  }

  const getPeriodTooltip = (entry) => {
    if (!entry) return undefined

    const parts = []
    if (entry.testedDays && entry.testedDays !== '—') {
      parts.push(`${entry.testedDays} days`)
    }

    const slotLabel = Number.isFinite(entry.slotCount)
      ? entry.slotCount
      : Array.isArray(entry.volumeLegend)
        ? entry.volumeLegend.length
        : entry.slotCount

    parts.push(`Slots: ${slotLabel ?? '—'}`)

    return parts.length > 0 ? parts.join(' • ') : undefined
  }

  const getVisibleEntries = (sourceEntries = entries) => sourceEntries.filter(entry => {
    if (showBookmarkedOnly && !entry.bookmarked) return false
    if (showPotentialBreakOnly) {
      if (!hasScanResult(entry)) return false
      if (!isPotentialBreak(entry)) return false
    }
    if (!matchesBreakFilters(entry)) return false
    if (selectedMarkets.length > 0 && !selectedMarkets.includes(extractMarket(entry.symbol))) return false
    if (selectedPeriods.length > 0 && !selectedPeriods.includes(entry.periodDisplay)) return false

    // Support multiple search terms separated by comma or space
    if (searchFilter) {
      const searchTerms = searchFilter
        .split(/[,\s]+/)
        .map(term => term.trim().toUpperCase())
        .filter(term => term.length > 0)

      if (searchTerms.length > 0) {
        const symbolUpper = entry.symbol.toUpperCase()
        const matchesAnyTerm = searchTerms.some(term => symbolUpper === term)
        if (!matchesAnyTerm) return false
      }
    }

    return true
  })

  const filteredEntries = getVisibleEntries()

  // Get unique markets from all entries
  const availableMarkets = Array.from(new Set(entries.map(e => extractMarket(e.symbol)))).sort()

  // Get unique periods from all entries
  const availablePeriods = Array.from(new Set(entries.map(e => e.periodDisplay).filter(Boolean))).sort()

  const toggleMarketFilter = (market) => {
    setSelectedMarkets(prev => {
      if (prev.includes(market)) {
        return prev.filter(m => m !== market)
      } else {
        return [...prev, market]
      }
    })
  }

  const togglePeriodFilter = (period) => {
    setSelectedPeriods(prev => {
      if (prev.includes(period)) {
        return prev.filter(p => p !== period)
      } else {
        return [...prev, period]
      }
    })
  }

  const scrollTableToTop = () => {
    if (!tableScrollRef.current) return
    tableScrollRef.current.scrollTo({ top: 0, behavior: 'auto' })
    tableScrollRef.current.focus({ preventScroll: true })
  }

  const scrollTableToBottom = () => {
    if (!tableScrollRef.current) return
    tableScrollRef.current.scrollTo({ top: tableScrollRef.current.scrollHeight, behavior: 'auto' })
    tableScrollRef.current.focus({ preventScroll: true })
  }

  const isFiltered = filteredEntries.length !== entries.length
  const filteredCount = Math.max(0, entries.length - filteredEntries.length)
  const visibleEntries = filteredEntries

  const compareEntries = (a, b) => {
    if (!sortConfig.field) return 0

    if (sortConfig.field === 'lastScanAt') {
      const timeA = a.lastScanAt ? new Date(a.lastScanAt).getTime() : -Infinity
      const timeB = b.lastScanAt ? new Date(b.lastScanAt).getTime() : -Infinity
      const diff = timeA - timeB
      return sortConfig.direction === 'asc' ? diff : -diff
    }

    if (sortConfig.field === 'symbol') {
      const symbolA = a.symbol?.toUpperCase() || ''
      const symbolB = b.symbol?.toUpperCase() || ''
      const diff = symbolA.localeCompare(symbolB)
      return sortConfig.direction === 'asc' ? diff : -diff
    }

    if (sortConfig.field === 'breakout') {
      const rank = (value) => {
        if (value === 'Up') return 3
        if (value === 'Down') return 2
        if (value === 'Potential') return 1
        return 0
      }

      const diff = rank(a.breakout) - rank(b.breakout)
      return sortConfig.direction === 'asc' ? diff : -diff
    }

    if (sortConfig.field === 'volumeDiffUp' || sortConfig.field === 'volumeDiffDown') {
      const direction = sortConfig.field === 'volumeDiffUp' ? 'up' : 'down'
      const diffA = getNeighborVolumeDiff(a, direction)?.diff
      const diffB = getNeighborVolumeDiff(b, direction)?.diff

      if (diffA == null && diffB == null) return 0
      if (diffA == null) return 1
      if (diffB == null) return -1

      const diff = diffA - diffB
      return sortConfig.direction === 'asc' ? diff : -diff
    }

    if (sortConfig.field === 'priceRange') {
      const midA = parsePriceRangeMid(a.priceRange)
      const midB = parsePriceRangeMid(b.priceRange)

      if (midA == null && midB == null) return 0
      if (midA == null) return 1
      if (midB == null) return -1

      const diff = midA - midB
      return sortConfig.direction === 'asc' ? diff : -diff
    }

    if (sortConfig.field === 'breakout') {
      const rank = (value) => {
        if (value === 'Up') return 3
        if (value === 'Down') return 2
        if (value === 'Potential') return 1
        return 0
      }

      const diff = rank(a.breakout) - rank(b.breakout)
      return sortConfig.direction === 'asc' ? diff : -diff
    }

    if (sortConfig.field === 'prevSlotDelta') {
      const diffA = getPreviousSlotPricePctMagnitude(a)
      const diffB = getPreviousSlotPricePctMagnitude(b)

      if (diffA == null && diffB == null) return 0
      if (diffA == null) return 1
      if (diffB == null) return -1

      const diff = diffA - diffB
      return sortConfig.direction === 'asc' ? diff : -diff
    }

    if (sortConfig.field === 'volumeDiffUp' || sortConfig.field === 'volumeDiffDown') {
      const direction = sortConfig.field === 'volumeDiffUp' ? 'up' : 'down'
      const diffA = getNeighborVolumeDiff(a, direction)?.diff
      const diffB = getNeighborVolumeDiff(b, direction)?.diff

      if (diffA == null && diffB == null) return 0
      if (diffA == null) return 1
      if (diffB == null) return -1

      const diff = diffA - diffB
      return sortConfig.direction === 'asc' ? diff : -diff
    }

    if (sortConfig.field === 'priceRange') {
      const midA = parsePriceRangeMid(a.priceRange)
      const midB = parsePriceRangeMid(b.priceRange)

      if (midA == null && midB == null) return 0
      if (midA == null) return 1
      if (midB == null) return -1

      const diff = midA - midB
      return sortConfig.direction === 'asc' ? diff : -diff
    }

    const weightA = sortConfig.field === 'volumeWeight'
      ? getCurrentVolumeWeight(a)
      : parseResistanceWeight(a[sortConfig.field])
    const weightB = sortConfig.field === 'volumeWeight'
      ? getCurrentVolumeWeight(b)
      : parseResistanceWeight(b[sortConfig.field])

    if (weightA == null && weightB == null) return 0
    if (weightA == null) return 1
    if (weightB == null) return -1

    const diff = weightA - weightB
    return sortConfig.direction === 'asc' ? diff : -diff
  }

  useEffect(() => {
    const visibleIds = visibleEntries.map(entry => entry.id)
    const sortChanged = previousSortRef.current.field !== sortConfig.field || previousSortRef.current.direction !== sortConfig.direction
    const idSetChanged = visibleIds.length !== stableRowOrder.length || visibleIds.some(id => !stableRowOrder.includes(id))

    if (!sortConfig.field) {
      if (visibleIds.length === 0) {
        if (stableRowOrder.length !== 0) {
          setStableRowOrder([])
        }
      } else if (idSetChanged || sortChanged || stableRowOrder.length === 0) {
        setStableRowOrder(visibleIds)
      }
    } else if (sortChanged || idSetChanged) {
      const sortedIds = [...visibleEntries]
        .sort((a, b) => compareEntries(a, b))
        .map(entry => entry.id)
      setStableRowOrder(sortedIds)
    }

    previousSortRef.current = sortConfig
  }, [visibleEntries, sortConfig, stableRowOrder])

  const sortedEntries = (() => {
    if (!sortConfig.field && stableRowOrder.length === 0) return visibleEntries

    const idToEntry = new Map(visibleEntries.map(entry => [entry.id, entry]))
    const orderedEntries = stableRowOrder
      .map(id => idToEntry.get(id))
      .filter(Boolean)

    const missingEntries = visibleEntries.filter(entry => !stableRowOrder.includes(entry.id))
    if (missingEntries.length > 0) {
      const sortedMissing = sortConfig.field ? [...missingEntries].sort(compareEntries) : missingEntries
      return [...orderedEntries, ...sortedMissing]
    }

    return orderedEntries.length > 0 ? orderedEntries : visibleEntries
  })()

  const displayEntries = sortedEntries

  const toggleSort = (field) => {
    setSortConfig(prev => {
      const direction = prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
      return { field, direction }
    })
  }

  const renderSortIndicator = (field) => {
    if (sortConfig.field !== field) return null
    return (
      <span aria-hidden className="ml-1 text-slate-400">
        {sortConfig.direction === 'asc' ? '▲' : '▼'}
      </span>
    )
  }

  const exportResults = () => {
    const readyEntries = entries.filter(entry => entry.status === 'ready')
    if (readyEntries.length === 0) return

    const payload = {
      exportedAt: new Date().toISOString(),
      entries: readyEntries.map(entry => ({
        symbol: entry.symbol,
        priceRange: entry.priceRange,
        testedDays: entry.testedDays,
        slotCount: entry.slotCount,
        volumeLegend: entry.volumeLegend,
        bottomResist: entry.bottomResist,
        upperResist: entry.upperResist,
        breakout: entry.breakout,
        lastScanAt: entry.lastScanAt,
        status: entry.status,
        bookmarked: !!entry.bookmarked
      }))
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'volume-screening-results.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleImportClick = () => {
    importInputRef.current?.click()
  }

  const scanVisibleEntries = () => {
    const cleanedEntries = dropInvalidScanSymbols(entries)
    if (cleanedEntries.length === 0 || isScanning) return

    const candidates = getVisibleEntries(cleanedEntries)
    if (candidates.length === 0) return

    const candidateIds = new Set(candidates.map(entry => entry.id))

    const resetEntries = cleanedEntries.map(entry => (
      candidateIds.has(entry.id)
        ? clearEntryResults(entry)
        : entry
    ))

    const loadingEntries = resetEntries.map(entry => (
      candidateIds.has(entry.id)
        ? { ...entry, status: 'loading', error: null }
        : entry
    ))

    setEntries(loadingEntries)
    setScanQueue(loadingEntries.filter(entry => candidateIds.has(entry.id)))
    setScanTotal(candidateIds.size)
    setScanCompleted(0)
    setIsScanning(true)
    setIsPaused(false)
    activeScanIdRef.current = null
  }

  const handleImportFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const importedEntries = Array.isArray(parsed?.entries)
        ? parsed.entries
        : Array.isArray(parsed)
          ? parsed
          : []

      const normalized = importedEntries
        .map(item => {
          const symbol = typeof item?.symbol === 'string' ? item.symbol.trim().toUpperCase() : ''
          if (!symbol || isDisallowedSymbol(symbol)) return null

          return {
            symbol,
            ...baseEntryState,
            priceRange: item?.priceRange ?? baseEntryState.priceRange,
            testedDays: item?.testedDays ?? baseEntryState.testedDays,
            slotCount: item?.slotCount ?? baseEntryState.slotCount,
            volumeLegend: Array.isArray(item?.volumeLegend) ? item.volumeLegend : baseEntryState.volumeLegend,
            bottomResist: item?.bottomResist ?? baseEntryState.bottomResist,
            upperResist: item?.upperResist ?? baseEntryState.upperResist,
            breakout: item?.breakout ?? baseEntryState.breakout,
            lastScanAt: item?.lastScanAt ?? baseEntryState.lastScanAt,
            status: typeof item?.status === 'string' ? item.status : 'ready',
            bookmarked: !!item?.bookmarked
          }
        })
        .filter(Boolean)

      const readyEntries = normalized.filter(entry => entry.status === 'ready')

      if (readyEntries.length > 0) {
        const readyBySymbol = Object.fromEntries(readyEntries.map(entry => [entry.symbol, entry]))
        activeScanIdRef.current = null
        setIsScanning(false)
        setIsPaused(false)
        setScanQueue([])
        setScanTotal(0)
        setScanCompleted(0)
        setEntries(prev => prev.map(entry => {
          const override = readyBySymbol[entry.symbol]
          if (!override) return entry

          return {
            ...entry,
            ...override,
            id: entry.id,
            status: override.status || 'ready'
          }
        }))
      }
    } catch (error) {
      console.error('Failed to import volume screening entries:', error)
    } finally {
      event.target.value = ''
    }
  }

  useEffect(() => {
    if (!isScanning || isPaused) return
    if (scanQueue.length === 0) {
      setIsScanning(false)
      return
    }

    const current = scanQueue[0]

    // Allow an in-flight scan to finish even if pause is toggled; only block starting new work.
    if (activeScanIdRef.current && activeScanIdRef.current !== current.id) {
      return
    }

    if (activeScanIdRef.current === current.id) {
      return
    }

    activeScanIdRef.current = current.id

      ; (async () => {
        const result = await performScan(current)
        const { stopAll, removeRow, ...entryResult } = result || {}

        if (removeRow) {
          removeResultFromCache(current.symbol)
          setEntries(prev => prev.filter(entry => entry.id !== current.id))
        } else {
          setEntries(prev => prev.map(entry => (
            entry.id === current.id
              ? entryResult
              : entry
          )))
        }

        setScanCompleted(prev => prev + 1)

        if (stopAll) {
          setScanQueue([])
          setIsScanning(false)
          setIsPaused(false)
          activeScanIdRef.current = null
          return
        }

        setScanQueue(prev => prev.slice(1))
        activeScanIdRef.current = null
      })()
  }, [isScanning, isPaused, scanQueue])

  useEffect(() => {
    if (isScanning && scanQueue.length === 0) {
      setIsScanning(false)
      setIsPaused(false)
    }
  }, [isScanning, scanQueue.length])

  // Auto-scroll to newly added entry and apply blink effect
  useEffect(() => {
    if (!lastAddedId) return

    console.log('[VolumeScreening] Attempting to scroll to:', lastAddedId)

    // Use requestAnimationFrame to ensure DOM is ready
    const rafId = requestAnimationFrame(() => {
      const scrollTimer = setTimeout(() => {
        const element = document.querySelector(`[data-entry-id="${lastAddedId}"]`)
        console.log('[VolumeScreening] Element found:', element)
        if (element) {
          element.scrollIntoView({ behavior: 'auto', block: 'center' })
          // Add blink animation class
          element.classList.add('blink-highlight')
          console.log('[VolumeScreening] Jumped to row and blink added')
        } else {
          console.warn('[VolumeScreening] Element not found for ID:', lastAddedId)
        }
      }, 200)

      // Remove blink animation and clear state after 3 seconds
      const blinkTimer = setTimeout(() => {
        const element = document.querySelector(`[data-entry-id="${lastAddedId}"]`)
        if (element) {
          element.classList.remove('blink-highlight')
        }
        setLastAddedId(null)
      }, 3300)

      return () => {
        clearTimeout(scrollTimer)
        clearTimeout(blinkTimer)
      }
    })

    return () => {
      cancelAnimationFrame(rafId)
    }
  }, [lastAddedId])

  // Show loading message while hydrating cache
  if (!hasHydratedCache) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          <p className="text-slate-300">Loading cached results...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes blinkHighlight {
          0%, 100% { background-color: transparent; }
          50% { background-color: rgba(168, 85, 247, 0.3); }
        }
        .blink-highlight {
          animation: blinkHighlight 1s ease-in-out 3;
        }
      `}</style>
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addSymbols()
                }
              }}
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
              onClick={loadTopSymbols}
              disabled={loadingTopSymbols}
              className="flex-1 lg:flex-none px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              title="Load top 2000 US market cap symbols"
            >
              {loadingTopSymbols ? <Loader2 className="w-5 h-5 animate-spin" /> : <DownloadCloud className="w-5 h-5" />}
              US2000
            </button>
            <button
              type="button"
              onClick={loadTopHKSymbols}
              disabled={loadingHKSymbols}
              className="flex-1 lg:flex-none px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              title="Load top 500 Hong Kong market cap symbols"
            >
              {loadingHKSymbols ? <Loader2 className="w-5 h-5 animate-spin" /> : <DownloadCloud className="w-5 h-5" />}
              HK500
            </button>
            <button
              type="button"
              onClick={loadTopCNSymbols}
              disabled={loadingCNSymbols}
              className="flex-1 lg:flex-none px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              title="Load top 400 Chinese market cap symbols (200 Shanghai + 200 Shenzhen, excluding 3xxxxx stocks)"
            >
              {loadingCNSymbols ? <Loader2 className="w-5 h-5 animate-spin" /> : <DownloadCloud className="w-5 h-5" />}
              CN500
            </button>
            <button
              type="button"
              onClick={scanEntries}
              disabled={entries.length === 0 || isScanning}
              className="flex-1 lg:flex-none px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCcw className="w-5 h-5" />
              Scan
            </button>
            <button
              type="button"
              onClick={togglePauseResume}
              disabled={!isScanning}
              className="flex-1 lg:flex-none px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
              {isScanning ? (isPaused ? 'Resume' : 'Pause') : 'Pause/Resume'}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-400 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Add one or multiple symbols using comma or space separators, then run a quick scan for the selected period.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900 flex-wrap gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <button
              type="button"
              onClick={clearAllEntries}
              className="inline-flex items-center justify-center rounded-full p-2 text-slate-300 hover:text-amber-400 hover:bg-amber-900/40 transition-colors"
              title="Clear all scan results"
              aria-label="Clear all scan results"
            >
              <Eraser className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={removeAllRows}
              className="inline-flex items-center justify-center rounded-full p-2 text-slate-300 hover:text-red-400 hover:bg-red-900/40 transition-colors"
              title="Remove all rows"
              aria-label="Remove all rows"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={scanVisibleEntries}
              disabled={entries.length === 0 || isScanning}
              className="inline-flex items-center justify-center rounded-full p-2 text-slate-300 hover:text-emerald-400 hover:bg-emerald-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Scan visible symbols"
              aria-label="Scan visible symbols"
            >
              <RefreshCcw className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={exportResults}
              className="inline-flex items-center justify-center rounded-full p-2 text-slate-300 hover:text-blue-400 hover:bg-blue-900/40 transition-colors"
              title="Export scanned results"
              aria-label="Export scanned results"
            >
              <DownloadCloud className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleImportClick}
              className="inline-flex items-center justify-center rounded-full p-2 text-slate-300 hover:text-indigo-400 hover:bg-indigo-900/40 transition-colors"
              title="Import scan results"
              aria-label="Import scan results"
            >
              <UploadCloud className="w-5 h-5" />
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportFileChange}
              className="hidden"
            />
            {scanTotal > 0 && (
              <span className="whitespace-nowrap">
                {Math.min(scanCompleted, scanTotal)}/{scanTotal} processing
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="AAPL, 2628..."
                className="pl-9 pr-3 py-2 bg-slate-700 border border-slate-600 text-slate-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-slate-400 text-sm w-48"
              />
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter('')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {isFiltered && (
              <div className="text-xs text-slate-400 whitespace-nowrap" title="Showing only filtered symbols">
                Showing {filteredEntries.length} / {entries.length} ({filteredCount} filtered)
              </div>
            )}
            <label className="inline-flex items-center gap-2 text-sm text-slate-300 select-none">
              <input
                type="checkbox"
                checked={showBookmarkedOnly}
                onChange={(e) => setShowBookmarkedOnly(e.target.checked)}
                className="form-checkbox rounded border-slate-600 text-yellow-400 focus:ring-2 focus:ring-yellow-400"
              />
              Bookmarked
            </label>
            <label
              className="inline-flex items-center gap-2 text-sm text-slate-300 select-none"
              title="Flags symbols with asymmetric volume gaps (≥6%), weak current volume (<6%), and a heavy previous zone drop (<-6%) that hint at potential breaks."
            >
              <input
                type="checkbox"
                checked={showPotentialBreakOnly}
                onChange={(e) => setShowPotentialBreakOnly(e.target.checked)}
                className="form-checkbox rounded border-slate-600 text-blue-500 focus:ring-2 focus:ring-blue-500"
              />
              Potential to break
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-300 select-none">
              <input
                type="checkbox"
                checked={showUpBreakOnly}
                onChange={(e) => setShowUpBreakOnly(e.target.checked)}
                className="form-checkbox rounded border-slate-600 text-emerald-500 focus:ring-2 focus:ring-emerald-500"
              />
              Upper Break
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-300 select-none">
              <input
                type="checkbox"
                checked={showDownBreakOnly}
                onChange={(e) => setShowDownBreakOnly(e.target.checked)}
                className="form-checkbox rounded border-slate-600 text-rose-500 focus:ring-2 focus:ring-rose-500"
              />
              Down Break
            </label>
            {availableMarkets.length > 0 && (
              <div className="flex items-center gap-2 border border-slate-600 rounded-lg px-3 py-2">
                <span className="text-sm text-slate-300">Market:</span>
                {availableMarkets.map(market => (
                  <button
                    key={market}
                    onClick={() => toggleMarketFilter(market)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${selectedMarkets.includes(market)
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                  >
                    {market}
                  </button>
                ))}
              </div>
            )}
            {availablePeriods.length > 0 && (
              <div className="flex items-center gap-2 border border-slate-600 rounded-lg px-3 py-2">
                <span className="text-sm text-slate-300">Period:</span>
                {availablePeriods.map(period => (
                  <button
                    key={period}
                    onClick={() => togglePeriodFilter(period)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${selectedPeriods.includes(period)
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1 border border-slate-700 rounded-lg px-2 py-1">
              <span className="text-xs text-slate-400" title="Visible / total rows">Rows: {visibleEntries.length}/{entries.length}</span>
              {entries.length !== visibleEntries.length && (
                <span className="text-[11px] text-amber-300" title="Rows hidden by filters">({entries.length - visibleEntries.length} filtered)</span>
              )}
            </div>
            <div className="flex items-center gap-1 pr-2 border-r border-slate-700">
              <button
                type="button"
                onClick={scrollTableToTop}
                className="p-1.5 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                title="Scroll to top"
                aria-label="Scroll to top"
              >
                <ArrowUpToLine className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={scrollTableToBottom}
                className="p-1.5 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                title="Scroll to bottom"
                aria-label="Scroll to bottom"
              >
                <ArrowDownToLine className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div
            ref={tableScrollRef}
            tabIndex={0}
            className="max-h-[70vh] overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
          >
            <table className="min-w-full divide-y divide-slate-700">
              <thead className="bg-slate-800 sticky top-0 z-10 shadow-lg">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    <span className="sr-only">Bookmark</span>
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider w-28">
                    <button
                      type="button"
                      onClick={() => toggleSort('symbol')}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                    >
                      Stock
                      {renderSortIndicator('symbol')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider" title="Analysis period (3M, 6M, 1Y, 2Y, 3Y, 5Y)">
                    <span className="inline-flex items-center justify-center gap-1">
                      <Clock3 className="w-4 h-4" aria-hidden="true" />
                      <span className="sr-only">Period</span>
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort('lastScanAt')}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                    >
                      Last Scan
                      {renderSortIndicator('lastScanAt')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort('volumeWeight')}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                    >
                      Volume Weight %
                      {renderSortIndicator('volumeWeight')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort('volumeDiffDown')}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                      title="Volume weight difference to the next lower price slot"
                    >
                      <ArrowDownToLine className="w-4 h-4" aria-hidden="true" />
                      V.Diff%
                      {renderSortIndicator('volumeDiffDown')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort('volumeDiffUp')}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                      title="Volume weight difference to the next upper price slot"
                    >
                      <ArrowUpToLine className="w-4 h-4" aria-hidden="true" />
                      V.Diff%
                      {renderSortIndicator('volumeDiffUp')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort('prevSlotDelta')}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                      title="Change from the previous volume slot to the current one (weight and price midpoint)"
                    >
                      Prev Zone Δ
                      {renderSortIndicator('prevSlotDelta')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort('priceRange')}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                      title={PRICE_RANGE_TOOLTIP}
                    >
                      Px Range
                      {renderSortIndicator('priceRange')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort('bottomResist')}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                      title={BOTTOM_RESIST_TOOLTIP}
                    >
                      Bottom Resist
                      {renderSortIndicator('bottomResist')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort('upperResist')}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                      title={UPPER_RESIST_TOOLTIP}
                    >
                      Upper Resist
                      {renderSortIndicator('upperResist')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider" title={BREAK_TOOLTIP}>
                    <button
                      type="button"
                      onClick={() => toggleSort('breakout')}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                    >
                      <Activity className="w-4 h-4" aria-hidden="true" />
                      <span className="sr-only">Break</span>
                      {renderSortIndicator('breakout')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
            <tbody className="divide-y divide-slate-800">
              {displayEntries.length === 0 ? (
                <tr>
                  <td colSpan="13" className="px-4 py-6 text-center text-slate-400">
                    {showUpBreakOnly || showDownBreakOnly || showPotentialBreakOnly || showBookmarkedOnly
                      ? 'No symbols matched the current filters. Disable filters to see all entries.'
                      : 'No symbols added yet. Add stocks above to start screening.'}
                  </td>
                </tr>
              ) : (
                displayEntries.map(entry => (
                  <tr
                    key={entry.id}
                    data-entry-id={entry.id}
                    className="hover:bg-slate-800/60 cursor-pointer"
                    onClick={() => handleRowClick(entry)}
                    title="Click to open in Technical Analysis with Vol Prf V2"
                  >
                    <td className="px-4 py-3 text-slate-200">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleBookmark(entry.id)
                        }}
                        aria-label={entry.bookmarked ? 'Unbookmark' : 'Bookmark'}
                        className={`p-1 rounded transition-colors ${entry.bookmarked
                          ? 'text-amber-300 hover:text-amber-200 hover:bg-amber-900/30'
                          : 'text-slate-400 hover:text-amber-200 hover:bg-slate-700/70'
                          }`}
                      >
                        <Star className="w-4 h-4" fill={entry.bookmarked ? 'currentColor' : 'none'} />
                      </button>
                    </td>
                    <td className="px-3 py-3 text-slate-100 font-medium whitespace-nowrap w-28">{entry.symbol}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="px-2 py-1 rounded bg-purple-900/50 text-purple-200 text-xs font-semibold"
                        title={getPeriodTooltip(entry)}
                      >
                        {entry.periodDisplay || formatPeriod(entry.period)}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-xs ${isScanStale(entry.lastScanAt) ? 'text-red-400' : 'text-slate-200'}`}>
                      {formatTimestamp(entry.lastScanAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      {entry.status === 'loading' ? (
                        <div className="flex items-center gap-2 text-amber-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Scanning…</span>
                        </div>
                      ) : entry.status === 'error' ? (
                        <span className="text-red-400 text-sm">{entry.error || 'Failed to scan'}</span>
                      ) : (
                        <VolumeLegendPills
                          legend={entry.volumeLegend}
                          keyPrefix={entry.id}
                          titleFormatter={(slot) => (
                            slot?.isPlaceholder
                              ? 'Volume weight unavailable'
                              : `${formatPriceRange(slot.start, slot.end)} • ${slot.label}`
                          )}
                        />
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 text-slate-200 text-sm ${getVolumeDiffClass(entry, 'down')}`}
                      title={getVolumeDiffTooltip(entry, 'down')}
                    >
                      {formatVolumeDiff(entry, 'down') ?? '—'}
                    </td>
                    <td
                      className={`px-4 py-3 text-slate-200 text-sm ${getVolumeDiffClass(entry, 'up')}`}
                      title={getVolumeDiffTooltip(entry, 'up')}
                    >
                      {formatVolumeDiff(entry, 'up') ?? '—'}
                    </td>
                    <td
                      className={`px-4 py-3 text-slate-200 text-sm ${getPreviousSlotClass(entry)}`}
                      title={getPreviousSlotTooltip(entry)}
                    >
                      {formatPreviousSlotDiff(entry)}
                    </td>
                    <td
                      className="px-4 py-3 text-slate-200 text-sm"
                    >
                      {entry.priceRange}
                    </td>
                    <td
                      className={`px-4 py-3 text-slate-200 text-sm ${isResistanceClose(entry.bottomResist) ? 'text-sky-400 font-semibold' : ''}`}
                    >
                      {entry.bottomResist}
                    </td>
                    <td
                      className={`px-4 py-3 text-slate-200 text-sm ${isResistanceClose(entry.upperResist) ? 'text-sky-400 font-semibold' : ''}`}
                    >
                      {entry.upperResist}
                    </td>
                    <td className="px-4 py-3 text-slate-200">{entry.breakout}</td>
                    <td className="px-4 py-3 text-right">
                      {onBacktestSelect && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setLastAddedId(entry.id)
                            onBacktestSelect(entry.symbol, entry.period)
                          }}
                          className="inline-flex items-center justify-center rounded-full p-2 text-slate-300 hover:text-blue-300 hover:bg-blue-900/40 transition-colors mr-2"
                          aria-label={`Load ${entry.symbol} in backtest`}
                          title="Load in Backtest"
                        >
                          <BarChart3 className="w-5 h-5" />
                        </button>
                      )}
                      {onV3BacktestSelect && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setLastAddedId(entry.id)
                            onV3BacktestSelect(entry.symbol, entry.period)
                          }}
                          className="inline-flex items-center justify-center rounded-full p-2 text-slate-300 hover:text-purple-300 hover:bg-purple-900/40 transition-colors mr-2"
                          aria-label={`Load ${entry.symbol} in V3 backtest`}
                          title="Load in V3 Backtest"
                        >
                          <BarChart2 className="w-5 h-5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          scanEntryRow(entry.id)
                        }}
                        className="inline-flex items-center justify-center rounded-full p-2 text-slate-300 hover:text-emerald-400 hover:bg-emerald-900/40 transition-colors mr-2"
                        aria-label={`Scan ${entry.symbol}`}
                        title="Scan this symbol"
                      >
                        <RefreshCcw className="w-5 h-5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          clearEntry(entry.id)
                        }}
                        className="inline-flex items-center justify-center rounded-full p-2 text-slate-300 hover:text-amber-400 hover:bg-amber-900/40 transition-colors mr-2"
                        aria-label={`Clear ${entry.symbol}`}
                        title="Clear scan result"
                      >
                        <Eraser className="w-5 h-5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeEntry(entry.id)
                        }}
                        className="inline-flex items-center justify-center rounded-full p-2 text-slate-300 hover:text-red-400 hover:bg-red-900/40 transition-colors"
                        aria-label={`Remove ${entry.symbol}`}
                        title="Remove row"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="px-4 py-3 border-t border-slate-800 text-right text-xs text-slate-400">
        Selected period: {periods.find(p => p.value === period)?.label || period}
      </div>
    </div>
    </div >
  )
}

export default VolumeScreening
