package com.stockanalyzer.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Volume breakthrough signal with detailed metrics
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class VolumeBreakthroughSignal {
    private String date;
    private Signal.Type type;              // BUY or SELL
    private double price;
    private String direction;              // "up" or "down"
    private double currentWeight;          // Current slot volume %
    private double weightDrop;             // From previous slot
    private double lowerResistanceGap;     // Gap to support (%)
    private double upperResistanceGap;     // Gap to resistance (%)
    private double confidence;             // 0.0 to 1.0
    private String reason;                 // Description
    private boolean isPotentialBreak;      // Meets strict criteria

    /**
     * Convert to standard Signal object
     */
    public Signal toSignal() {
        return new Signal(date, type, price, reason, confidence);
    }
}
