package com.stockanalyzer.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent;
import com.google.gson.Gson;
import com.stockanalyzer.model.*;
import com.stockanalyzer.service.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class AnalyzeStockHandler implements RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    private final Gson gson = new Gson();

    @Override
    public APIGatewayProxyResponseEvent handleRequest(APIGatewayProxyRequestEvent input, Context context) {
        APIGatewayProxyResponseEvent response = new APIGatewayProxyResponseEvent();
        response.setHeaders(getCorsHeaders());

        try {
            // Get query parameters
            Map<String, String> queryParams = input.getQueryStringParameters();
            if (queryParams == null) {
                return createErrorResponse(400, "Missing query parameters");
            }

            String symbol = queryParams.get("symbol");
            String days = queryParams.getOrDefault("days", "365");

            if (symbol == null || symbol.isEmpty()) {
                return createErrorResponse(400, "Symbol is required");
            }

            // Get API key from environment
            String apiKey = System.getenv("FMP_API_KEY");
            if (apiKey == null || apiKey.isEmpty()) {
                return createErrorResponse(500, "FMP API key not configured");
            }

            // Fetch stock data
            FinancialModelingPrepClient fmpClient = new FinancialModelingPrepClient(apiKey);
            List<StockPrice> prices;

            if ("max".equalsIgnoreCase(days)) {
                prices = fmpClient.getFullHistoricalData(symbol);
            } else {
                prices = fmpClient.getHistoricalDataByDays(symbol, Integer.parseInt(days));
            }

            if (prices == null || prices.isEmpty()) {
                return createErrorResponse(404, "No data found for symbol: " + symbol);
            }

            // Calculate technical indicators
            TechnicalAnalysisService analysisService = new TechnicalAnalysisService();
            List<TechnicalIndicators> indicators = analysisService.calculateIndicators(prices);

            // Detect signals
            SignalDetectionService signalService = new SignalDetectionService();
            List<Signal> signals = signalService.detectSignals(prices, indicators);

            // Determine trend
            String trend = analysisService.determineTrend(indicators);

            // Generate recommendation
            String recommendation = signalService.generateRecommendation(signals, trend);

            // Build response
            AnalysisResponse analysisResponse = new AnalysisResponse();
            analysisResponse.setSymbol(symbol.toUpperCase());
            analysisResponse.setPrices(prices);
            analysisResponse.setIndicators(indicators);
            analysisResponse.setSignals(signals);
            analysisResponse.setTrend(trend);
            analysisResponse.setRecommendation(recommendation);

            response.setStatusCode(200);
            response.setBody(gson.toJson(analysisResponse));

        } catch (NumberFormatException e) {
            return createErrorResponse(400, "Invalid days parameter: " + e.getMessage());
        } catch (Exception e) {
            context.getLogger().log("Error: " + e.getMessage());
            return createErrorResponse(500, "Internal server error: " + e.getMessage());
        }

        return response;
    }

    private APIGatewayProxyResponseEvent createErrorResponse(int statusCode, String message) {
        APIGatewayProxyResponseEvent response = new APIGatewayProxyResponseEvent();
        response.setHeaders(getCorsHeaders());
        response.setStatusCode(statusCode);

        Map<String, String> body = new HashMap<>();
        body.put("error", message);
        response.setBody(gson.toJson(body));

        return response;
    }

    private Map<String, String> getCorsHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Type", "application/json");
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        headers.put("Access-Control-Allow-Headers", "Content-Type");
        return headers;
    }
}
