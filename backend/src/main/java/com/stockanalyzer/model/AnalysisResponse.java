package com.stockanalyzer.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AnalysisResponse {
    private String symbol;
    private List<StockPrice> prices;
    private List<TechnicalIndicators> indicators;
    private List<Signal> signals;
    private String trend;
    private String recommendation;
}
