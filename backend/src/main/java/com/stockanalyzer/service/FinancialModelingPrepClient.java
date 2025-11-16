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

public class FinancialModelingPrepClient {
    private static final String BASE_URL = "https://financialmodelingprep.com/api/v3";
    private final String apiKey;
    private final Gson gson;

    public FinancialModelingPrepClient(String apiKey) {
        this.apiKey = apiKey;
        this.gson = new Gson();
    }

    public List<StockPrice> getHistoricalData(String symbol, String from, String to) throws IOException {
        String url = String.format("%s/historical-price-full/%s?from=%s&to=%s&apikey=%s",
                BASE_URL, symbol, from, to, apiKey);

        try (CloseableHttpClient httpClient = HttpClients.createDefault()) {
            HttpGet request = new HttpGet(url);
            try (CloseableHttpResponse response = httpClient.execute(request)) {
                String json = EntityUtils.toString(response.getEntity());

                // Parse the response
                Type type = new TypeToken<Map<String, Object>>(){}.getType();
                Map<String, Object> data = gson.fromJson(json, type);

                // Extract historical data
                List<Map<String, Object>> historical = (List<Map<String, Object>>) data.get("historical");

                return historical.stream()
                    .map(this::mapToStockPrice)
                    .toList();
            }
        }
    }

    public List<StockPrice> getHistoricalDataByDays(String symbol, int days) throws IOException {
        String url = String.format("%s/historical-price-full/%s?timeseries=%d&apikey=%s",
                BASE_URL, symbol, days, apiKey);

        try (CloseableHttpClient httpClient = HttpClients.createDefault()) {
            HttpGet request = new HttpGet(url);
            try (CloseableHttpResponse response = httpClient.execute(request)) {
                String json = EntityUtils.toString(response.getEntity());

                Type type = new TypeToken<Map<String, Object>>(){}.getType();
                Map<String, Object> data = gson.fromJson(json, type);

                List<Map<String, Object>> historical = (List<Map<String, Object>>) data.get("historical");

                return historical.stream()
                    .map(this::mapToStockPrice)
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
