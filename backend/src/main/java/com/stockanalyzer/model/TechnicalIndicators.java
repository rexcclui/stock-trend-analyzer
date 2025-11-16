package com.stockanalyzer.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TechnicalIndicators {
    private String date;
    private double sma20;
    private double sma50;
    private double sma200;
    private double ema12;
    private double ema26;
    private double macd;
    private double macdSignal;
    private double macdHistogram;
    private double rsi;
}
