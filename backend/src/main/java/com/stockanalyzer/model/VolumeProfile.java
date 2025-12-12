package com.stockanalyzer.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

/**
 * Volume profile analysis result
 * Contains volume distribution across price ranges
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class VolumeProfile {
    private List<VolumeSlot> slots;
    private int currentSlotIndex;      // Current price slot
    private int previousSlotIndex;     // Previous day's slot
    private double currentPrice;       // Latest price
    private double previousPrice;      // Previous distinct slot price

    // Derived metrics
    private double currentWeight;      // Volume % in current slot
    private double previousWeight;     // Volume % in previous slot
    private double weightDifference;   // Current - Previous weight

    /**
     * Get the current price slot
     */
    public VolumeSlot getCurrentSlot() {
        if (currentSlotIndex >= 0 && currentSlotIndex < slots.size()) {
            return slots.get(currentSlotIndex);
        }
        return null;
    }

    /**
     * Get the previous price slot
     */
    public VolumeSlot getPreviousSlot() {
        if (previousSlotIndex >= 0 && previousSlotIndex < slots.size()) {
            return slots.get(previousSlotIndex);
        }
        return null;
    }

    /**
     * Check if profile is valid
     */
    public boolean isValid() {
        return slots != null && !slots.isEmpty() &&
               currentSlotIndex >= 0 && currentSlotIndex < slots.size();
    }
}
