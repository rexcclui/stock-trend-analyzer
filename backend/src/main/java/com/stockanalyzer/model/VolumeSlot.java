package com.stockanalyzer.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Represents a price range slot with accumulated volume
 * Used for volume profile analysis
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class VolumeSlot {
    private double start;        // Price range start
    private double end;          // Price range end
    private double volume;       // Total volume in this range
    private double weight;       // Volume weight percentage (0-100)
    private int index;           // Slot index (0 to N)

    /**
     * Check if a price falls within this slot
     */
    public boolean contains(double price) {
        return price >= start && price <= end;
    }

    /**
     * Get the midpoint price of this slot
     */
    public double getMidpoint() {
        return (start + end) / 2.0;
    }

    /**
     * Get the price range span
     */
    public double getRange() {
        return end - start;
    }
}
