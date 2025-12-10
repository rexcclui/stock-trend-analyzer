package com.stockanalyzer.service;

import com.stockanalyzer.model.Signal;
import com.stockanalyzer.model.StockPrice;
import com.stockanalyzer.model.TechnicalIndicators;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SignalDetectionServiceTest {

    private final SignalDetectionService service = new SignalDetectionService();

    @Test
    void detectSignals_handlesBullishAndBearishCrosses() {
        List<StockPrice> prices = Arrays.asList(
            new StockPrice("2024-01-01", 10, 11, 9, 9, 1000),
            new StockPrice("2024-01-02", 11, 13, 10, 12, 1200),
            new StockPrice("2024-01-03", 10, 11, 8, 8, 1100)
        );

        List<TechnicalIndicators> indicators = Arrays.asList(
            new TechnicalIndicators("2024-01-01", 10, 100, 100, 0, 0, 0, 0, 0, 35),
            new TechnicalIndicators("2024-01-02", 11, 101, 100, 0, 0, 1, 0, 1, 25),
            new TechnicalIndicators("2024-01-03", 9, 99, 100, 0, 0, -1, 0, -1, 75)
        );

        List<Signal> signals = service.detectSignals(prices, indicators);

        long buySignals = signals.stream().filter(s -> s.getType() == Signal.Type.BUY).count();
        long sellSignals = signals.stream().filter(s -> s.getType() == Signal.Type.SELL).count();

        assertEquals(4, buySignals, "Expected MACD, golden cross, RSI, and SMA20 bullish signals");
        assertEquals(4, sellSignals, "Expected MACD, death cross, RSI, and SMA20 bearish signals");
        assertEquals(8, signals.size(), "All signals should be captured across iterations");
    }

    @Test
    void generateRecommendation_prioritizesSignalsAndTrend() {
        List<Signal> signals = Arrays.asList(
            new Signal("2024-01-03", Signal.Type.BUY, 8.0, "Price crossed above SMA20", 0.65),
            new Signal("2024-01-02", Signal.Type.BUY, 12.0, "MACD Bullish Crossover", 0.75),
            new Signal("2024-01-01", Signal.Type.SELL, 9.0, "RSI Overbought (>70)", 0.70)
        );

        String strongBuy = service.generateRecommendation(signals, "BULLISH UPTREND");
        String buy = service.generateRecommendation(signals, "SIDEWAYS");

        assertTrue(strongBuy.startsWith("STRONG BUY"), "Bullish trend with more buys favors strong buy");
        assertTrue(buy.startsWith("BUY"), "More buys than sells should suggest buy in neutral trend");

        List<Signal> sellSignals = Arrays.asList(
            new Signal("2024-01-03", Signal.Type.SELL, 8.0, "Price crossed below SMA20", 0.65),
            new Signal("2024-01-02", Signal.Type.SELL, 12.0, "MACD Bearish Crossover", 0.75)
        );

        String strongSell = service.generateRecommendation(sellSignals, "BEARISH DOWNTREND");
        String sell = service.generateRecommendation(sellSignals, "NEUTRAL");

        assertTrue(strongSell.startsWith("STRONG SELL"), "Bearish trend with sell signals favors strong sell");
        assertTrue(sell.startsWith("SELL"), "More sell signals should suggest sell in neutral trend");

        String hold = service.generateRecommendation(List.of(), "NEUTRAL");
        assertTrue(hold.startsWith("HOLD"), "No signals returns hold recommendation");
        assertFalse(hold.contains("BUY"), "Hold recommendation should not include buy wording");
    }
}
