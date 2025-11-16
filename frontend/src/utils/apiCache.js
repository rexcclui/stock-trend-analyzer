/**
 * Two-level API cache system - Client side
 * - Max 20 stocks
 * - 12-hour expiry
 * - LRU eviction policy
 */

const MAX_CACHE_SIZE = 20
const CACHE_EXPIRY_MS = 12 * 60 * 60 * 1000 // 12 hours

class ApiCache {
  constructor() {
    this.cache = new Map() // key: "symbol:days", value: { data, timestamp, lastAccessed }
    this.stats = {
      cacheHits: 0,
      serverCalls: 0
    }
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
   * Get data from cache if available and not expired
   */
  get(symbol, days) {
    const key = this.generateKey(symbol, days)
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    if (this.isExpired(entry.timestamp)) {
      this.cache.delete(key)
      return null
    }

    // Update last accessed time for LRU
    entry.lastAccessed = Date.now()
    this.stats.cacheHits++

    return entry.data
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
