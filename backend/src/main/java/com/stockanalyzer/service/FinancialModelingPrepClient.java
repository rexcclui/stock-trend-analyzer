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
import java.util.regex.Pattern;

public class FinancialModelingPrepClient {
    private static final String BASE_URL = "https://financialmodelingprep.com/api/v3";
    private static final Pattern EXCLUDED_HK_SYMBOL_PATTERN = Pattern.compile("^4\\d{3}\\.HK$");
    private static final Pattern EXCLUDED_CN_SYMBOL_PATTERN = Pattern.compile("^3\\d{4}\\.(SZ|SS)$");
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
        return getTopMarketCapSymbols(limit, null);
    }

    public List<String> getTopMarketCapSymbols(int limit, String exchange) throws IOException {
        // For Chinese exchanges, fetch from both Shanghai and Shenzhen
        if (exchange != null && (exchange.equalsIgnoreCase("CN") || exchange.equalsIgnoreCase("CHINA"))) {
            return getTopChineseSymbols(limit);
        }

        StringBuilder urlBuilder = new StringBuilder();
        urlBuilder.append(String.format("%s/stock-screener?marketCapMoreThan=0&limit=%d", BASE_URL, limit));

        // For Hong Kong, use country filter to get HK-based companies
        if (exchange != null && !exchange.isEmpty()) {
            if (exchange.equalsIgnoreCase("HKG") || exchange.equalsIgnoreCase("HKSE")) {
                // Use country filter for Hong Kong - we'll filter to .HK symbols below
                urlBuilder.append("&country=HK");
                System.out.println("Using country filter: HK");
            } else {
                // Use exchange filter for others
                urlBuilder.append(String.format("&exchange=%s", exchange));
                System.out.println("Using exchange filter: " + exchange);
            }
        }

        urlBuilder.append(String.format("&apikey=%s", apiKey));
        String url = urlBuilder.toString();

        System.out.println("FMP API URL: " + url.replace(apiKey, "***"));

        try (CloseableHttpClient httpClient = HttpClients.createDefault()) {
            HttpGet request = new HttpGet(url);
            try (CloseableHttpResponse response = httpClient.execute(request)) {
                String json = EntityUtils.toString(response.getEntity());

                System.out.println("FMP API Response length: " + json.length());

                Type type = new TypeToken<List<Map<String, Object>>>() {
                }.getType();
                List<Map<String, Object>> data = gson.fromJson(json, type);

                if (data == null) {
                    System.out.println("FMP returned null data");
                    return List.of();
                }

                System.out.println("FMP returned " + data.size() + " stocks before filtering");

                List<String> symbols = data.stream()
                        .map(entry -> (String) entry.get("symbol"))
                        .filter(Objects::nonNull)
                        .map(String::toUpperCase)
                        .toList();

                // For Hong Kong exchange request, filter to only .HK symbols
                if (exchange != null && (exchange.equalsIgnoreCase("HKG") || exchange.equalsIgnoreCase("HKSE"))) {
                    symbols = symbols.stream()
                            .filter(symbol -> symbol.endsWith(".HK") && !EXCLUDED_HK_SYMBOL_PATTERN.matcher(symbol).matches())
                            .limit(limit)  // Apply limit after filtering
                            .toList();
                    System.out.println("After .HK filtering: " + symbols.size() + " stocks");
                }

                return symbols;
            }
        }
    }

    private List<String> getTopChineseSymbols(int limit) throws IOException {
        System.out.println("Fetching top Chinese stocks from Shanghai and Shenzhen exchanges");

        // Calculate how many stocks to fetch from each exchange
        int perExchange = limit / 2; // 200 from Shanghai, 200 from Shenzhen

        // Fetch from Shanghai Exchange
        List<String> shanghaiSymbols = fetchSymbolsByExchange("SSE", perExchange, ".SS");
        System.out.println("Fetched " + shanghaiSymbols.size() + " symbols from Shanghai");

        // Fetch from Shenzhen Exchange
        List<String> shenzhenSymbols = fetchSymbolsByExchange("SHZ", perExchange, ".SZ");
        System.out.println("Fetched " + shenzhenSymbols.size() + " symbols from Shenzhen");

        // Combine both lists
        java.util.List<String> combined = new java.util.ArrayList<>();
        combined.addAll(shanghaiSymbols);
        combined.addAll(shenzhenSymbols);

        System.out.println("Total Chinese symbols after combining: " + combined.size());

        return combined;
    }

    private List<String> fetchSymbolsByExchange(String exchange, int limit, String suffix) throws IOException {
        StringBuilder urlBuilder = new StringBuilder();
        urlBuilder.append(String.format("%s/stock-screener?marketCapMoreThan=0&limit=%d", BASE_URL, limit * 2)); // Fetch more to account for filtering
        urlBuilder.append(String.format("&exchange=%s", exchange));
        urlBuilder.append(String.format("&apikey=%s", apiKey));

        String url = urlBuilder.toString();
        System.out.println("FMP API URL for " + exchange + ": " + url.replace(apiKey, "***"));

        try (CloseableHttpClient httpClient = HttpClients.createDefault()) {
            HttpGet request = new HttpGet(url);
            try (CloseableHttpResponse response = httpClient.execute(request)) {
                String json = EntityUtils.toString(response.getEntity());

                Type type = new TypeToken<List<Map<String, Object>>>() {
                }.getType();
                List<Map<String, Object>> data = gson.fromJson(json, type);

                if (data == null) {
                    System.out.println("FMP returned null data for " + exchange);
                    return List.of();
                }

                System.out.println("FMP returned " + data.size() + " stocks for " + exchange + " before filtering");

                // Filter to only symbols with the correct suffix and exclude 3xxxxx symbols
                List<String> symbols = data.stream()
                        .map(entry -> (String) entry.get("symbol"))
                        .filter(Objects::nonNull)
                        .map(String::toUpperCase)
                        .filter(symbol -> symbol.endsWith(suffix))
                        .filter(symbol -> !EXCLUDED_CN_SYMBOL_PATTERN.matcher(symbol).matches())
                        .limit(limit)
                        .toList();

                System.out.println("After filtering for " + exchange + ": " + symbols.size() + " stocks");

                return symbols;
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
