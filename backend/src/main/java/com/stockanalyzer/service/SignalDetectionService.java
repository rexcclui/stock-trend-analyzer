package com.stockanalyzer.service;

import com.stockanalyzer.model.Signal;
import com.stockanalyzer.model.StockPrice;
import com.stockanalyzer.model.TechnicalIndicators;
import com.stockanalyzer.model.VolumeProfile;
import com.stockanalyzer.model.VolumeBreakthroughSignal;

import java.util.ArrayList;
import java.util.List;

public class SignalDetectionService {

    private final VolumeProfileService volumeProfileService = new VolumeProfileService();

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

    /**
     * Detect volume breakthrough signals with technical indicator filters
     * Combines volume profile analysis with trend/momentum filters
     */
    public List<Signal> detectVolumeBreakthroughSignals(
            List<StockPrice> prices,
            List<TechnicalIndicators> indicators
    ) {
        List<Signal> signals = new ArrayList<>();

        if (prices == null || prices.size() < 20 || indicators == null) {
            return signals;
        }

        // Scan through each day to detect breakthroughs
        for (int i = 20; i < prices.size(); i++) {
            StockPrice current = prices.get(i);
            TechnicalIndicators currentInd = indicators.get(i);

            // Build volume profile up to this date (walk-forward)
            List<StockPrice> historyUpToDate = prices.subList(0, i + 1);
            VolumeProfile dailyProfile = volumeProfileService.buildVolumeProfile(historyUpToDate);

            // Detect if this day shows breakthrough
            VolumeBreakthroughSignal volumeSignal = volumeProfileService.detectBreakthrough(
                    dailyProfile,
                    current.getDate(),
                    current.getClose()
            );

            if (volumeSignal == null) {
                continue;  // No breakthrough detected
            }

            // FILTER 1: Only take BUY signals in uptrend, SELL in downtrend
            boolean isBullishTrend = currentInd.getSma50() > 0 && currentInd.getSma200() > 0 &&
                                     currentInd.getSma50() > currentInd.getSma200();
            boolean isBearishTrend = currentInd.getSma50() > 0 && currentInd.getSma200() > 0 &&
                                     currentInd.getSma50() < currentInd.getSma200();

            if (volumeSignal.getType() == Signal.Type.BUY && !isBullishTrend) {
                continue;  // Skip counter-trend BUY
            }
            if (volumeSignal.getType() == Signal.Type.SELL && !isBearishTrend) {
                continue;  // Skip counter-trend SELL
            }

            // FILTER 2: RSI not extreme
            if (volumeSignal.getType() == Signal.Type.BUY && currentInd.getRsi() > 70) {
                continue;  // Skip overbought
            }
            if (volumeSignal.getType() == Signal.Type.SELL && currentInd.getRsi() < 30) {
                continue;  // Skip oversold
            }

            // FILTER 3: Volume confirmation (today's volume > recent average)
            double avgVolume = calculateAverageVolume(prices, i, 20);
            if (current.getVolume() < avgVolume * 1.3) {
                continue;  // Insufficient volume confirmation
            }

            // FILTER 4: MACD supporting (optional boost)
            boolean macdSupports = (volumeSignal.getType() == Signal.Type.BUY)
                    ? currentInd.getMacd() > currentInd.getMacdSignal()
                    : currentInd.getMacd() < currentInd.getMacdSignal();

            // Boost confidence if MACD confirms
            double finalConfidence = volumeSignal.getConfidence();
            if (macdSupports) {
                finalConfidence = Math.min(0.95, finalConfidence + 0.05);
            }

            // Create signal
            signals.add(new Signal(
                    current.getDate(),
                    volumeSignal.getType(),
                    current.getClose(),
                    volumeSignal.getReason(),
                    finalConfidence
            ));
        }

        return signals;
    }

    /**
     * Calculate average volume over lookback period
     */
    private double calculateAverageVolume(List<StockPrice> prices, int endIndex, int lookback) {
        int startIndex = Math.max(0, endIndex - lookback);
        double totalVolume = 0.0;
        int count = 0;

        for (int i = startIndex; i <= endIndex; i++) {
            totalVolume += prices.get(i).getVolume();
            count++;
        }

        return count > 0 ? totalVolume / count : 0.0;
    }
}
