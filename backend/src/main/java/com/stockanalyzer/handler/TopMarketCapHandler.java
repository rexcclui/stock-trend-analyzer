package com.stockanalyzer.handler;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent;
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent;
import com.google.gson.Gson;
import com.stockanalyzer.service.FinancialModelingPrepClient;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class TopMarketCapHandler implements RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    private final Gson gson = new Gson();

    @Override
    public APIGatewayProxyResponseEvent handleRequest(APIGatewayProxyRequestEvent input, Context context) {
        APIGatewayProxyResponseEvent response = new APIGatewayProxyResponseEvent();
        response.setHeaders(getCorsHeaders());

        try {
            Map<String, String> queryParams = input.getQueryStringParameters();
            int limit = 2000;

            if (queryParams != null && queryParams.get("limit") != null) {
                limit = Integer.parseInt(queryParams.get("limit"));
            }

            if (limit <= 0) {
                return createErrorResponse(400, "Limit must be greater than zero");
            }

            String apiKey = System.getenv("FMP_API_KEY");
            if (apiKey == null || apiKey.isEmpty()) {
                return createErrorResponse(500, "FMP API key not configured");
            }

            FinancialModelingPrepClient fmpClient = new FinancialModelingPrepClient(apiKey);
            List<String> symbols = fmpClient.getTopMarketCapSymbols(limit);

            Map<String, Object> body = new HashMap<>();
            body.put("symbols", symbols);

            response.setStatusCode(200);
            response.setBody(gson.toJson(body));
        } catch (NumberFormatException e) {
            return createErrorResponse(400, "Invalid limit parameter: " + e.getMessage());
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
        headers.put("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        headers.put("Access-Control-Allow-Headers", "*");
        return headers;
    }
}
