# Channel Detection Logic - Complete Analysis Index

This directory contains comprehensive analysis of the channel detection system in the stock trend analyzer.

## Documentation Files

### 1. CHANNEL_DETECTION_ANALYSIS.md (14KB)
**Most Detailed Reference**

Complete technical analysis covering:
- Overview of all 3 channel types (Slope, Rev All, Manual)
- Deep dive into each function with algorithms and formulas
- Mathematical derivations (linear regression, standard deviation, R²)
- Complete parameter documentation
- Data flow diagrams
- Return object structures
- State management details

**Use this for:** Understanding the complete implementation, mathematical foundations, and detailed function behavior

### 2. CHANNEL_QUICK_REFERENCE.md (9.8KB)
**Quick Lookup Guide**

Quick reference tables including:
- File locations and line numbers (tabular format)
- Key parameters and thresholds
- Return object structures
- Mathematical formulas
- Configuration dialog parameters
- State variables
- Data flow diagrams
- Color schemes
- Common tasks and where to modify

**Use this for:** Quick lookups, finding line numbers, understanding parameters, quick modifications

### 3. CHANNEL_FILES_SUMMARY.txt (8.7KB)
**Absolute File Paths Reference**

Structured reference with:
- Complete absolute file paths for all relevant files
- Line numbers for every function and parameter
- All key thresholds with exact locations
- Color definitions with hex codes
- Data flow summaries
- Dependencies and related documentation

**Use this for:** Copy-paste file paths, navigating the codebase, finding specific lines

---

## Quick Navigation by Task

### I need to understand how channels work:
Start with CHANNEL_DETECTION_ANALYSIS.md - Overview section

### I need to find a specific function:
Use CHANNEL_QUICK_REFERENCE.md - "File Locations & Key Functions" table

### I need to modify channel parameters:
1. Find the parameter in CHANNEL_QUICK_REFERENCE.md - "Key Parameters & Thresholds"
2. Get exact file and line from CHANNEL_FILES_SUMMARY.txt
3. Read context in CHANNEL_DETECTION_ANALYSIS.md

### I need to add a new channel type:
1. Study existing channel detection in CHANNEL_DETECTION_ANALYSIS.md
2. Reference UI controls in CHANNEL_QUICK_REFERENCE.md
3. Use CHANNEL_FILES_SUMMARY.txt to navigate to rendering code

### I need to understand the math:
Go to CHANNEL_QUICK_REFERENCE.md - "Mathematical Formulas" section

### I need to trace data flow:
See "Summary of Detection Flow" in CHANNEL_DETECTION_ANALYSIS.md

---

## Key File Locations (Absolute Paths)

**Core Detection Logic:**
- `/home/user/stock-trend-analyzer/frontend/src/components/PriceChart/utils/slopeChannelOptimizer.js`
- `/home/user/stock-trend-analyzer/frontend/src/components/PriceChart/utils/channelUtils.js`
- `/home/user/stock-trend-analyzer/frontend/src/components/PriceChart/utils/calculations.js`

**React Hooks:**
- `/home/user/stock-trend-analyzer/frontend/src/components/PriceChart/hooks/useSlopeChannel.js`
- `/home/user/stock-trend-analyzer/frontend/src/components/PriceChart/hooks/useChannelState.js`

**UI Components:**
- `/home/user/stock-trend-analyzer/frontend/src/components/StockAnalyzer.jsx` (controls)
- `/home/user/stock-trend-analyzer/frontend/src/components/PriceChart.jsx` (rendering & detection)

---

## Key Concepts

### Last Channel (Best Last Channel)
- Finds the best-fitting channel using recent data
- Uses trend-breaking detection to limit lookback
- Optimizes stdev multiplier between 1.0-4.0
- Allows volume-weighted filtering
- Single channel per chart

### All Channels
- Detects multiple channels throughout the data
- Works backwards through price data
- Identifies turning points (local max/min)
- Extends each channel until trend breaks (>15% outside)
- Multiple channels can be displayed

### Manual Channel
- User-selectable data range
- Similar calculation to slope channel
- Allows manual line drawing on chart

---

## Important Parameters

| Parameter | Default | Meaning |
|-----------|---------|---------|
| minMultiplier | 1.0 | Minimum channel width in std devs |
| maxMultiplier | 4.0 | Maximum channel width in std devs |
| maxOutsidePercent | 5% | Max points allowed outside (slope) |
| trendBreakThreshold | 50% | When to stop extending channel |
| pointsWithinBounds | 80% | Minimum coverage for valid channel (rev all) |
| touchTolerance | 5% | Tolerance for counting boundary touches |
| volumePercentile | 20% | Bottom % excluded when volume-weighted |

---

## State Structure

All channel state managed by `useChannelState()` hook:

```javascript
optimizedLookbackCount      // Cached optimal lookback for slope channel
optimizedStdevMult          // Cached optimal stdev multiplier
revAllChannels              // Array of detected channels
revAllChannelsVisibility    // Visibility toggle for each
allChannels                 // All found channels (for future expansion)
manualChannels              // User-drawn channels
trendChannelVisible         // Main trend channel visibility
```

---

## Color Scheme

**Last Channel:**
- Upper: Green (#10b981)
- Mid: Blue (#3b82f6)
- Lower: Red (#ef4444)

**All Channels:** 8-color rotation
- Blue, Purple, Amber, Green, Cyan, Orange, Pink, Lime

**Manual Channels:** Green shades
- Various emerald/teal tones

---

## Data Structures

### Last Channel Output
```javascript
{
  channelData,           // [{upper, mid, lower}, ...]
  slope,                 // Linear regression slope
  intercept,             // Y-intercept
  channelWidth,          // stdDev * multiplier
  stdDev,                // Standard deviation
  recentDataCount,       // Number of points used
  percentAbove,          // % above midline
  percentBelow,          // % below midline
  percentOutside,        // % outside bounds
  optimalStdevMult,      // 1.0-4.0
  touchCount,            // Boundary touches
  rSquared               // Goodness of fit (0-1)
}
```

### All Channel Object
```javascript
{
  startIndex,            // Oldest point
  endIndex,              // Newest point
  slope,
  intercept,
  channelWidth,
  optimalStdevMult,
  touchCount,
  rSquared,
  chronologicalStartIndex
}
```

---

## Formulas

**Linear Regression:**
```
slope = (n*ΣXY - ΣX*ΣY) / (n*ΣX² - (ΣX)²)
intercept = (ΣY - slope*ΣX) / n
```

**Channel Bounds:**
```
upper = (slope*x + intercept) + (stdDev * multiplier)
lower = (slope*x + intercept) - (stdDev * multiplier)
```

**Standard Deviation:**
```
stdDev = √[Σ(distance - mean)² / n]
where distance = |close - predicted|
```

**R-Squared:**
```
R² = 1 - (SSresidual / SStotal)
```

---

## Related Documentation

- `SLOPE_CHANNEL_DOCUMENTATION.md` - Detailed slope channel specifics
- `FIND_ALL_CHANNEL_DOCUMENTATION.md` - Rev All channels specifics
- `README.md` - Project overview

---

## Quick Command Reference

View full analysis:
```bash
cat /home/user/stock-trend-analyzer/CHANNEL_DETECTION_ANALYSIS.md
```

View quick reference:
```bash
cat /home/user/stock-trend-analyzer/CHANNEL_QUICK_REFERENCE.md
```

View file paths:
```bash
cat /home/user/stock-trend-analyzer/CHANNEL_FILES_SUMMARY.txt
```

View main slope channel logic:
```bash
cat /home/user/stock-trend-analyzer/frontend/src/components/PriceChart/utils/slopeChannelOptimizer.js | head -200
```

Find specific function:
```bash
grep -n "function_name" /home/user/stock-trend-analyzer/frontend/src/components/PriceChart/utils/slopeChannelOptimizer.js
```

---

## Summary

The channel detection system is split into:
1. **Detection Logic** (util functions)
2. **State Management** (hooks)
3. **UI Controls** (React components)
4. **Chart Rendering** (Recharts integration)

All channels use linear regression with standard deviation-based bounds.
The main difference is how lookback period is determined:
- Slope: Extends until trend breaks
- Rev All: Detects all turning points, creates channels between them
- Manual: User-specified range

Use these documents as your reference while working with the channel detection code.
