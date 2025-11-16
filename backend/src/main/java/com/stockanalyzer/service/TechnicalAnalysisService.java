package com.stockanalyzer.service;

import com.stockanalyzer.model.StockPrice;
import com.stockanalyzer.model.TechnicalIndicators;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class TechnicalAnalysisService {

    public List<TechnicalIndicators> calculateIndicators(List<StockPrice> prices) {
        // Reverse to get chronological order (oldest first)
        List<StockPrice> chronologicalPrices = new ArrayList<>(prices);
        Collections.reverse(chronologicalPrices);

        List<TechnicalIndicators> indicators = new ArrayList<>();

        for (int i = 0; i < chronologicalPrices.size(); i++) {
            TechnicalIndicators indicator = new TechnicalIndicators();
            indicator.setDate(chronologicalPrices.get(i).getDate());

            // Calculate SMAs
            indicator.setSma20(calculateSMA(chronologicalPrices, i, 20));
            indicator.setSma50(calculateSMA(chronologicalPrices, i, 50));
            indicator.setSma200(calculateSMA(chronologicalPrices, i, 200));

            // Calculate EMAs
            indicator.setEma12(calculateEMA(chronologicalPrices, i, 12));
            indicator.setEma26(calculateEMA(chronologicalPrices, i, 26));

            // Calculate MACD
            double ema12 = indicator.getEma12();
            double ema26 = indicator.getEma26();
            double macd = ema12 - ema26;
            indicator.setMacd(macd);

            // Calculate RSI
            indicator.setRsi(calculateRSI(chronologicalPrices, i, 14));

            // Add indicator to list first
            indicators.add(indicator);

            // Calculate MACD Signal (9-day EMA of MACD) - needs to be after adding to list
            if (i >= 34) { // Need at least 26 + 9 periods
                double macdSignal = calculateMACDSignal(indicators, i, 9);
                indicator.setMacdSignal(macdSignal);
                indicator.setMacdHistogram(macd - macdSignal);
            }
        }

        // Reverse back to match input order (newest first)
        Collections.reverse(indicators);
        return indicators;
    }

    private double calculateSMA(List<StockPrice> prices, int currentIndex, int period) {
        if (currentIndex < period - 1) {
            return 0.0;
        }

        double sum = 0.0;
        for (int i = currentIndex - period + 1; i <= currentIndex; i++) {
            sum += prices.get(i).getClose();
        }

        return sum / period;
    }

    private double calculateEMA(List<StockPrice> prices, int currentIndex, int period) {
        if (currentIndex < period - 1) {
            return 0.0;
        }

        double multiplier = 2.0 / (period + 1);

        // Start with SMA for the first calculation
        if (currentIndex == period - 1) {
            return calculateSMA(prices, currentIndex, period);
        }

        // Calculate previous EMA
        double previousEMA = calculateEMA(prices, currentIndex - 1, period);

        // EMA = (Close - Previous EMA) * multiplier + Previous EMA
        return (prices.get(currentIndex).getClose() - previousEMA) * multiplier + previousEMA;
    }

    private double calculateMACDSignal(List<TechnicalIndicators> indicators, int currentIndex, int period) {
        if (currentIndex < period - 1) {
            return 0.0;
        }

        double multiplier = 2.0 / (period + 1);

        // Start with SMA of MACD values
        if (currentIndex == period - 1) {
            double sum = 0.0;
            for (int i = currentIndex - period + 1; i <= currentIndex; i++) {
                sum += indicators.get(i).getMacd();
            }
            return sum / period;
        }

        double previousSignal = indicators.get(currentIndex - 1).getMacdSignal();
        double currentMacd = indicators.get(currentIndex).getMacd();

        return (currentMacd - previousSignal) * multiplier + previousSignal;
    }

    private double calculateRSI(List<StockPrice> prices, int currentIndex, int period) {
        if (currentIndex < period) {
            return 50.0; // Neutral RSI
        }

        double gains = 0.0;
        double losses = 0.0;

        for (int i = currentIndex - period + 1; i <= currentIndex; i++) {
            double change = prices.get(i).getClose() - prices.get(i - 1).getClose();
            if (change > 0) {
                gains += change;
            } else {
                losses += Math.abs(change);
            }
        }

        double avgGain = gains / period;
        double avgLoss = losses / period;

        if (avgLoss == 0) {
            return 100.0;
        }

        double rs = avgGain / avgLoss;
        return 100.0 - (100.0 / (1.0 + rs));
    }

    public String determineTrend(List<TechnicalIndicators> indicators) {
        if (indicators.isEmpty()) {
            return "UNKNOWN";
        }

        TechnicalIndicators latest = indicators.get(0);

        // Check SMA alignment
        boolean bullishSMA = latest.getSma20() > latest.getSma50() &&
                            latest.getSma50() > latest.getSma200();
        boolean bearishSMA = latest.getSma20() < latest.getSma50() &&
                            latest.getSma50() < latest.getSma200();

        // Check MACD
        boolean bullishMACD = latest.getMacd() > latest.getMacdSignal();

        // Check RSI
        boolean overbought = latest.getRsi() > 70;
        boolean oversold = latest.getRsi() < 30;

        if (bullishSMA && bullishMACD && !overbought) {
            return "STRONG_BULLISH";
        } else if (bullishSMA || (bullishMACD && !overbought)) {
            return "BULLISH";
        } else if (bearishSMA && !bullishMACD && !oversold) {
            return "STRONG_BEARISH";
        } else if (bearishSMA || (!bullishMACD && !oversold)) {
            return "BEARISH";
        } else {
            return "NEUTRAL";
        }
    }
}
