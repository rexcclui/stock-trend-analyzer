# Volume Zones Documentation

## Overview

Volume zones are visual indicators that show **where trading activity concentrated** within each detected channel. They help identify key support and resistance levels based on actual trading volume rather than just price action.

## Visual Components

### Zone Structure (Dynamic by Period)
- Each channel (All Channel and All Channel) is divided into **3 or 5 equal horizontal zones** depending on the time period:
  - **Period < 1 year**: **3 zones** (simpler view for shorter timeframes)
  - **Period ≥ 1 year**: **5 zones** (detailed analysis for longer timeframes)
- Zones are numbered from bottom to top: Zone 0 (bottom) → Zone 2/4 (top)
- Each zone boundary is drawn as a **dashed line** (2px dash, 2px gap)

### Zone Boundaries (5 Zones - Period ≥ 1 Year)
```
Channel Upper ─────────────── Zone 4 Upper (100%)
              ╱╱╱╱╱╱╱╱╱╱╱╱╱╱ Zone 4: 80% - 100%
              ─────────────── Zone 3 Upper (80%)
              ╱╱╱╱╱╱╱╱╱╱╱╱╱╱ Zone 3: 60% - 80%
              ─────────────── Zone 2 Upper (60%)
Channel Mid   ╱╱╱╱╱╱╱╱╱╱╱╱╱╱ Zone 2: 40% - 60%
              ─────────────── Zone 1 Upper (40%)
              ╱╱╱╱╱╱╱╱╱╱╱╱╱╱ Zone 1: 20% - 40%
              ─────────────── Zone 0 Upper (20%)
              ╱╱╱╱╱╱╱╱╱╱╱╱╱╱ Zone 0: 0% - 20%
Channel Lower ─────────────── Zone 0 Lower (0%)
```

### Zone Boundaries (3 Zones - Period < 1 Year)
```
Channel Upper ─────────────── Zone 2 Upper (100%)
              ╱╱╱╱╱╱╱╱╱╱╱╱╱╱ Zone 2: 66.7% - 100%
              ─────────────── Zone 1 Upper (66.7%)
Channel Mid   ╱╱╱╱╱╱╱╱╱╱╱╱╱╱ Zone 1: 33.3% - 66.7%
              ─────────────── Zone 0 Upper (33.3%)
              ╱╱╱╱╱╱╱╱╱╱╱╱╱╱ Zone 0: 0% - 33.3%
Channel Lower ─────────────── Zone 0 Lower (0%)
```

## Volume Percentage Calculation

### Formula
```javascript
volumeWeight = volumeInZone / totalVolume
displayPercentage = volumeWeight × 100
```

### Process
1. **Identify Zone Range**: For each zone, calculate its vertical boundaries within the channel
2. **Sum Volume in Zone**: Add up all trading volume for price points that fell within this zone's range
3. **Calculate Total Volume**: Sum all trading volume across the entire channel
4. **Compute Percentage**: Divide zone volume by total volume and multiply by 100

### Example (5 Zones - Period ≥ 1 Year)
```
Total channel volume: 10,000 units

Zone 4 (80-100%): 800 units   → 8.0%
Zone 3 (60-80%):  1,500 units → 15.0%
Zone 2 (40-60%):  5,200 units → 52.0%  ← Highest volume!
Zone 1 (20-40%):  2,000 units → 20.0%
Zone 0 (0-20%):   500 units   → 5.0%
```

### Example (3 Zones - Period < 1 Year)
```
Total channel volume: 10,000 units

Zone 2 (66.7-100%): 2,000 units → 20.0%
Zone 1 (33.3-66.7%): 6,500 units → 65.0%  ← Highest volume!
Zone 0 (0-33.3%):    1,500 units → 15.0%
```

## Visual Encoding System

### 1. Line Opacity (Boldness)
**Formula:**
```javascript
opacity = 0.3 + (volumeWeight × 0.6)
```

**Mapping:**
- **0% volume**: 30% opacity (very faint, barely visible)
- **50% volume**: 60% opacity (medium visibility)
- **100% volume**: 90% opacity (very bold, prominent)

**Interpretation:**
- Faint lines = price passed through quickly
- Bold lines = price spent significant time here

### 2. Line Color (Lightness)
**Formula:**
```javascript
lightness = 65% - (volumeWeight × 30%)
```

**Mapping:**
- **0% volume**: 65% lightness (lighter/brighter color)
- **50% volume**: 50% lightness (medium tone)
- **100% volume**: 35% lightness (darker/deeper color)

**Interpretation:**
- Lighter colors = low volume zone
- Darker colors = high volume zone (stronger support/resistance)

### 3. Percentage Label Font
**Color Formula:**
```javascript
fontLightness = max(20%, lightness - (volumeWeight × 30%))
```

**Weight:**
```javascript
fontWeight = volumeWeight > 30% ? 800 : 700
```

**Mapping:**
| Volume % | Font Color | Font Weight | Visual Effect |
|----------|------------|-------------|---------------|
| 0-10% | Light (≈50%) | 700 (Bold) | Subtle, readable |
| 10-30% | Medium (≈35%) | 700 (Bold) | Clear visibility |
| 30-50% | Dark (≈25%) | 800 (Extra Bold) | Strong emphasis |
| 50%+ | Very Dark (≈20%) | 800 (Extra Bold) | Maximum emphasis |

**Interpretation:**
- Darker, bolder text = Higher volume = More significant price level
- Lighter text = Lower volume = Less significant level

## Color Palette by Channel

Each channel uses a consistent HSL color with adjusted lightness:

| Channel | Base Color | HSL Hue |
|---------|------------|---------|
| Ch1/Rev1 | Blue | 217° |
| Ch2/Rev2 | Purple | 266° |
| Ch3/Rev3 | Amber | 38° |
| Ch4/Rev4 | Green | 160° |
| Ch5/Rev5 | Cyan | 188° |
| Ch6/Rev6 | Orange | 25° |
| Ch7/Rev7 | Pink | 330° |
| Ch8/Rev8 | Lime | 75° |

All colors use **70% saturation** with variable lightness based on volume.

## Label Positioning

### Location
- **Position**: Right edge of each zone line
- **Offset**: 5px from line endpoint (text-anchor: end)
- **Vertical**: Centered on zone line (dominant-baseline: middle)

### Background Box
- **Size**: 25px × 16px
- **Fill**: `rgba(15, 23, 42, 0.85)` (dark semi-transparent)
- **Border**: Matches zone line color (0.5px stroke)
- **Radius**: 2px rounded corners

### Text Style
- **Size**: 11px
- **Format**: `"XX.X%"` (one decimal place)
- **Example**: `"8.5%"`, `"52.3%"`, `"100.0%"`

## Interpretation Guide

### High Volume Zones (40%+)
- **Visual**: Dark, bold, opaque lines with dark bold text
- **Meaning**: Price spent significant time at this level
- **Trading Significance**: **Strong support/resistance**
- **Example**: If Zone 2 shows 52.3%, the middle of the channel was heavily traded

### Medium Volume Zones (15-40%)
- **Visual**: Medium tone, moderate opacity, bold text
- **Meaning**: Moderate trading activity
- **Trading Significance**: **Moderate support/resistance**

### Low Volume Zones (5-15%)
- **Visual**: Light color, low opacity, normal text
- **Meaning**: Price passed through without much activity
- **Trading Significance**: **Weak support/resistance**

### Very Low Volume Zones (<5%)
- **Visual**: Very faint, barely visible, light text
- **Meaning**: Price rarely touched this level
- **Trading Significance**: **Minimal importance**

## Practical Trading Applications

### 1. Identifying Key Levels
Look for zones with **30%+ volume**:
- These represent price levels where most trading occurred
- Act as natural support/resistance in future price movement
- Higher percentages = stronger levels

### 2. Gap Detection
Low volume zones (<10%) indicate **air gaps**:
- Price may move quickly through these levels
- Less likely to find support/resistance
- Useful for setting stop-loss orders

### 3. Volume Distribution Analysis
Compare zone percentages across a channel:
- **Bottom-heavy** (Zone 0-1 high): Support area tested repeatedly
- **Top-heavy** (Zone 3-4 high): Resistance area tested repeatedly
- **Middle-heavy** (Zone 2 high): Range-bound trading
- **Evenly distributed**: Healthy trending channel

### 4. Multi-Channel Confirmation
When All Channel and All Channel show similar high-volume zones:
- Indicates **confirmed support/resistance** from different time perspectives
- Higher confidence in level significance
- Better entry/exit points

## Technical Implementation

### Location in Code
- **Calculation**: `frontend/src/components/PriceChart.jsx:932-987`
- **Rendering (All Channel)**: `frontend/src/components/PriceChart.jsx:2634-2764`
- **Rendering (All Channel)**: `frontend/src/components/PriceChart.jsx:2767-2884`

### Key Configuration
```javascript
// Dynamic zone count based on period
const daysNum = parseInt(days) || 365
const numZones = daysNum < 365 ? 3 : 5  // 3 zones for <1yr, 5 zones for ≥1yr

// Visual encoding parameters
const minOpacity = 0.3                // Minimum line opacity
const maxOpacity = 0.9                // Maximum line opacity
const minLightness = 35               // Darkest color (high volume)
const maxLightness = 65               // Lightest color (low volume)
const fontWeightThreshold = 0.3       // 30% volume threshold for bold text
```

### Data Flow
1. Channel detected → `findAllChannels()` or `findAllChannelsReversed()`
2. Volume zones calculated → `calculateAllChannelZones()`
3. Zone data added to chart points → `chartData.map()`
4. Visual rendering → `CustomAllChannelZoneLines` / `CustomRevAllChannelZoneLines`

## Examples

### Example 1: Strong Support
```
Zone 4:  8.5%  ───── Light, faint (rarely reached upper bound)
Zone 3: 12.3%  ───── Light, visible
Zone 2: 18.9%  ───── Medium tone
Zone 1: 24.7%  ───── Medium-dark, clearer
Zone 0: 35.6%  ───── DARK, BOLD (heavy support at lower bound)
```
**Interpretation**: Strong buying support at channel bottom prevented further drops.

### Example 2: Resistance Testing
```
Zone 4: 42.1%  ───── DARK, BOLD (heavy resistance at upper bound)
Zone 3: 26.8%  ───── Medium-dark
Zone 2: 15.3%  ───── Medium tone
Zone 1:  9.5%  ───── Light, faint
Zone 0:  6.3%  ───── Very light (barely visible)
```
**Interpretation**: Repeated attempts to break resistance failed, creating high volume at top.

### Example 3: Balanced Channel
```
Zone 4: 18.2%  ───── Medium tone
Zone 3: 21.5%  ───── Medium tone
Zone 2: 22.8%  ───── Medium tone
Zone 1: 19.3%  ───── Medium tone
Zone 0: 18.2%  ───── Medium tone
```
**Interpretation**: Healthy distribution, price moved freely within channel bounds.

## Updates History

### Version 2.1 (Current)
- **Dynamic Zone Count**: Automatically adjusts based on time period
  - Period < 1 year (< 365 days): **3 zones** for cleaner, simpler visualization
  - Period ≥ 1 year: **5 zones** for detailed long-term analysis
- **Rationale**: Shorter timeframes have less data, so fewer zones provide clearer signals without noise

### Version 2.0
- **Zones**: Increased from 3 to 5 zones for finer granularity
- **Font Color**: Dynamic darkening based on volume percentage
- **Font Weight**: Bold (800) for volumes >30%, normal bold (700) otherwise
- **Formula**: Font lightness = `max(20%, lightness - volumeWeight × 30%)`

### Version 1.0
- **Zones**: 3 zones per channel
- **Font Color**: Static color matching zone line
- **Font Weight**: Fixed at 700 (bold)

## See Also
- [Channel Finding Documentation](./FIND_ALL_CHANNEL_DOCUMENTATION.md) - Trend detection algorithm
- Main implementation: `frontend/src/components/PriceChart.jsx`
- UI controls: `frontend/src/components/StockAnalyzer.jsx`
