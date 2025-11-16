package com.stockanalyzer.service;

import com.stockanalyzer.model.Signal;
import com.stockanalyzer.model.StockPrice;
import com.stockanalyzer.model.TechnicalIndicators;

import java.util.ArrayList;
import java.util.List;

public class SignalDetectionService {

    public List<Signal> detectSignals(List<StockPrice> prices, List<TechnicalIndicators> indicators) {
        List<Signal> signals = new ArrayList<>();

        for (int i = 1; i < indicators.size(); i++) {
            TechnicalIndicators current = indicators.get(i);
            TechnicalIndicators previous = indicators.get(i - 1);
            StockPrice currentPrice = prices.get(i);

            // MACD Crossover
            if (current.getMacd() > current.getMacdSignal() &&
                previous.getMacd() <= previous.getMacdSignal()) {
                signals.add(new Signal(
                    current.getDate(),
                    Signal.Type.BUY,
                    currentPrice.getClose(),
                    "MACD Bullish Crossover",
                    0.75
                ));
            } else if (current.getMacd() < current.getMacdSignal() &&
                      previous.getMacd() >= previous.getMacdSignal()) {
                signals.add(new Signal(
                    current.getDate(),
                    Signal.Type.SELL,
                    currentPrice.getClose(),
                    "MACD Bearish Crossover",
                    0.75
                ));
            }

            // Golden Cross / Death Cross
            if (current.getSma50() > 0 && current.getSma200() > 0) {
                if (current.getSma50() > current.getSma200() &&
                    previous.getSma50() <= previous.getSma200()) {
                    signals.add(new Signal(
                        current.getDate(),
                        Signal.Type.BUY,
                        currentPrice.getClose(),
                        "Golden Cross (SMA50 > SMA200)",
                        0.85
                    ));
                } else if (current.getSma50() < current.getSma200() &&
                          previous.getSma50() >= previous.getSma200()) {
                    signals.add(new Signal(
                        current.getDate(),
                        Signal.Type.SELL,
                        currentPrice.getClose(),
                        "Death Cross (SMA50 < SMA200)",
                        0.85
                    ));
                }
            }

            // RSI Oversold/Overbought
            if (current.getRsi() < 30 && previous.getRsi() >= 30) {
                signals.add(new Signal(
                    current.getDate(),
                    Signal.Type.BUY,
                    currentPrice.getClose(),
                    "RSI Oversold (<30)",
                    0.70
                ));
            } else if (current.getRsi() > 70 && previous.getRsi() <= 70) {
                signals.add(new Signal(
                    current.getDate(),
                    Signal.Type.SELL,
                    currentPrice.getClose(),
                    "RSI Overbought (>70)",
                    0.70
                ));
            }

            // Price crosses SMA20
            if (currentPrice.getClose() > current.getSma20() &&
                prices.get(i - 1).getClose() <= previous.getSma20() &&
                current.getSma20() > 0) {
                signals.add(new Signal(
                    current.getDate(),
                    Signal.Type.BUY,
                    currentPrice.getClose(),
                    "Price crossed above SMA20",
                    0.65
                ));
            } else if (currentPrice.getClose() < current.getSma20() &&
                      prices.get(i - 1).getClose() >= previous.getSma20() &&
                      current.getSma20() > 0) {
                signals.add(new Signal(
                    current.getDate(),
                    Signal.Type.SELL,
                    currentPrice.getClose(),
                    "Price crossed below SMA20",
                    0.65
                ));
            }
        }

        return signals;
    }

    public String generateRecommendation(List<Signal> signals, String trend) {
        if (signals.isEmpty()) {
            return "HOLD - No clear signals detected";
        }

        // Get recent signals (last 5)
        int recentCount = Math.min(5, signals.size());
        List<Signal> recentSignals = signals.subList(0, recentCount);

        long buyCount = recentSignals.stream()
            .filter(s -> s.getType() == Signal.Type.BUY)
            .count();

        long sellCount = recentSignals.stream()
            .filter(s -> s.getType() == Signal.Type.SELL)
            .count();

        if (trend.contains("BULLISH") && buyCount > sellCount) {
            return "STRONG BUY - Multiple bullish signals with positive trend";
        } else if (trend.contains("BULLISH") || buyCount > sellCount) {
            return "BUY - Bullish indicators present";
        } else if (trend.contains("BEARISH") && sellCount > buyCount) {
            return "STRONG SELL - Multiple bearish signals with negative trend";
        } else if (trend.contains("BEARISH") || sellCount > buyCount) {
            return "SELL - Bearish indicators present";
        } else {
            return "HOLD - Mixed signals, wait for clearer direction";
        }
    }
}
