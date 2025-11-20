# Channel Detection Logic Analysis

## Overview
The stock trend analyzer implements three types of channels:
1. **Slope Channel (Best Last Channel)** - Automatically detects the best fitting channel using recent data
2. **Rev All Channels (Reversed All Channels)** - Detects multiple channels by analyzing price data in reverse
3. **Manual Channel** - Allows users to manually select a data range and draw a channel

---

## 1. SLOPE CHANNEL (Best Last Channel)

### Purpose
Finds the best-fitting channel using the most recent data points that satisfy trend-breaking conditions.

### Key Files
- **Main Logic**: `/home/user/stock-trend-analyzer/frontend/src/components/PriceChart/utils/slopeChannelOptimizer.js`
- **Utilities**: `/home/user/stock-trend-analyzer/frontend/src/components/PriceChart/utils/channelUtils.js`
- **Hook**: `/home/user/stock-trend-analyzer/frontend/src/components/PriceChart/hooks/useSlopeChannel.js`
- **State Management**: `/home/user/stock-trend-analyzer/frontend/src/components/PriceChart/hooks/useChannelState.js`

### Key Functions

#### 1.1 `findBestChannel()` - Lines 15-136 in slopeChannelOptimizer.js
**Purpose**: Finds optimal channel parameters with trend-breaking logic
**Parameters**:
- `data`: Array of price data points
- `shouldIncludePoint`: Filter function for volume weighting
- `startingLookback`: Optional starting lookback count

**Returns**: Object with `count`, `stdevMultiplier`, `touches`

**Algorithm Flow**:
1. Starts with minimum lookback period (100 points or data length)
2. Calculates linear regression: `slope = (n*ΣXY - ΣX*ΣY) / (n*ΣX² - ΣX²)`
3. Calculates standard deviation of distances from regression line
4. Finds optimal stdev multiplier using `findOptimalStdev()`
5. Iteratively extends lookback period
6. **Trend Break Check**: If new 10% of data breaks existing channel (>50% outside), stops extending
7. Updates channel parameters for extended data

**Key Parameters**:
- `maxOutsidePercent`: 0.05 (5% points allowed outside channel)
- `trendBreakThreshold`: 0.5 (50% of new data must be outside to break)

#### 1.2 `calculateSlopeChannel()` - Lines 147-295 in slopeChannelOptimizer.js
**Purpose**: Calculates slope channel with optimization and caching
**Parameters**:
- `data`: Price data
- `storedParams`: Cached optimization parameters
- `setStoredParams`: Function to update cached parameters
- `useStoredParams`: Whether to use cached values
- `volumeWeighted`: Whether to apply volume weighting

**Returns**: Channel info object containing:
```javascript
{
  channelData,        // Array of {upper, mid, lower} for each point
  slope,              // Linear regression slope
  intercept,          // Linear regression intercept
  channelWidth,       // stdDev * optimalStdevMult
  stdDev,             // Standard deviation of distances
  recentDataCount,    // Number of points used
  percentAbove,       // % of points above midline
  percentBelow,       // % of points below midline
  percentOutside,     // % of points outside channel bounds
  optimalStdevMult,   // Optimal stdev multiplier (1.0-4.0)
  touchCount,         // Number of boundary touches
  rSquared            // R-squared fit value (0-1)
}
```

#### 1.3 `findOptimalStdev()` - Lines 14-61 in channelUtils.js
**Purpose**: Finds the best stdev multiplier for channel width
**Parameters**:
- `includedPoints`: Points to analyze
- `slope`: Channel slope
- `intercept`: Channel intercept
- `stdDev`: Standard deviation
- `options`: Configuration (minMultiplier, maxMultiplier, step, maxOutsidePercent, touchTolerance)

**Algorithm**:
1. Tests multipliers from 1.0 to 4.0 in 0.1 increments
2. For each multiplier:
   - Calculates upper/lower bounds: `upper = slope*x + intercept + (stdDev * mult)`
   - Counts points outside bounds
   - Counts touches: Points within 5% of touch tolerance
3. Returns first multiplier where outsidePercent ≤ 5%
4. Falls back to 2.5 if none valid

**Touch Calculation** (Lines 43-50):
```javascript
const distanceToUpper = Math.abs(point.close - upperBound)
const distanceToLower = Math.abs(point.close - lowerBound)
const boundRange = channelWidth * 2
if (distanceToUpper <= boundRange * 0.05 ||
    distanceToLower <= boundRange * 0.05) {
  touchCount++
}
```

#### 1.4 `checkTrendBreak()` - Lines 131-146 in channelUtils.js
**Purpose**: Determines if new data breaks the trend
**Parameters**:
- `newDataPoints`: New data points to check
- `slope`, `intercept`: Channel parameters
- `channelWidth`: Width of channel
- `threshold`: Breaking threshold (default 0.5 = 50%)

**Returns**: Boolean - true if pointsOutside / total > threshold

---

## 2. CHANNEL BOUNDS CALCULATION

### Linear Regression
**File**: `/home/user/stock-trend-analyzer/frontend/src/components/PriceChart/utils/calculations.js` (Lines 33-73)

**Formula**:
```
slope = (n*ΣXY - ΣX*ΣY) / (n*ΣX² - (ΣX)²)
intercept = (ΣY - slope*ΣX) / n
```

Where:
- X = index position
- Y = close price
- n = number of points

### Channel Bounds
**Calculated in**: `generateChannelData()` - channelUtils.js (Lines 107-120)

```javascript
const midValue = slope * globalIndex + intercept
const upper = midValue + channelWidth
const lower = midValue - channelWidth
```

Where `channelWidth = stdDev * optimalStdevMult`

### Standard Deviation
**Calculation** (slopeChannelOptimizer.js Lines 209-212):
```javascript
const distances = recentData.map((point, index) => {
  const predictedY = slope * index + intercept
  return point.close - predictedY
})
const meanDistance = distances.reduce((a, b) => a + b, 0) / length
const variance = distances.reduce((sum, d) => sum + (d - meanDistance)², 0) / length
const stdDev = Math.sqrt(variance)
```

### R-Squared Calculation
**File**: calculations.js (Lines 82-95)
**Formula**: `R² = 1 - (SS_residual / SS_total)`
- SS_residual = Σ(actual - predicted)²
- SS_total = Σ(actual - mean)²

---

## 3. UI CONTROLS AND INTEGRATION

### Main UI Controls
**File**: `/home/user/stock-trend-analyzer/frontend/src/components/StockAnalyzer.jsx`

#### Slope Channel Controls (Lines 251-314):
- **Line 1196-1201**: "Slope Channel" settings button
- **Line 251-253**: `openSlopeChannelDialog()` function
- **Line 1509-1605**: Configuration dialog component

#### Configuration Dialog Parameters:
1. **Line 1534**: `slopeChannelEnabled` - Toggle main channel on/off
2. **Line 1548**: `slopeChannelVolumeWeighted` - Toggle volume weighting
3. **Line 1569**: `slopeChannelZones` - Number of zones (3-10)

#### Rev All Channel Controls (Lines 317-330):
- **Line 1205-1214**: "Rev All Channel" button
- **Line 317-330**: `toggleRevAllChannel()` function

#### Manual Channel Controls (Lines 332-358):
- **Line 1215-1226**: "Manual Channel" button
- **Line 1227-1270**: Auto/Manual mode toggle buttons

### State Management Hook
**File**: `/home/user/stock-trend-analyzer/frontend/src/components/PriceChart/hooks/useChannelState.js`

**State Variables** (Lines 8-51):
```javascript
optimizedLookbackCount    // Absolute count (persists across period changes)
optimizedStdevMult        // Optimal stdev multiplier
allChannels               // Array of all found channels
allChannelsVisibility     // Visibility toggle for each channel
revAllChannels            // Array of reversed all channels
revAllChannelsVisibility  // Visibility toggle for each
trendChannelVisible       // Main trend channel visibility
manualChannels            // Array of manually drawn channels
```

### Volume-Weighted Filtering
**File**: slopeChannelOptimizer.js (Lines 147-160)

```javascript
let volumeThreshold = 0
if (volumeWeighted) {
  volumeThreshold = calculateVolumeThreshold(data, 0.2)
}

const shouldIncludePoint = (point) => {
  if (!volumeWeighted) return true
  return (point.volume || 0) > volumeThreshold
}
```

**Calculation** (calculations.js Lines 103-112):
- Takes all volumes, sorts them
- Returns value at 20th percentile position
- Filters out low-volume points when calculating regression

---

## 4. CHANNEL DISPLAY ON CHART

### Data Integration
**File**: `/home/user/stock-trend-analyzer/frontend/src/components/PriceChart.jsx`

#### Adding Channel Data to Chart Dataset (Lines 1203-1320):
```javascript
const chartData = displayPrices.map((price, index) => {
  const dataPoint = {
    date: price.date,
    close: price.close,
    // ... other fields
  }

  // Lines 1249-1266: Slope channel
  if (slopeChannelInfo && slopeChannelInfo.channelData[index]) {
    const channel = slopeChannelInfo.channelData[index]
    dataPoint.channelUpper = channel.upper
    dataPoint.channelMid = channel.mid
    dataPoint.channelLower = channel.lower
  }

  // Lines 1269-1295: Rev All channels
  if (revAllChannelEnabled && revAllChannels.length > 0) {
    revAllChannels.forEach((channel, channelIndex) => {
      if (index >= channel.startIndex && index < channel.endIndex) {
        dataPoint[`revAllChannel${channelIndex}Upper`] = upperBound
        dataPoint[`revAllChannel${channelIndex}Mid`] = midValue
        dataPoint[`revAllChannel${channelIndex}Lower`] = lowerBound
      }
    })
  }

  // Lines 1298-1318: Manual channels
  // Similar pattern...
})
```

### Rendering Slope Channel Lines
**File**: PriceChart.jsx (Lines 3410-3446)

```jsx
{slopeChannelEnabled && slopeChannelInfo && (
  <>
    <Line
      dataKey="channelUpper"
      stroke="#10b981"    // Green
      strokeWidth={1.5}
      strokeDasharray="3 3"
      name={`Upper (+${stdevMult}σ)`}
      hide={!trendChannelVisible}
    />
    <Line
      dataKey="channelMid"
      stroke="#3b82f6"    // Blue
      strokeWidth={1.5}
      name={`Trend (${recentDataCount}pts, ${touchCount} touches, R²=${rSquared}%)`}
    />
    <Line
      dataKey="channelLower"
      stroke="#ef4444"    // Red
      strokeWidth={1.5}
      name={`Lower (-${stdevMult}σ)`}
    />
  </>
)}
```

### Rendering Rev All Channels
**File**: PriceChart.jsx (Lines 3448-3501)

Each channel gets:
- Upper line (dashed, 60% opacity)
- Mid line (solid, 100% opacity, bold)
- Lower line (dashed, 60% opacity)
- 8 distinct colors cycling through palette

### Rendering Manual Channels
**File**: PriceChart.jsx (Lines 3503-3550)

Similar to Rev All Channels with green color palette

### Zone Visualization
**File**: PriceChart.jsx (Lines 3317-3330)

Channels are divided into parallel zones (default 8 zones):
- Drawn using `CustomZoneLines` component
- Colors based on volume distribution weights
- Zones calculated from lower to upper bounds

---

## 5. REV ALL CHANNELS DETECTION

**File**: PriceChart.jsx (Lines 424-722)

### `findAllChannelsReversed()` Function

#### Turning Points Detection (Lines 428-452):
1. Uses 3-bar window to find local maxima/minima
2. A point is a turning point if:
   - Local max: current > all points within ±3 bars
   - Local min: current < all points within ±3 bars

#### Channel Finding Algorithm (Lines 459-722):
1. **Iterates through data** starting from oldest
2. **For each position**:
   - Sets minimum lookback from period-aware calculation (Line 425)
   - Tries to extend lookback while channel remains valid
3. **Validation Criteria**:
   - ≥80% of points within bounds (Line 546)
   - Turning points should touch channel bounds (Lines 545-549)
   - Optimal stdev multiplier: 1.0-4.0 in 0.25 increments
4. **Break Detection**:
   - If >15% of points break the channel, move to next position (Line 610)
5. **Channel Info Stored**:
```javascript
{
  startIndex,              // Oldest point
  endIndex,                // Newest point
  slope,
  intercept,
  channelWidth,
  optimalStdevMult,
  touchCount,
  rSquared,
  chronologicalStartIndex  // For reversed calculations
}
```

#### Period-Aware Initial Lookback (Lines 2470-2477):
```javascript
const getInitialLookbackForPeriod = (days) => {
  const daysNum = parseInt(days)
  if (daysNum <= 30) return 15
  if (daysNum <= 90) return 30
  if (daysNum <= 180) return 50
  if (daysNum <= 365) return 80
  return 100
}
```

---

## 6. KEY PARAMETERS AND THRESHOLDS

| Parameter | Value | Location | Purpose |
|-----------|-------|----------|---------|
| minMultiplier | 1.0 | channelUtils.js:16 | Minimum stdev multiplier |
| maxMultiplier | 4.0 | channelUtils.js:16 | Maximum stdev multiplier |
| step | 0.1 | channelUtils.js:18 | Multiplier increment for optimization |
| maxOutsidePercent | 0.05 | slopeChannelOptimizer.js:21 | Max 5% points outside channel |
| trendBreakThreshold | 0.5 | slopeChannelOptimizer.js:22 | 50% of new data outside = break |
| touchTolerance | 0.05 | channelUtils.js:20 | Touch detection tolerance |
| volumePercentile | 0.2 | slopeChannelOptimizer.js:153 | Bottom 20% volume threshold |
| pointsWithinBounds | 0.8 | PriceChart.jsx:546 | Require 80% coverage for valid channels |
| stdevStep (RevAll) | 0.25 | PriceChart.jsx:470 | Rev All stdev increment |

---

## 7. SUMMARY OF DETECTION FLOW

### Slope Channel Flow:
```
Data Fetched
    ↓
useSlopeChannel Hook Activated (enabled + data changes)
    ↓
calculateSlopeChannel() called
    ↓
findBestChannel() - finds optimal lookback
    ↓
Linear regression calculated on selected points
    ↓
findOptimalStdev() - finds best stdev multiplier
    ↓
checkTrendBreak() - validates extension possible
    ↓
Channel parameters cached in state
    ↓
channelData array generated with upper/mid/lower bounds
    ↓
Data added to chartData via chartData.map()
    ↓
Lines rendered with dataKey "channelUpper/Mid/Lower"
```

### Rev All Channels Flow:
```
revAllChannelEnabled toggled
    ↓
findAllChannelsReversed() called with visible data
    ↓
Turning points detected (local max/min)
    ↓
Iterate through data finding sequential channels
    ↓
For each position, extend lookback until break detected
    ↓
Channel array stored in state
    ↓
For each data point, check which channels it belongs to
    ↓
Add revAllChannel${index}Upper/Mid/Lower to dataPoint
    ↓
Render with dataKey pattern matching
```

