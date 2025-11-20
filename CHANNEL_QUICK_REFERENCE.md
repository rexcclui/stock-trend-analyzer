# Channel Detection - Quick Reference Guide

## File Locations & Key Functions

### Core Channel Detection Logic

| Function | File | Lines | Purpose |
|----------|------|-------|---------|
| `findBestChannel()` | `frontend/src/components/PriceChart/utils/slopeChannelOptimizer.js` | 15-136 | Finds optimal lookback & stdev multiplier |
| `calculateSlopeChannel()` | `frontend/src/components/PriceChart/utils/slopeChannelOptimizer.js` | 147-295 | Main channel calculation with caching |
| `findOptimalStdev()` | `frontend/src/components/PriceChart/utils/channelUtils.js` | 14-61 | Optimizes stdev multiplier (1.0-4.0) |
| `checkTrendBreak()` | `frontend/src/components/PriceChart/utils/channelUtils.js` | 131-146 | Validates if trend breaks (>50% outside) |
| `generateChannelData()` | `frontend/src/components/PriceChart/utils/channelUtils.js` | 107-120 | Generates upper/mid/lower bounds |
| `calculateLinearRegression()` | `frontend/src/components/PriceChart/utils/calculations.js` | 33-73 | Linear regression with slope & intercept |

### Hook & State Management

| Hook | File | Lines | Purpose |
|------|------|-------|---------|
| `useSlopeChannel()` | `frontend/src/components/PriceChart/hooks/useSlopeChannel.js` | 14-52 | Main channel calculation hook |
| `useChannelState()` | `frontend/src/components/PriceChart/hooks/useChannelState.js` | 8-51 | State management for all channels |

### UI Controls & Configuration

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Slope Channel Settings | `frontend/src/components/StockAnalyzer.jsx` | 1509-1605 | Configuration dialog for slope channel |
| Slope Channel Button | `frontend/src/components/StockAnalyzer.jsx` | 1196-1201 | Toggle & settings button |
| Rev All Channel Button | `frontend/src/components/StockAnalyzer.jsx` | 1205-1214 | Toggle Rev All Channels |
| Manual Channel Button | `frontend/src/components/StockAnalyzer.jsx` | 1215-1226 | Toggle Manual Channel |
| State Setters | `frontend/src/components/StockAnalyzer.jsx` | 251-358 | Various toggle/update functions |

### Chart Display & Rendering

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Chart Data Creation | `frontend/src/components/PriceChart.jsx` | 1203-1320 | Add channel data to chart dataset |
| Slope Channel Rendering | `frontend/src/components/PriceChart.jsx` | 3410-3446 | Render slope channel lines |
| Rev All Channels Rendering | `frontend/src/components/PriceChart.jsx` | 3448-3501 | Render all detected channels |
| Manual Channels Rendering | `frontend/src/components/PriceChart.jsx` | 3503-3550 | Render manually drawn channels |
| Zone Visualization | `frontend/src/components/PriceChart.jsx` | 3317-3330 | Render parallel zones |

### Rev All Channels Detection

| Function | File | Lines | Purpose |
|----------|------|-------|---------|
| `findAllChannelsReversed()` | `frontend/src/components/PriceChart.jsx` | 424-722 | Detects all channels in data |
| Turning Points Detection | `frontend/src/components/PriceChart.jsx` | 428-452 | Finds local max/min |
| `getInitialLookbackForPeriod()` | `frontend/src/components/PriceChart.jsx` | 2470-2477 | Period-aware minimum lookback |

---

## Key Parameters & Thresholds

### Slope Channel
```javascript
minMultiplier: 1.0              // Minimum stdev multiplier
maxMultiplier: 4.0              // Maximum stdev multiplier
step: 0.1                       // Multiplier increment for optimization
maxOutsidePercent: 0.05         // Allow up to 5% points outside
trendBreakThreshold: 0.5        // 50% of new data outside = break
touchTolerance: 0.05            // 5% tolerance for counting touches
volumePercentile: 0.2           // Bottom 20% volume excluded (if weighted)
defaultMinPoints: 100           // Default minimum lookback
```

### Rev All Channels
```javascript
pointsWithinBounds: 0.8         // Require 80% coverage
stdevStep: 0.25                 // Multiplier increment
breakDetection: 0.15            // >15% points outside = break
minPointsBeforeTurning: 3       // 3-bar window for turning points
```

### Period-Aware Lookback
```javascript
<= 30 days:  minLookback = 15
<= 90 days:  minLookback = 30
<= 180 days: minLookback = 50
<= 365 days: minLookback = 80
> 365 days:  minLookback = 100
```

---

## Return Object Structures

### Slope Channel Info
```javascript
{
  channelData: Array<{upper, mid, lower}>,  // Values for each point
  slope: number,                             // Linear regression slope
  intercept: number,                         // Linear regression intercept
  channelWidth: number,                      // stdDev * optimalStdevMult
  stdDev: number,                            // Standard deviation
  recentDataCount: number,                   // Points used in calculation
  percentAbove: string,                      // % above midline
  percentBelow: string,                      // % below midline
  percentOutside: string,                    // % outside bounds
  optimalStdevMult: number,                  // Final stdev multiplier (1.0-4.0)
  touchCount: number,                        // Boundary touches
  rSquared: number                           // R² value (0-1)
}
```

### Rev All Channel
```javascript
{
  startIndex: number,                        // Oldest point index
  endIndex: number,                          // Newest point index
  slope: number,
  intercept: number,
  channelWidth: number,
  optimalStdevMult: number,
  touchCount: number,
  rSquared: number,
  chronologicalStartIndex: number            // For reverse calculations
}
```

---

## Mathematical Formulas

### Linear Regression
```
slope = (n*ΣXY - ΣX*ΣY) / (n*ΣX² - (ΣX)²)
intercept = (ΣY - slope*ΣX) / n
```

### Channel Bounds
```
midline = slope * index + intercept
upper = midline + (stdDev * multiplier)
lower = midline - (stdDev * multiplier)
```

### Standard Deviation
```
distance = |close - predicted|
mean = Σdistance / n
variance = Σ(distance - mean)² / n
stdDev = √variance
```

### R-Squared
```
R² = 1 - (SSresidual / SStotal)
SSresidual = Σ(actual - predicted)²
SStotal = Σ(actual - mean)²
```

### Touch Detection
```
boundRange = channelWidth * 2
distanceToUpper = |price - upper|
distanceToLower = |price - lower|
isTouching = (distanceToUpper <= boundRange * 0.05) OR 
             (distanceToLower <= boundRange * 0.05)
```

---

## Configuration Dialog Parameters

### StockAnalyzer.jsx Line 1509-1605
1. **Show Best Last Channel** (Line 1534)
   - State: `chart.slopeChannelEnabled`
   - Toggle: `toggleSlopeChannel()`

2. **Volume Weighted** (Line 1548)
   - State: `chart.slopeChannelVolumeWeighted`
   - Toggle: `toggleSlopeChannelVolumeWeighted()`

3. **Number of Zones** (Line 1569)
   - State: `chart.slopeChannelZones`
   - Range: 3-10
   - Setter: `updateSlopeChannelZones()`

---

## State Variables (useChannelState Hook)

```javascript
optimizedLookbackCount        // Cached lookback (persists across period changes)
setOptimizedLookbackCount     // Update cached lookback

optimizedStdevMult            // Cached stdev multiplier
setOptimizedStdevMult         // Update cached multiplier

allChannels                   // Array of all detected channels
setAllChannels                // Update all channels
allChannelsVisibility         // Visibility for each
setAllChannelsVisibility      // Toggle visibility

revAllChannels                // Array of rev all channels
setRevAllChannels             // Update
revAllChannelsVisibility      // Visibility toggle
setRevAllChannelsVisibility   // Toggle

trendChannelVisible           // Slope channel visible flag
setTrendChannelVisible        // Toggle

manualChannels                // Array of manual channels
setManualChannels             // Update
```

---

## Data Flow Diagrams

### Adding Channel Data to Chart
```
displayPrices.map((price, index) => {
  dataPoint = { date, close, ... }
  
  if (slopeChannelInfo) {
    dataPoint.channelUpper = channel.upper
    dataPoint.channelMid = channel.mid
    dataPoint.channelLower = channel.lower
    
    zoneColors.forEach((zone) => {
      dataPoint[`zone${i}Lower`] = calculated
      dataPoint[`zone${i}Upper`] = calculated
    })
  }
  
  if (revAllChannelEnabled) {
    revAllChannels.forEach((channel, i) => {
      dataPoint[`revAllChannel${i}Upper`] = calculated
      dataPoint[`revAllChannel${i}Mid`] = calculated
      dataPoint[`revAllChannel${i}Lower`] = calculated
    })
  }
  
  return dataPoint
})
```

### Rendering Lines
```jsx
<Line dataKey="channelUpper" stroke="#10b981" ... />
<Line dataKey="channelMid" stroke="#3b82f6" ... />
<Line dataKey="channelLower" stroke="#ef4444" ... />

revAllChannels.map((ch, i) => (
  <>
    <Line dataKey={`revAllChannel${i}Upper`} ... />
    <Line dataKey={`revAllChannel${i}Mid`} ... />
    <Line dataKey={`revAllChannel${i}Lower`} ... />
  </>
))
```

---

## Color Scheme

### Slope Channel
- Upper bound: Green (#10b981)
- Midline: Blue (#3b82f6)
- Lower bound: Red (#ef4444)

### Rev All Channels
- Cycles through: Blue, Purple, Amber, Green, Cyan, Orange, Pink, Lime
- Upper/Lower: 60% opacity, dashed
- Midline: 100% opacity, solid

### Manual Channels
- Palette: Green shades (varies)
- Similar to Rev All styling

---

## Common Tasks

### To Modify Stdev Range
File: `frontend/src/components/PriceChart/utils/channelUtils.js` Line 16-18
```javascript
minMultiplier: 1.0,  // Change here
maxMultiplier: 4.0,  // Or here
step: 0.1,          // Or here
```

### To Change Trend Break Threshold
File: `frontend/src/components/PriceChart/utils/slopeChannelOptimizer.js` Line 22
```javascript
const trendBreakThreshold = 0.5  // 50% = break
```

### To Modify Period-Aware Lookback
File: `frontend/src/components/PriceChart.jsx` Lines 2470-2477
```javascript
const getInitialLookbackForPeriod = (days) => {
  // Adjust these values
}
```

### To Change Colors
- Slope Channel: `PriceChart.jsx` Lines 3416, 3427, 3437
- Rev All: `PriceChart.jsx` Lines 3451-3460
- Manual: `PriceChart.jsx` Lines 3506-3512

