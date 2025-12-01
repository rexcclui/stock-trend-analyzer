package com.stockanalyzer.service;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import com.stockanalyzer.model.StockPrice;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;

import java.io.IOException;
import java.lang.reflect.Type;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public class FinancialModelingPrepClient {
    private static final String BASE_URL = "https://financialmodelingprep.com/api/v3";
    private final String apiKey;
    private final Gson gson;
    private final StockDataCache cache;

    public FinancialModelingPrepClient(String apiKey) {
        this.apiKey = apiKey;
        this.gson = new Gson();
        this.cache = new StockDataCache();
    }

    public List<StockPrice> getHistoricalData(String symbol, String from, String to) throws IOException {
        String url = String.format("%s/historical-price-full/%s?from=%s&to=%s&apikey=%s",
                BASE_URL, symbol, from, to, apiKey);

        try (CloseableHttpClient httpClient = HttpClients.createDefault()) {
            HttpGet request = new HttpGet(url);
            try (CloseableHttpResponse response = httpClient.execute(request)) {
                String json = EntityUtils.toString(response.getEntity());

                // Parse the response
                Type type = new TypeToken<Map<String, Object>>() {
                }.getType();
                Map<String, Object> data = gson.fromJson(json, type);

                // Extract historical data
                List<Map<String, Object>> historical = (List<Map<String, Object>>) data.get("historical");

                if (historical == null || historical.isEmpty()) {
                    return List.of();
                }

                return historical.stream()
                        .map(this::mapToStockPrice)
                        .toList();
            }
        }
    }

    public List<StockPrice> getHistoricalDataByDays(String symbol, int days) throws IOException {
        // Calculate from and to dates
        java.time.LocalDate fromDate = java.time.LocalDate.now().minusDays(days);
        java.time.LocalDate toDate = java.time.LocalDate.now();
        String from = fromDate.toString(); // yyyy-MM-dd format
        String to = toDate.toString(); // yyyy-MM-dd format

        // Try to get from cache first (use from date as cache key)
        List<StockPrice> cachedData = cache.get(symbol, from);

        if (cachedData != null) {
            System.out.println(String.format("[Cache] ✅ Cache HIT for %s:%s", symbol, from));
            cache.logStats();
            return cachedData;
        }

        System.out
                .println(String.format("[Cache] ❌ Cache MISS for %s:%s, fetching from external API...", symbol, from));

        // Use from/to parameters instead of timeseries
        String url = String.format("%s/historical-price-full/%s?from=%s&to=%s&apikey=%s",
                BASE_URL, symbol, from, to, apiKey);

        try (CloseableHttpClient httpClient = HttpClients.createDefault()) {
            HttpGet request = new HttpGet(url);
            try (CloseableHttpResponse response = httpClient.execute(request)) {
                String json = EntityUtils.toString(response.getEntity());

                Type type = new TypeToken<Map<String, Object>>() {
                }.getType();
                Map<String, Object> data = gson.fromJson(json, type);

                List<Map<String, Object>> historical = (List<Map<String, Object>>) data.get("historical");

                if (historical == null || historical.isEmpty()) {
                    return List.of();
                }

                List<StockPrice> prices = historical.stream()
                        .map(this::mapToStockPrice)
                        .toList();

                // Store in cache (use from date as cache key)
                cache.put(symbol, from, prices);
                cache.logStats();

                return prices;
            }
        }
    }

    public List<String> getTopMarketCapSymbols(int limit) throws IOException {
        String url = String.format("%s/stock-screener?marketCapMoreThan=0&limit=%d&apikey=%s", BASE_URL, limit, apiKey);

        try (CloseableHttpClient httpClient = HttpClients.createDefault()) {
            HttpGet request = new HttpGet(url);
            try (CloseableHttpResponse response = httpClient.execute(request)) {
                String json = EntityUtils.toString(response.getEntity());

                Type type = new TypeToken<List<Map<String, Object>>>() {
                }.getType();
                List<Map<String, Object>> data = gson.fromJson(json, type);

                if (data == null) {
                    return List.of();
                }

                return data.stream()
                        .map(entry -> (String) entry.get("symbol"))
                        .filter(Objects::nonNull)
                        .map(String::toUpperCase)
                        .toList();
            }
        }
    }

    private StockPrice mapToStockPrice(Map<String, Object> data) {
        StockPrice price = new StockPrice();
        price.setDate((String) data.get("date"));
        price.setOpen(((Number) data.get("open")).doubleValue());
        price.setHigh(((Number) data.get("high")).doubleValue());
        price.setLow(((Number) data.get("low")).doubleValue());
        price.setClose(((Number) data.get("close")).doubleValue());
        price.setVolume(((Number) data.get("volume")).longValue());
        return price;
    }
}
