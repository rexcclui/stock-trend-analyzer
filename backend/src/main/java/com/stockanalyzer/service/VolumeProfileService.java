package com.stockanalyzer.service;

import com.stockanalyzer.model.*;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for volume profile analysis and breakthrough detection
 */
public class VolumeProfileService {

    private static final int DEFAULT_SLOT_COUNT = 40;
    private static final int MAX_SLOT_COUNT = 60;
    private static final int MIN_SLOT_COUNT = 20;

    // Breakthrough thresholds (tunable parameters)
    private static final double LOW_WEIGHT_THRESHOLD = 6.0;      // % (current slot must be thin)
    private static final double WEIGHT_DROP_THRESHOLD = -6.0;    // % (drop from previous)
    private static final double VOLUME_DIFF_THRESHOLD = 5.0;     // % (neighbor differential)

    // Confidence scoring
    private static final double BASE_CONFIDENCE = 0.60;
    private static final double POTENTIAL_BREAK_BONUS = 0.15;

    /**
     * Build volume profile from price history
     * Divides price range into buckets and calculates volume distribution
     */
    public VolumeProfile buildVolumeProfile(List<StockPrice> prices) {
        if (prices == null || prices.isEmpty()) {
            return new VolumeProfile();
        }

        // Sort prices chronologically
        List<StockPrice> sorted = new ArrayList<>(prices);
        sorted.sort(Comparator.comparing(StockPrice::getDate));

        // Find price range (min/max)
        double minPrice = sorted.stream()
                .mapToDouble(StockPrice::getLow)
                .min()
                .orElse(0.0);

        double maxPrice = sorted.stream()
                .mapToDouble(StockPrice::getHigh)
                .max()
                .orElse(0.0);

        double priceRange = maxPrice - minPrice;
        if (priceRange <= 0) {
            return new VolumeProfile();
        }

        // Determine slot count (adaptive based on price range)
        int slotCount = calculateOptimalSlotCount(priceRange);
        double slotSize = priceRange / slotCount;

        // Create slots
        List<VolumeSlot> slots = new ArrayList<>();
        for (int i = 0; i < slotCount; i++) {
            double start = minPrice + (i * slotSize);
            double end = (i == slotCount - 1) ? maxPrice : start + slotSize;
            slots.add(new VolumeSlot(start, end, 0.0, 0.0, i));
        }

        // Accumulate volume in each slot
        for (StockPrice price : sorted) {
            double refPrice = price.getClose();
            int slotIndex = findSlotIndex(slots, refPrice);
            if (slotIndex >= 0) {
                VolumeSlot slot = slots.get(slotIndex);
                slot.setVolume(slot.getVolume() + price.getVolume());
            }
        }

        // Calculate volume weights (percentages)
        double totalVolume = slots.stream()
                .mapToDouble(VolumeSlot::getVolume)
                .sum();

        if (totalVolume > 0) {
            for (VolumeSlot slot : slots) {
                double weight = (slot.getVolume() / totalVolume) * 100.0;
                slot.setWeight(weight);
            }
        }

        // Find current and previous slot indices
        StockPrice latest = sorted.get(sorted.size() - 1);
        double currentPrice = latest.getClose();
        int currentIndex = findSlotIndex(slots, currentPrice);

        // Find previous DISTINCT slot (different from current)
        int previousIndex = -1;
        double previousPrice = 0.0;
        for (int i = sorted.size() - 2; i >= 0; i--) {
            double price = sorted.get(i).getClose();
            int idx = findSlotIndex(slots, price);
            if (idx != currentIndex && idx >= 0) {
                previousIndex = idx;
                previousPrice = price;
                break;
            }
        }

        // Build profile object
        VolumeProfile profile = new VolumeProfile();
        profile.setSlots(slots);
        profile.setCurrentSlotIndex(currentIndex);
        profile.setPreviousSlotIndex(previousIndex);
        profile.setCurrentPrice(currentPrice);
        profile.setPreviousPrice(previousPrice);

        // Calculate derived metrics
        if (currentIndex >= 0 && currentIndex < slots.size()) {
            profile.setCurrentWeight(slots.get(currentIndex).getWeight());
        }
        if (previousIndex >= 0 && previousIndex < slots.size()) {
            profile.setPreviousWeight(slots.get(previousIndex).getWeight());
        }
        profile.setWeightDifference(
                profile.getCurrentWeight() - profile.getPreviousWeight()
        );

        return profile;
    }

    /**
     * Detect if current price shows breakthrough pattern
     */
    public VolumeBreakthroughSignal detectBreakthrough(
            VolumeProfile profile,
            String date,
            double price
    ) {
        if (profile == null || !profile.isValid()) {
            return null;
        }

        List<VolumeSlot> slots = profile.getSlots();
        int currentIndex = profile.getCurrentSlotIndex();
        int previousIndex = profile.getPreviousSlotIndex();

        if (currentIndex < 0 || previousIndex < 0 || currentIndex == previousIndex) {
            return null;  // No breakthrough if same slot or invalid
        }

        VolumeSlot currentSlot = slots.get(currentIndex);
        VolumeSlot previousSlot = slots.get(previousIndex);

        double currentWeight = currentSlot.getWeight();
        double previousWeight = previousSlot.getWeight();
        double weightDrop = currentWeight - previousWeight;

        // Determine direction of move
        boolean movedUp = currentIndex > previousIndex;
        String direction = movedUp ? "up" : "down";

        // Check neighboring slots for volume resistance/support
        List<VolumeSlot> neighborSlots = getNeighborSlots(
                slots,
                currentIndex,
                movedUp ? -1 : 1,  // Check below if moved up, above if moved down
                5
        );

        // Check if ANY neighbor has ≥5% weight difference
        boolean hasVolumeBreak = neighborSlots.stream()
                .anyMatch(slot -> Math.abs(slot.getWeight() - currentWeight) >= VOLUME_DIFF_THRESHOLD);

        if (!hasVolumeBreak) {
            return null;  // No significant volume differential
        }

        // Calculate resistance gaps
        double lowerGap = calculateResistanceGap(slots, currentIndex, -1);
        double upperGap = calculateResistanceGap(slots, currentIndex, 1);

        // Create signal
        VolumeBreakthroughSignal signal = new VolumeBreakthroughSignal();
        signal.setDate(date);
        signal.setType(movedUp ? Signal.Type.BUY : Signal.Type.SELL);
        signal.setPrice(price);
        signal.setDirection(direction);
        signal.setCurrentWeight(currentWeight);
        signal.setWeightDrop(weightDrop);
        signal.setLowerResistanceGap(lowerGap);
        signal.setUpperResistanceGap(upperGap);

        // Check if meets POTENTIAL BREAK criteria (strict)
        boolean isPotential = meetsPotentialBreakCriteria(
                currentWeight,
                weightDrop,
                lowerGap,
                upperGap,
                movedUp
        );
        signal.setPotentialBreak(isPotential);

        // Calculate confidence
        double confidence = calculateConfidence(signal, isPotential);
        signal.setConfidence(confidence);
        signal.setReason(buildReason(signal));

        return signal;
    }

    /**
     * Calculate optimal slot count based on price range
     */
    private int calculateOptimalSlotCount(double priceRange) {
        // Use more slots for larger price ranges
        int slotCount = (int) Math.ceil(priceRange / 0.5);
        return Math.max(MIN_SLOT_COUNT, Math.min(MAX_SLOT_COUNT, slotCount));
    }

    /**
     * Find which slot contains the given price
     */
    private int findSlotIndex(List<VolumeSlot> slots, double price) {
        for (int i = 0; i < slots.size(); i++) {
            if (slots.get(i).contains(price)) {
                return i;
            }
        }
        // Handle edge case: price above max slot
        if (!slots.isEmpty() && price >= slots.get(slots.size() - 1).getStart()) {
            return slots.size() - 1;
        }
        return -1;
    }

    /**
     * Get neighboring slots in specified direction
     */
    private List<VolumeSlot> getNeighborSlots(
            List<VolumeSlot> slots,
            int currentIndex,
            int step,      // -1 for below, +1 for above
            int maxCount
    ) {
        List<VolumeSlot> neighbors = new ArrayList<>();
        int idx = currentIndex + step;
        int count = 0;

        while (idx >= 0 && idx < slots.size() && count < maxCount) {
            neighbors.add(slots.get(idx));
            idx += step;
            count++;
        }

        return neighbors;
    }

    /**
     * Calculate gap to nearest resistance zone
     * Returns the price distance to nearest high-volume zone
     */
    private double calculateResistanceGap(
            List<VolumeSlot> slots,
            int currentIndex,
            int direction  // -1 for down, +1 for up
    ) {
        if (currentIndex < 0 || currentIndex >= slots.size()) {
            return 0.0;
        }

        double currentWeight = slots.get(currentIndex).getWeight();
        double threshold = currentWeight + VOLUME_DIFF_THRESHOLD;

        int idx = currentIndex + direction;
        while (idx >= 0 && idx < slots.size()) {
            VolumeSlot slot = slots.get(idx);
            if (slot.getWeight() >= threshold) {
                // Found resistance zone - return distance
                double currentMid = slots.get(currentIndex).getMidpoint();
                double resistanceMid = slot.getMidpoint();
                return Math.abs(resistanceMid - currentMid);
            }
            idx += direction;
        }

        return Double.MAX_VALUE;  // No resistance found
    }

    /**
     * Check if meets potential breakthrough criteria (STRICT FILTER)
     */
    private boolean meetsPotentialBreakCriteria(
            double currentWeight,
            double weightDrop,
            double lowerGap,
            double upperGap,
            boolean movedUp
    ) {
        // Criteria 1: Low current weight (thin zone)
        boolean hasLowCurrentWeight = currentWeight < LOW_WEIGHT_THRESHOLD;

        // Criteria 2: Significant weight drop from previous
        boolean hasPrevWeightDrop = weightDrop < WEIGHT_DROP_THRESHOLD;

        // Criteria 3: Pattern-specific checks
        if (movedUp) {
            // For upward breakthrough:
            // - Need thick support below (small gap)
            // - Need thin resistance above (large gap)
            boolean hasThickSupportBelow = lowerGap < upperGap;
            return hasLowCurrentWeight && hasPrevWeightDrop && hasThickSupportBelow;
        } else {
            // For downward breakthrough:
            // - Need thick resistance above (small gap)
            // - Need thin support below (large gap)
            boolean hasThickResistanceAbove = upperGap < lowerGap;
            return hasLowCurrentWeight && hasPrevWeightDrop && hasThickResistanceAbove;
        }
    }

    /**
     * Calculate signal confidence based on strength of patterns
     */
    private double calculateConfidence(
            VolumeBreakthroughSignal signal,
            boolean isPotential
    ) {
        double confidence = BASE_CONFIDENCE;

        // Boost for potential break (strict criteria)
        if (isPotential) {
            confidence += POTENTIAL_BREAK_BONUS;
        }

        // Boost for very low current weight (thin zone)
        if (signal.getCurrentWeight() < 4.0) {
            confidence += 0.05;
        }

        // Boost for large weight drop
        if (signal.getWeightDrop() < -8.0) {
            confidence += 0.05;
        }

        // Boost for clear resistance pattern
        double resistanceRatio = signal.getDirection().equals("up")
                ? signal.getLowerResistanceGap() / Math.max(1.0, signal.getUpperResistanceGap())
                : signal.getUpperResistanceGap() / Math.max(1.0, signal.getLowerResistanceGap());

        if (resistanceRatio > 2.0) {
            confidence += 0.05;
        }

        return Math.min(0.95, confidence);
    }

    /**
     * Build human-readable reason for signal
     */
    private String buildReason(VolumeBreakthroughSignal signal) {
        StringBuilder reason = new StringBuilder();
        reason.append("Volume Breakthrough ");
        reason.append(signal.getDirection().equals("up") ? "Up" : "Down");
        reason.append(" (");
        reason.append(String.format("%.1f%%", signal.getCurrentWeight()));
        reason.append(" weight, ");
        reason.append(String.format("%.1f%%", signal.getWeightDrop()));
        reason.append(" drop)");

        if (signal.isPotentialBreak()) {
            reason.append(" - POTENTIAL BREAK");
        }

        return reason.toString();
    }
}
