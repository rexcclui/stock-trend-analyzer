package com.stockanalyzer.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Signal {
    public enum Type {
        BUY, SELL, HOLD
    }

    private String date;
    private Type type;
    private double price;
    private String reason;
    private double confidence;
}
