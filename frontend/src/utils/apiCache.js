/**
 * Two-level API cache system - Client side
 * - Max 20 stocks
 * - 12-hour expiry
 * - LRU eviction policy
 * - Persists across page reloads using localStorage
 */

const MAX_CACHE_SIZE = 20
const CACHE_EXPIRY_MS = 12 * 60 * 60 * 1000 // 12 hours
const STORAGE_KEY = 'stockAnalyzerApiCache'
const STATS_STORAGE_KEY = 'stockAnalyzerApiCacheStats'

class ApiCache {
  constructor() {
    this.cache = new Map() // key: "symbol:days", value: { data, timestamp, lastAccessed }
    this.stats = {
      cacheHits: 0,
      serverCalls: 0
    }

    // Load cache from localStorage
    this.loadFromStorage()

    // Clear expired entries on initialization
    this.clearExpired()

    console.log(`[Cache] Initialized with ${this.cache.size} cached entries from localStorage`)
  }

  /**
   * Generate cache key from symbol and days
   */
  generateKey(symbol, days) {
    return `${symbol.toUpperCase()}:${days}`
  }

  /**
   * Check if cache entry is expired
   */
  isExpired(timestamp) {
    return Date.now() - timestamp > CACHE_EXPIRY_MS
  }

  /**
   * Load cache from localStorage
   */
  loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const storedStats = localStorage.getItem(STATS_STORAGE_KEY)

      if (stored) {
        const parsed = JSON.parse(stored)
        this.cache = new Map(parsed)
      }

      if (storedStats) {
        this.stats = JSON.parse(storedStats)
      }
    } catch (error) {
      console.warn('[Cache] Failed to load cache from localStorage:', error)
      this.cache = new Map()
      this.stats = { cacheHits: 0, serverCalls: 0 }
    }
  }

  /**
   * Save cache to localStorage
   */
  saveToStorage() {
    try {
      const serialized = JSON.stringify(Array.from(this.cache.entries()))
      const serializedStats = JSON.stringify(this.stats)

      localStorage.setItem(STORAGE_KEY, serialized)
      localStorage.setItem(STATS_STORAGE_KEY, serializedStats)
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.warn('[Cache] localStorage quota exceeded, clearing oldest entries')
        // Clear half of the cache to free up space
        const entriesToRemove = Math.ceil(this.cache.size / 2)
        const sortedEntries = Array.from(this.cache.entries())
          .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)

        for (let i = 0; i < entriesToRemove; i++) {
          this.cache.delete(sortedEntries[i][0])
        }

        // Try saving again
        try {
          const serialized = JSON.stringify(Array.from(this.cache.entries()))
          localStorage.setItem(STORAGE_KEY, serialized)
        } catch (retryError) {
          console.error('[Cache] Failed to save cache even after cleanup:', retryError)
        }
      } else {
        console.warn('[Cache] Failed to save cache to localStorage:', error)
      }
    }
  }

  /**
   * Find cached data for the same symbol with longer or equal period
   * Returns { key, entry, days } if found, null otherwise
   */
  findLongerPeriodCache(symbol, requestedDays) {
    const upperSymbol = symbol.toUpperCase()
    const requestedDaysNum = parseInt(requestedDays)

    let longestMatch = null
    let longestDays = 0

    for (const [key, entry] of this.cache.entries()) {
      // Parse cache key format: "SYMBOL:DAYS"
      const [cachedSymbol, cachedDaysStr] = key.split(':')

      if (cachedSymbol === upperSymbol) {
        const cachedDays = parseInt(cachedDaysStr)

        // Check if cached period is longer than or equal to requested
        // and is the longest we've found so far
        if (cachedDays >= requestedDaysNum && cachedDays > longestDays) {
          // Verify entry is not expired
          if (!this.isExpired(entry.timestamp)) {
            longestMatch = { key, entry, days: cachedDays }
            longestDays = cachedDays
          }
        }
      }
    }

    return longestMatch
  }

  /**
   * Trim data to the requested number of days
   * Assumes data is sorted chronologically (oldest to newest)
   * Returns the most recent N days of data
   */
  trimDataToPeriod(data, requestedDays, cachedDays) {
    if (!data || !data.prices || data.prices.length === 0) {
      return data
    }

    // If requested period equals or exceeds cached period, return as-is
    if (parseInt(requestedDays) >= parseInt(cachedDays)) {
      return data
    }

    // Calculate how many data points to keep based on ratio
    // This accounts for trading days vs calendar days
    const ratio = parseInt(requestedDays) / parseInt(cachedDays)
    const targetPoints = Math.ceil(data.prices.length * ratio)

    // Take the most recent data points (negative index = from end of array)
    const trimmedPrices = data.prices.slice(-targetPoints)

    // Debug: Log the date range to verify we're getting the most recent data
    if (trimmedPrices.length > 0) {
      console.log(`[Cache] Trimming: ${data.prices.length} → ${trimmedPrices.length} points`)
      console.log(`[Cache] Original range: ${data.prices[0]?.date} to ${data.prices[data.prices.length - 1]?.date}`)
      console.log(`[Cache] Trimmed range:  ${trimmedPrices[0]?.date} to ${trimmedPrices[trimmedPrices.length - 1]?.date}`)
      console.log(`[Cache] ✅ Keeping LATEST ${trimmedPrices.length} points (requested: ${requestedDays} days, cached: ${cachedDays} days)`)
    }

    // Create new data object with trimmed prices
    // Keep other fields (indicators, signals, etc.) that might exist
    const trimmedData = {
      ...data,
      prices: trimmedPrices
    }

    // If indicators exist, trim them too
    if (data.indicators && data.indicators.length > 0) {
      trimmedData.indicators = data.indicators.slice(-targetPoints)
    }

    // If signals exist, filter to only include those within trimmed date range
    if (data.signals && data.signals.length > 0 && trimmedPrices.length > 0) {
      const oldestDate = trimmedPrices[0].date
      trimmedData.signals = data.signals.filter(signal => signal.date >= oldestDate)
    }

    return trimmedData
  }

  /**
   * Get data from cache if available and not expired
   * Uses smart loading: checks for longer period caches and trims if needed
   */
  get(symbol, days) {
    const key = this.generateKey(symbol, days)
    const entry = this.cache.get(key)

    // First check exact match
    if (entry) {
      if (this.isExpired(entry.timestamp)) {
        this.cache.delete(key)
        this.saveToStorage()
      } else {
        // Update last accessed time for LRU
        entry.lastAccessed = Date.now()
        this.stats.cacheHits++

        // Save updated access time and stats
        this.saveToStorage()

        console.log(`[Cache] ✅ Exact cache HIT for ${key}`)
        return entry.data
      }
    }

    // Smart loading: check if we have a longer period cached
    const longerPeriodMatch = this.findLongerPeriodCache(symbol, days)

    if (longerPeriodMatch) {
      console.log(`[Cache] 🎯 Smart cache HIT: Found ${longerPeriodMatch.key} for requested ${key}`)

      // Update last accessed time for the source cache
      longerPeriodMatch.entry.lastAccessed = Date.now()
      this.stats.cacheHits++

      // Trim the data to the requested period
      const trimmedData = this.trimDataToPeriod(
        longerPeriodMatch.entry.data,
        days,
        longerPeriodMatch.days
      )

      // Cache the trimmed data for future requests
      this.cache.set(key, {
        data: trimmedData,
        timestamp: longerPeriodMatch.entry.timestamp, // Use original timestamp
        lastAccessed: Date.now()
      })

      console.log(`[Cache] 💾 Cached trimmed data as ${key} (${trimmedData.prices?.length || 0} data points)`)

      // Save to localStorage
      this.saveToStorage()

      return trimmedData
    }

    // No cache found
    return null
  }

  /**
   * Store data in cache with LRU eviction
   */
  set(symbol, days, data) {
    const key = this.generateKey(symbol, days)

    // Evict oldest entry if cache is full
    if (this.cache.size >= MAX_CACHE_SIZE && !this.cache.has(key)) {
      this.evictLRU()
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      lastAccessed: Date.now()
    })

    this.stats.serverCalls++

    // Save to localStorage
    this.saveToStorage()
  }

  /**
   * Evict least recently used entry
   */
  evictLRU() {
    let oldestKey = null
    let oldestTime = Infinity

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      console.log(`[Cache] Evicted LRU entry: ${oldestKey}`)
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      maxSize: MAX_CACHE_SIZE,
      hitRate: this.stats.cacheHits + this.stats.serverCalls > 0
        ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.serverCalls) * 100).toFixed(2)
        : '0.00'
    }
  }

  /**
   * Log cache statistics to console
   */
  logStats() {
    const stats = this.getStats()
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 CLIENT CACHE STATISTICS')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`🎯 Cache Hits:        ${stats.cacheHits}`)
    console.log(`🌐 Server Calls:      ${stats.serverCalls}`)
    console.log(`📈 Hit Rate:          ${stats.hitRate}%`)
    console.log(`💾 Cache Size:        ${stats.cacheSize}/${stats.maxSize}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear()
    this.stats = { cacheHits: 0, serverCalls: 0 }
    this.saveToStorage()
  }

  /**
   * Clear expired entries
   */
  clearExpired() {
    let expiredCount = 0
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry.timestamp)) {
        this.cache.delete(key)
        expiredCount++
      }
    }
    if (expiredCount > 0) {
      console.log(`[Cache] Cleared ${expiredCount} expired entries`)
      this.saveToStorage()
    }
  }
}

// Export singleton instance
export const apiCache = new ApiCache()

// Periodically clear expired entries (every 30 minutes)
if (typeof window !== 'undefined') {
  setInterval(() => {
    apiCache.clearExpired()
  }, 30 * 60 * 1000)
}
