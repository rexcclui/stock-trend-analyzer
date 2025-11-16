package com.stockanalyzer.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class BacktestResult {
    private double initialCapital;
    private double finalCapital;
    private double totalReturn;
    private double totalReturnPercentage;
    private int totalTrades;
    private int winningTrades;
    private int losingTrades;
    private double winRate;
    private double averageWin;
    private double averageLoss;
    private double profitFactor;
    private double sharpeRatio;
    private double maxDrawdown;
    private List<Trade> trades;
}
