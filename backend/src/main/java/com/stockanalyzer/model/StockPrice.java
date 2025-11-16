package com.stockanalyzer.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class StockPrice {
    private String date;
    private double open;
    private double high;
    private double low;
    private double close;
    private long volume;
}
