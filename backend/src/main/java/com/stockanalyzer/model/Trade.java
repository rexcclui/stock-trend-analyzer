package com.stockanalyzer.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Trade {
    private String entryDate;
    private String exitDate;
    private double entryPrice;
    private double exitPrice;
    private int shares;
    private double profit;
    private double profitPercentage;
}
