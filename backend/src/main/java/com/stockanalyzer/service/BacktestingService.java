package com.stockanalyzer.service;

import com.stockanalyzer.model.*;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class BacktestingService {

    private static final double INITIAL_CAPITAL = 10000.0;
    private static final double COMMISSION = 0.0; // Can be adjusted

    public BacktestResult runBacktest(List<StockPrice> prices, List<Signal> signals) {
        // Reverse to get chronological order
        List<StockPrice> chronologicalPrices = new ArrayList<>(prices);
        Collections.reverse(chronologicalPrices);

        List<Signal> chronologicalSignals = new ArrayList<>(signals);
        Collections.reverse(chronologicalSignals);

        BacktestResult result = new BacktestResult();
        result.setInitialCapital(INITIAL_CAPITAL);

        double cash = INITIAL_CAPITAL;
        int shares = 0;
        double entryPrice = 0.0;
        String entryDate = null;

        List<Trade> trades = new ArrayList<>();
        List<Double> portfolioValues = new ArrayList<>();
        double peak = INITIAL_CAPITAL;
        double maxDrawdown = 0.0;

        for (Signal signal : chronologicalSignals) {
            StockPrice currentPrice = findPriceByDate(chronologicalPrices, signal.getDate());
            if (currentPrice == null) continue;

            if (signal.getType() == Signal.Type.BUY && shares == 0) {
                // Enter position
                shares = (int) (cash / currentPrice.getClose());
                if (shares > 0) {
                    entryPrice = currentPrice.getClose();
                    entryDate = signal.getDate();
                    cash -= shares * entryPrice + COMMISSION;
                }
            } else if (signal.getType() == Signal.Type.SELL && shares > 0) {
                // Exit position
                double exitPrice = currentPrice.getClose();
                cash += shares * exitPrice - COMMISSION;

                Trade trade = new Trade();
                trade.setEntryDate(entryDate);
                trade.setExitDate(signal.getDate());
                trade.setEntryPrice(entryPrice);
                trade.setExitPrice(exitPrice);
                trade.setShares(shares);
                trade.setProfit((exitPrice - entryPrice) * shares - 2 * COMMISSION);
                trade.setProfitPercentage(((exitPrice - entryPrice) / entryPrice) * 100);

                trades.add(trade);

                shares = 0;
            }

            // Track portfolio value
            double portfolioValue = cash + (shares * currentPrice.getClose());
            portfolioValues.add(portfolioValue);

            // Track max drawdown
            if (portfolioValue > peak) {
                peak = portfolioValue;
            }
            double drawdown = ((peak - portfolioValue) / peak) * 100;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        }

        // Close any open position
        if (shares > 0 && !chronologicalPrices.isEmpty()) {
            StockPrice lastPrice = chronologicalPrices.get(chronologicalPrices.size() - 1);
            cash += shares * lastPrice.getClose() - COMMISSION;

            Trade trade = new Trade();
            trade.setEntryDate(entryDate);
            trade.setExitDate(lastPrice.getDate());
            trade.setEntryPrice(entryPrice);
            trade.setExitPrice(lastPrice.getClose());
            trade.setShares(shares);
            trade.setProfit((lastPrice.getClose() - entryPrice) * shares - 2 * COMMISSION);
            trade.setProfitPercentage(((lastPrice.getClose() - entryPrice) / entryPrice) * 100);

            trades.add(trade);
            shares = 0;
        }

        double finalCapital = cash;
        result.setFinalCapital(finalCapital);
        result.setTotalReturn(finalCapital - INITIAL_CAPITAL);
        result.setTotalReturnPercentage(((finalCapital - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100);

        // Calculate statistics
        result.setTotalTrades(trades.size());

        int winningTrades = (int) trades.stream().filter(t -> t.getProfit() > 0).count();
        int losingTrades = (int) trades.stream().filter(t -> t.getProfit() <= 0).count();

        result.setWinningTrades(winningTrades);
        result.setLosingTrades(losingTrades);
        result.setWinRate(trades.isEmpty() ? 0.0 : (double) winningTrades / trades.size() * 100);

        double totalWins = trades.stream().filter(t -> t.getProfit() > 0)
                .mapToDouble(Trade::getProfit).sum();
        double totalLosses = Math.abs(trades.stream().filter(t -> t.getProfit() <= 0)
                .mapToDouble(Trade::getProfit).sum());

        result.setAverageWin(winningTrades == 0 ? 0.0 : totalWins / winningTrades);
        result.setAverageLoss(losingTrades == 0 ? 0.0 : totalLosses / losingTrades);
        result.setProfitFactor(totalLosses == 0 ? 0.0 : totalWins / totalLosses);

        // Calculate Sharpe Ratio (simplified)
        if (!portfolioValues.isEmpty()) {
            List<Double> returns = new ArrayList<>();
            for (int i = 1; i < portfolioValues.size(); i++) {
                double ret = (portfolioValues.get(i) - portfolioValues.get(i - 1)) / portfolioValues.get(i - 1);
                returns.add(ret);
            }

            double avgReturn = returns.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
            double variance = returns.stream()
                    .mapToDouble(r -> Math.pow(r - avgReturn, 2))
                    .average().orElse(0.0);
            double stdDev = Math.sqrt(variance);

            result.setSharpeRatio(stdDev == 0 ? 0.0 : (avgReturn / stdDev) * Math.sqrt(252)); // Annualized
        }

        result.setMaxDrawdown(maxDrawdown);
        result.setTrades(trades);

        return result;
    }

    private StockPrice findPriceByDate(List<StockPrice> prices, String date) {
        return prices.stream()
                .filter(p -> p.getDate().equals(date))
                .findFirst()
                .orElse(null);
    }
}
