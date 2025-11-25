package com.stockanalyzer.service;

import com.stockanalyzer.model.StockPrice;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Two-level API cache system - Server side
 * - Max 100 stocks
 * - 12-hour expiry
 * - LRU eviction policy
 * - Thread-safe implementation
 */
public class StockDataCache {
    private static final int MAX_CACHE_SIZE = 100;
    private static final long CACHE_EXPIRY_MS = 12 * 60 * 60 * 1000; // 12 hours

    private final Map<String, CacheEntry> cache;
    private final CacheStats stats;

    public StockDataCache() {
        this.cache = new ConcurrentHashMap<>();
        this.stats = new CacheStats();
    }

    /**
     * Generate cache key from symbol and key (date string)
     */
    private String generateKey(String symbol, String key) {
        return String.format("%s:%s", symbol.toUpperCase(), key);
    }

    /**
     * Check if cache entry is expired
     */
    private boolean isExpired(long timestamp) {
        return System.currentTimeMillis() - timestamp > CACHE_EXPIRY_MS;
    }

    /**
     * Get data from cache if available and not expired
     */
    public List<StockPrice> get(String symbol, String key) {
        String cacheKey = generateKey(symbol, key);
        CacheEntry entry = cache.get(cacheKey);

        if (entry == null) {
            return null;
        }

        if (isExpired(entry.timestamp)) {
            cache.remove(cacheKey);
            return null;
        }

        // Update last accessed time for LRU
        entry.lastAccessed = System.currentTimeMillis();
        stats.incrementCacheHits();

        return entry.data;
    }

    /**
     * Store data in cache with LRU eviction
     */
    public void put(String symbol, String key, List<StockPrice> data) {
        String cacheKey = generateKey(symbol, key);

        // Evict oldest entry if cache is full and key doesn't exist
        if (cache.size() >= MAX_CACHE_SIZE && !cache.containsKey(cacheKey)) {
            evictLRU();
        }

        cache.put(cacheKey, new CacheEntry(data));
        stats.incrementApiCalls();
    }

    /**
     * Evict least recently used entry
     */
    private void evictLRU() {
        String oldestKey = null;
        long oldestTime = Long.MAX_VALUE;

        for (Map.Entry<String, CacheEntry> entry : cache.entrySet()) {
            if (entry.getValue().lastAccessed < oldestTime) {
                oldestTime = entry.getValue().lastAccessed;
                oldestKey = entry.getKey();
            }
        }

        if (oldestKey != null) {
            cache.remove(oldestKey);
            System.out.println("[Cache] Evicted LRU entry: " + oldestKey);
        }
    }

    /**
     * Get cache statistics
     */
    public CacheStats getStats() {
        stats.setCacheSize(cache.size());
        return stats;
    }

    /**
     * Log cache statistics to console
     */
    public void logStats() {
        CacheStats currentStats = getStats();
        System.out.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        System.out.println("📊 SERVER CACHE STATISTICS");
        System.out.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        System.out.println(String.format("🎯 Cache Hits:        %d", currentStats.getCacheHits()));
        System.out.println(String.format("🌐 API Calls:         %d", currentStats.getApiCalls()));
        System.out.println(String.format("📈 Hit Rate:          %.2f%%", currentStats.getHitRate()));
        System.out.println(String.format("💾 Cache Size:        %d/%d", currentStats.getCacheSize(), MAX_CACHE_SIZE));
        System.out.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    }

    /**
     * Clear all cache entries
     */
    public void clear() {
        cache.clear();
    }

    /**
     * Clear expired entries
     */
    public void clearExpired() {
        int expiredCount = 0;
        List<String> expiredKeys = new ArrayList<>();

        for (Map.Entry<String, CacheEntry> entry : cache.entrySet()) {
            if (isExpired(entry.getValue().timestamp)) {
                expiredKeys.add(entry.getKey());
                expiredCount++;
            }
        }

        for (String key : expiredKeys) {
            cache.remove(key);
        }

        if (expiredCount > 0) {
            System.out.println("[Cache] Cleared " + expiredCount + " expired entries");
        }
    }

    /**
     * Cache entry with timestamp and last accessed time
     */
    private static class CacheEntry {
        final List<StockPrice> data;
        final long timestamp;
        long lastAccessed;

        CacheEntry(List<StockPrice> data) {
            this.data = data;
            this.timestamp = System.currentTimeMillis();
            this.lastAccessed = this.timestamp;
        }
    }

    /**
     * Cache statistics
     */
    public static class CacheStats {
        private int cacheHits = 0;
        private int apiCalls = 0;
        private int cacheSize = 0;

        public synchronized void incrementCacheHits() {
            cacheHits++;
        }

        public synchronized void incrementApiCalls() {
            apiCalls++;
        }

        public void setCacheSize(int size) {
            this.cacheSize = size;
        }

        public int getCacheHits() {
            return cacheHits;
        }

        public int getApiCalls() {
            return apiCalls;
        }

        public int getCacheSize() {
            return cacheSize;
        }

        public double getHitRate() {
            int total = cacheHits + apiCalls;
            if (total == 0) {
                return 0.0;
            }
            return (double) cacheHits / total * 100.0;
        }
    }
}
