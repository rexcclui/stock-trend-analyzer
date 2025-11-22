# Resistance Line (Res Ln) Feature Documentation

## Overview

The **Res Ln** overlay plots a rolling **Point of Control (POC)** line based on the highest-volume price level inside a configurable lookback window. It highlights where trading volume has concentrated most recently and surfaces nearby secondary and tertiary volume clusters to identify likely support/resistance zones.

Key behaviors:
- Uses the visible chart range to size volume bins relative to overall price range for consistent resolution.
- Computes POC plus **second** and **third** volume zones that sit on the same side of price or straddle it, depending on where price sits relative to the POC.
- Colors each line segment by how dominant its volume share is, with thresholds from "minimal" (<5%) to "very high" (50%+).

## User Controls (StockAnalyzer)
- **Toggle:** `Res Ln` button enables/disables the overlay per chart.
- **Lookback Range:** Slider labeled `Rng` (10–365 days, default 100) controls how far back each rolling volume profile looks.
- **Refresh:** The refresh icon recalculates the overlay for the current zoom window without changing settings.
- **Legend:** A mini heat legend shows the color buckets for volume share percentages (red for <5%, amber/orange for mid, lime/green for 20–40%, blue for 50%+).

Controls live in `frontend/src/components/StockAnalyzer.jsx` near the chart toolbar buttons.

## Calculation Flow (PriceChart)
The overlay is computed inside `PriceChart` when `resLnEnabled` is true and price data is available:
1. **Visible Window:** Convert the zoom range into newest-first indices to pull only the visible candles. Compute the overall visible chart range (`high` − `low`) to normalize bin sizing.
2. **Rolling Lookback:** For each visible candle, build a lookback window of `resLnRange` days **after** the current newest-first index (older dates). If there are fewer than 10 candles, fall back to the current close with 0% volume share.
3. **Dynamic Binning:** Determine `numZones = max(5, floor((zoneRange / chartRange) / 0.05))` where `zoneRange` is the min–max span inside the lookback. Derive `zoneHeight = zoneRange / numZones` and distribute each candle's volume evenly across all bins it spans from low to high.
4. **Primary Zone (POC):** Identify the bin with maximum aggregated volume. The POC price is the bin center; `volumePercent` is that bin's share of total volume in the lookback.
5. **Secondary/Tertiary Zones:**
   - If current price is **above** the POC: find the highest-volume bin **above** the POC (secondary resistance) and the highest-volume bin **above current price** (tertiary opposite-side resistance).
   - If current price is **below** the POC: mirror the logic **below** for support levels.
6. **Result Storage:** Each point stores `{ date, highVolZone, volumePercent, secondVolZone, secondVolPercent, thirdVolZone, thirdVolPercent }` which is then merged into chart data so tooltips and renderers can consume it.

## Rendering & Visual Encoding
Rendering occurs inside `PriceChart` with three custom components that read the merged chart data:
- **Primary Line:** Dashed 2px path colored by `volumePercent` thresholds (red <5%, amber 5–8%, orange 8–16%, yellow 16–20%, lime 20–25%, green 25–40%, blue 40%+). Opacity is 0.9 for consistent visibility.
- **Secondary Line:** Dashed 1.5px path with the same color scale, slightly lighter opacity (0.6) to indicate lower priority.
- **Tertiary Line:** Dashed 1px path with 0.5 opacity for the weakest zone.

Tooltip details (visible when hovering) show price and volume share for the primary, secondary, and tertiary zones using the same color thresholds, helping correlate the legend with the numeric values.

## Data Dependencies & Refresh Behavior
- The calculation re-runs when **enabled/disabled**, when **prices** or **zoomRange** change, when the **time period (`days`)** changes, or when the user hits the **refresh** control (increments `resLnRefreshTrigger`).
- The lookback operates on the **newest-first** order of `prices`, so increasing the range looks further back in time from each visible candle.
- Because the chart data is rebuilt after merging Res Ln fields, comparison lines and other overlays operate on the already-enriched dataset without additional wiring.

## File Map
- **UI Controls:** `frontend/src/components/StockAnalyzer.jsx`
- **Computation & Data Merge:** `frontend/src/components/PriceChart.jsx` (lookback calculation, volume binning, result injection)
- **Rendering:** `frontend/src/components/PriceChart.jsx` (custom resistance/secondary/tertiary line renderers and tooltip volume sections)
