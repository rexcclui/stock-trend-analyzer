# Best Channel Feature Documentation

## Overview

The Best Channel feature automatically discovers and displays up to 5 optimal price channels within the visible chart range by simulating thousands of parameter combinations. Unlike manual channels or single-trend channels, Best Channel identifies multiple distinct channels that maximize turning point touches while keeping most data within bounds.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Feature Description](#feature-description)
3. [User Interface](#user-interface)
4. [How It Works](#how-it-works)
5. [Algorithm Details](#algorithm-details)
6. [Overlap Filtering](#overlap-filtering)
7. [Visualization](#visualization)
8. [Best Practices](#best-practices)
9. [Technical Specifications](#technical-specifications)

---

## Quick Start

### Enabling Best Channels

1. Click the **"Best Channel"** button on the chart toolbar
2. Best Channels will automatically calculate and display on the chart
3. Up to 5 channels will be shown, each with a distinct color
4. Click a channel in the legend to toggle its visibility
5. Zoom or change time periods to recalculate channels for the visible range

### Basic Workflow

```
Enable → Auto-Simulate → Display Top 5 → Toggle Visibility (optional)
```

---

## Feature Description

### What is a Best Channel?

A Best Channel consists of three parallel trend lines:
- **Upper Boundary**: Resistance level (midline + channel width)
- **Mid Line**: Linear regression trend line
- **Lower Boundary**: Support level (midline - channel width)

The width is determined by `standard deviation × stdev multiplier`, where the stdev multiplier is optimized to maximize turning point touches.

### Key Capabilities

- **Automatic Discovery**: Simulates thousands of combinations of start points, lengths, and stdev multipliers
- **Multiple Channels**: Shows up to 5 distinct channels that don't overlap more than 30%
- **Adaptive Parameters**: Automatically adjusts simulation parameters based on visible data length
- **Touch Optimization**: Finds channels that maximize turning point touches at channel boundaries
- **Statistical Validation**: Only shows channels where ≤10% of points are outside bounds (±5% tolerance)
- **Dynamic Updates**: Recalculates when zooming, panning, or changing time periods
- **Individual Labels**: Each channel displays its stdev multiplier and containment percentage

### What Makes a Channel "Best"?

Channels are ranked by:
1. **Touch Count** (primary): Number of turning points (local maxima/minima) within 5% of channel bounds
2. **Channel Length** (secondary): Longer channels are preferred when touch counts are equal
3. **Containment**: Must keep ≥90% of points within bounds (±5% tolerance)

---

## User Interface

### Main Display

Best Channels appear as colored dashed lines overlaid on the price chart:

```
        Upper (dashed)  ╌╌╌╌╌╌╌╌╌╌╌╌
             ↕ (channel width = stdDev × multiplier)
      Middle (solid)    ─ ─ ─ ─ ─ ─ ─  ← Trend line
             ↕
        Lower (dashed)  ╌╌╌╌╌╌╌╌╌╌╌╌
                            ↓
                     [2.50σ 85%]  ← Label at midpoint
```

### Channel Colors

Channels use distinct colors for easy identification:
1. **Best1**: Amber (#f59e0b)
2. **Best2**: Orange (#f97316)
3. **Best3**: Yellow (#eab308)
4. **Best4**: Light Orange (#fb923c)
5. **Best5**: Light Amber (#fbbf24)

### Legend Entries

Each channel appears in the legend with format:
```
Best1 (250pts, 8 touches)
Best2 (180pts, 6 touches)
Best3 (150pts, 5 touches)
```

Where:
- **250pts**: Length of channel in data points
- **8 touches**: Number of turning points touching bounds

### Channel Labels

Each visible channel displays a label at the midpoint under its bottom boundary:

```
┌──────────┐
│ 2.50σ 85%│  ← Stdev multiplier and containment percentage
└──────────┘
```

- **2.50σ**: The stdev multiplier used for this channel
- **85%**: Percentage of points within channel bounds (±5% tolerance)

---

## How It Works

### High-Level Process

```
1. User enables Best Channel
   ↓
2. System determines visible data range
   ↓
3. Calculate adaptive simulation parameters
   ↓
4. Simulate thousands of channel combinations
   ↓
5. Rank channels by touches and length
   ↓
6. Filter overlapping channels (>30% overlap)
   ↓
7. Display top 5 distinct channels
   ↓
8. Add labels at midpoint under bottom boundaries
```

### Adaptive Parameters

The simulation parameters adjust based on visible data length:

| Visible Data Points | Min Length | Max Length | Start Step | Length Step |
|---------------------|-----------|-----------|-----------|-------------|
| 100 points | 20 (20%) | 80 (80%) | 2 (2%) | 2 (2%) |
| 500 points | 50 (10%) | 400 (80%) | 10 (2%) | 10 (2%) |
| 1000 points | 100 (10%) | 800 (80%) | 20 (2%) | 20 (2%) |

This ensures:
- **Smaller ranges**: Fine-grained search with smaller steps
- **Larger ranges**: Coarse-grained search to maintain performance
- **Consistent coverage**: Always searches 10-80% of visible range

---

## Algorithm Details

### Step 1: Turning Point Detection

Identifies local maxima and minima using a sliding window (default: 3 points):

```javascript
// For each point, check if it's higher/lower than all surrounding points
for (let i = 3; i < data.length - 3; i++) {
  const current = data[i].close

  // Check ±3 points
  if (all neighbors < current) → Local Maximum
  if (all neighbors > current) → Local Minimum
}
```

**Purpose**: Turning points represent potential support/resistance touches

### Step 2: Channel Simulation

For each combination of parameters:

```javascript
// Pseudo-code
for (startIndex = 0 to maxStartIndex, step by startStep) {
  for (length = minLength to maxLength, step by lengthStep) {
    // Calculate linear regression
    regression = calculateRegression(data[startIndex...startIndex+length])

    // Try different stdev multipliers
    for (stdevMult = 1.0 to 4.0, step by 0.5) {
      channelWidth = regression.stdDev × stdevMult

      // Validate containment (≤10% outside)
      if (percentOutside > 0.1) continue

      // Count turning points touching bounds (±5% tolerance)
      touches = countTouchingPoints(turningPoints, bounds, tolerance=0.05)

      // Store if valid
      if (touches > 0) {
        candidates.push({
          startIndex, endIndex, slope, intercept,
          channelWidth, stdevMultiplier, touchCount
        })
      }
    }
  }
}
```

**Tested Combinations** (typical 5Y view with 1260 points):
- Start positions: ~50 positions (2% steps)
- Lengths: ~40 lengths (2% steps)
- Stdev multipliers: 7 values [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]
- **Total**: ~14,000 combinations tested

### Step 3: Touch Counting

A turning point "touches" a bound if:

1. **Distance Check**: Within 5% of bound distance
2. **Type Check**: Maxima touch upper bound, minima touch lower bound
3. **Side Check**: Maxima must be above midline, minima must be below midline

```javascript
// For a maximum turning point
const distanceToUpper = |turningPoint.value - upperBound|
const touchRange = (channelWidth × 2) × 0.05  // 5% of total range

if (distanceToUpper <= touchRange &&
    turningPoint.type === 'max' &&
    turningPoint.value >= midline) {
  touchCount++
}
```

### Step 4: Containment Validation

Channels must keep ≥90% of points within bounds (with 5% tolerance):

```javascript
// For each point in channel
const upperBound = predictedY + channelWidth
const lowerBound = predictedY - channelWidth
const tolerance = channelWidth × 0.05

// Point is "outside" if beyond bounds + tolerance
if (actualY > upperBound + tolerance ||
    actualY < lowerBound - tolerance) {
  pointsOutside++
}

// Reject if >10% outside
if (pointsOutside / totalPoints > 0.1) {
  rejectChannel()
}
```

### Step 5: Ranking

Channels are sorted by:

```javascript
// Primary: Touch count (descending)
// Secondary: Length (descending)
channels.sort((a, b) => {
  if (b.touchCount !== a.touchCount) {
    return b.touchCount - a.touchCount
  }
  return b.length - a.length
})
```

---

## Overlap Filtering

### Purpose

Prevents cluttering the chart with similar channels by filtering out those that overlap significantly.

### Algorithm

```javascript
filtered = [channels[0]]  // Always keep the best channel

for (candidate in channels[1...]) {
  hasOverlap = false

  for (existing in filtered) {
    // Calculate overlap range
    overlapStart = max(candidate.start, existing.start)
    overlapEnd = min(candidate.end, existing.end)
    overlap = max(0, overlapEnd - overlapStart + 1)

    // Calculate overlap ratio
    overlapRatio = overlap / candidate.length

    // If >30% overlap with ANY shown channel, skip this candidate
    if (overlapRatio > 0.30) {
      hasOverlap = true
      break
    }
  }

  // Only add if it doesn't overlap >30% with any shown channel
  if (!hasOverlap) {
    filtered.push(candidate)
  }
}

return filtered.slice(0, 5)  // Limit to top 5
```

### Example Scenario

Given candidates sorted by rank:

```
Best1: Days   1-100  [10 touches] ✅ Always shown
Best2: Days   5-105  [ 9 touches] ❌ Overlaps 95% with Best1 → Skip
Best3: Days  10-110  [ 9 touches] ❌ Overlaps 90% with Best1 → Skip
Best4: Days 120-200  [ 8 touches] ✅ Overlaps  0% with Best1 → Show
Best5: Days 125-205  [ 7 touches] ❌ Overlaps 96% with Best4 → Skip
Best6: Days 220-300  [ 7 touches] ✅ Overlaps  0% with any  → Show
Best7: Days 250-320  [ 6 touches] ❌ Overlaps 71% with Best6 → Skip
Best8: Days 330-400  [ 6 touches] ✅ Overlaps  0% with any  → Show
```

**Result**: Shows Best1, Best4, Best6, Best8 (4 distinct channels)

### Why 30%?

- **Too low (e.g., 10%)**: May show only 1-2 channels even when distinct ones exist
- **30% (current)**: Good balance - allows adjacent channels but prevents near-duplicates
- **Too high (e.g., 80%)**: Shows too many similar channels, clutters the chart

---

## Visualization

### Channel Lines

Each channel renders three lines:

```javascript
// Upper bound (dashed, lighter)
<Line dataKey="bestChannel0Upper"
      stroke={color}
      strokeWidth={2}
      strokeDasharray="3 3"
      opacity={0.7} />

// Middle line (dashed, thicker) - This is the trend line
<Line dataKey="bestChannel0Mid"
      stroke={color}
      strokeWidth={2.5}
      strokeDasharray="3 3" />

// Lower bound (dashed, lighter)
<Line dataKey="bestChannel0Lower"
      stroke={color}
      strokeWidth={2}
      strokeDasharray="3 3"
      opacity={0.7} />
```

### Label Positioning

Labels are positioned at the midpoint of visible channel data, under the bottom line:

```javascript
// 1. Find all visible points with this channel's data
const pointsWithChannel = chartData
  .filter(point => point.bestChannel0Lower !== undefined)

// 2. Get midpoint among visible points
const midIndex = Math.floor(pointsWithChannel.length / 2)
const midPoint = pointsWithChannel[midIndex]

// 3. Position label under lower bound
const x = xAxis.scale(midPoint.date)  // Horizontal center
const y = yAxis.scale(midPoint.bestChannel0Lower)  // Bottom line

// 4. Render label below the line
<rect x={x - 30} y={y + 8} width={60} height={16} />
<text x={x} y={y + 18}>2.50σ 85%</text>
```

**Key Points**:
- Uses the **midpoint of visible data**, not the channel's theoretical midpoint
- Positioned **8 pixels below** the bottom line (plus 10 more for text)
- **Moves with zooming/panning** to stay centered on visible portion

### Toggle Visibility

Users can click channel entries in the legend to toggle visibility:

```javascript
// Clicking "Best2 (180pts, 6 touches)" toggles only Best2
bestChannelsVisibility[1] = !bestChannelsVisibility[1]

// All three lines (upper, mid, lower) and the label hide/show together
```

---

## Best Practices

### When to Use Best Channels

✅ **Good Use Cases**:
- Discovering channels you might have missed manually
- Analyzing multiple time frames simultaneously
- Finding historical support/resistance channels
- Identifying channel transitions over time
- Backtesting channel-based trading strategies

❌ **Not Ideal For**:
- Real-time trading decisions (use Slope Channel for most recent trend)
- Very short time frames (<20 points)
- Extremely volatile periods (channels may not contain price action)

### Interpreting Results

**High Touch Count (8+ touches)**:
- Strong historical support/resistance
- Price respected the channel boundaries
- More reliable for future predictions

**Low Touch Count (3-4 touches)**:
- Weaker channel, less validated
- May be transitioning or breaking out
- Use with caution for predictions

**High Containment (>90%)**:
- Price stayed within channel most of the time
- Indicates strong trending behavior
- Good for range-bound strategies

**Low Containment (<80%)**:
- Volatile price action
- Channel may be breaking down
- Consider other indicators

### Multiple Channels

When multiple channels are shown:

1. **Non-overlapping channels**: Different time periods, analyze each separately
2. **Similar slopes**: Indicates consistent trend direction
3. **Different slopes**: Indicates trend changes over time
4. **Nested channels**: Possible fractal patterns or consolidation zones

### Time Period Considerations

| Time Period | Typical Channels | Use Case |
|------------|------------------|----------|
| 1D - 5D | 1-2 | Short-term intraday patterns |
| 1M - 3M | 2-3 | Swing trading setups |
| 6M - 1Y | 2-4 | Intermediate trend analysis |
| 5Y | 3-5 | Long-term trend identification |

---

## Technical Specifications

### Performance

- **Simulation Speed**: ~0.5-2 seconds for typical 5Y range (1260 points)
- **Candidate Channels**: Typically finds 50-200 valid channels before filtering
- **Final Display**: Maximum 5 channels after overlap filtering
- **Recalculation**: Triggered on zoom, pan, or time period change

### Dependencies

```javascript
// File: frontend/src/components/PriceChart.jsx
import { findBestChannels, filterOverlappingChannels }
  from './PriceChart/utils/bestChannelFinder'

// State management
const [bestChannels, setBestChannels] = useState([])
const [bestChannelsVisibility, setBestChannelsVisibility] = useState({})

// Effect hook recalculates on changes
useEffect(() => {
  // ... calculation logic
}, [bestChannelEnabled, prices, indicators, days, zoomRange])
```

### Data Flow

```
User Action (enable/zoom/pan)
  ↓
useEffect triggered
  ↓
Calculate visible range
  ↓
findBestChannels(visibleData, params)
  ↓
filterOverlappingChannels(candidates, 0.3)
  ↓
setBestChannels(top5)
  ↓
Render channels + labels
  ↓
Display on chart
```

### Configuration Parameters

```javascript
// Hardcoded in PriceChart.jsx (line ~869)
const options = {
  minLength: Math.max(20, Math.floor(dataLen * 0.1)),     // 10% of visible
  maxLength: Math.floor(dataLen * 0.8),                   // 80% of visible
  startStep: Math.max(1, Math.floor(dataLen * 0.02)),     // 2% steps
  lengthStep: Math.max(1, Math.floor(dataLen * 0.02)),    // 2% steps
  stdevMultipliers: [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0],  // Fixed values
  touchTolerance: 0.05,                                    // 5% of range
  similarityThreshold: 0.9                                 // 90% of max touches
}
```

### Overlap Filtering

```javascript
// Hardcoded in PriceChart.jsx (line ~920)
const filteredChannels = filterOverlappingChannels(adjustedChannels, 0.3)
```

**Overlap threshold**: 0.3 (30%)
- Candidate channels with >30% overlap to ANY shown channel are filtered out
- Algorithm continues checking remaining candidates for non-overlapping ones
- Up to 5 distinct channels can be shown

### Label Rendering

```javascript
// Component: CustomBestChannelStdevLabels (line ~3307)
// Renders for each visible channel:
// - Background rectangle: 60x16 pixels
// - Text format: "{stdevMult}σ {percentInside}%"
// - Position: Midpoint of visible channel data, 18px below bottom line
// - Colors: Match channel colors (amber, orange, yellow, etc.)
```

### Memory Usage

Estimated memory per channel:
```
Channel object: ~200 bytes
Chart data points: ~50 bytes × channel_length
Labels: ~100 bytes
Total per channel: ~500 bytes + (50 × length)

For 5 channels averaging 200 points each:
~52.5 KB total
```

---

## Algorithm Source Code

### Main Functions

1. **findBestChannels()**
   - File: `frontend/src/components/PriceChart/utils/bestChannelFinder.js`
   - Lines: 122-247
   - Purpose: Simulate and rank channel candidates

2. **filterOverlappingChannels()**
   - File: `frontend/src/components/PriceChart/utils/bestChannelFinder.js`
   - Lines: 255-285
   - Purpose: Filter out overlapping channels

3. **findTurningPoints()**
   - File: `frontend/src/components/PriceChart/utils/bestChannelFinder.js`
   - Lines: 12-35
   - Purpose: Detect local maxima/minima

4. **CustomBestChannelStdevLabels**
   - File: `frontend/src/components/PriceChart.jsx`
   - Lines: 3307-3397
   - Purpose: Render stdev labels under bottom channels

### Key Calculations

**Linear Regression**:
```javascript
slope = (n × Σxy - Σx × Σy) / (n × Σx² - (Σx)²)
intercept = (Σy - slope × Σx) / n
```

**Standard Deviation**:
```javascript
distances = data.map(point => point.close - predictedY)
variance = Σ(distance - mean)² / n
stdDev = √variance
```

**Channel Width**:
```javascript
channelWidth = stdDev × stdevMultiplier
```

**Overlap Ratio**:
```javascript
overlapStart = max(candidate.start, existing.start)
overlapEnd = min(candidate.end, existing.end)
overlap = max(0, overlapEnd - overlapStart + 1)
overlapRatio = overlap / candidate.length
```

---

## Future Enhancements

Potential improvements:

1. **User-Configurable Parameters**
   - Adjustable overlap threshold (currently hardcoded at 30%)
   - Customizable stdev multiplier range
   - Touch tolerance adjustment

2. **Advanced Filtering**
   - Filter by minimum touch count
   - Filter by minimum containment percentage
   - Filter by minimum/maximum channel length

3. **Visual Enhancements**
   - Zone shading within channels (like Slope Channel)
   - Touch point markers at boundaries
   - Trend strength indicators

4. **Performance Optimizations**
   - Web Workers for background calculation
   - Caching of simulation results
   - Incremental updates instead of full recalculation

5. **Statistical Metrics**
   - R² (goodness of fit) in legend
   - Breakout probability indicators
   - Historical accuracy tracking

---

## Troubleshooting

### No Channels Displayed

**Possible Causes**:
1. Insufficient data (need ≥20 points)
2. Extremely volatile data (>10% points outside all tested channels)
3. No turning points detected (flat price action)

**Solutions**:
- Zoom out to include more data
- Try different time periods
- Check if other channels (Slope, Manual) work

### Only One Channel Shown

**Possible Causes**:
1. All other candidates overlap >30% with best channel
2. Insufficient data length for multiple distinct channels

**Solutions**:
- Zoom out to longer time range
- All other candidates failed containment test (>10% outside)

### Labels Not Visible

**Possible Causes**:
1. Channel outside visible range after zooming
2. Label positioned off-screen due to Y-axis scaling

**Solutions**:
- Pan/zoom to include channel range
- Toggle channel visibility off/on to refresh

### Performance Issues

**Possible Causes**:
1. Very long time ranges (>5000 points)
2. Frequent zoom/pan operations triggering recalculation

**Solutions**:
- Use shorter time periods for real-time analysis
- Wait for calculation to complete before next action
- Consider filtering data before enabling Best Channel

---

## Summary

The Best Channel feature provides **automated channel discovery** through comprehensive parameter simulation, helping traders identify multiple optimal support/resistance channels simultaneously. By automatically finding channels that maximize turning point touches while maintaining statistical validity, it serves as a powerful complement to manual analysis and single-trend channels.

**Key Advantages**:
- ✅ Discovers channels you might miss manually
- ✅ Shows multiple distinct channels simultaneously
- ✅ Adapts to different time ranges automatically
- ✅ Validates channels statistically (containment + touches)
- ✅ Clear visualization with labels and colors

**Key Limitations**:
- ⚠️ Historical analysis only (not predictive)
- ⚠️ Requires sufficient data (≥20 points)
- ⚠️ Computation intensive for very long ranges
- ⚠️ Fixed 30% overlap threshold (not user-configurable)

For real-time trend following, consider using **Slope Channel** instead. For maximum control over channel parameters, use **Manual Channel** mode.

---

**Documentation Version**: 1.0
**Last Updated**: 2025-11-21
**Component Version**: PriceChart.jsx (Best Channel feature)
