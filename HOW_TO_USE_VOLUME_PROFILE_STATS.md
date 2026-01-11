# How to Use Volume Profile Statistical Analysis

## Quick Start Guide - 3 Ways to Use It

### Option 1: Quick Test (Easiest - 2 minutes)
Run a simple test in your browser console to see it work immediately.

### Option 2: Add to Existing PriceChart (Recommended - 10 minutes)
Integrate into your current chart component with toggles.

### Option 3: Create New Tab (Complete - 20 minutes)
Add a new "Volume Stats" tab to your app.

---

## 🚀 Option 1: Quick Test in Browser Console

**Step 1:** Open your app in browser and go to console (F12)

**Step 2:** Paste this code:

```javascript
// Import the functions
import { calculateVolumeProfileStatistics, generateVolumeProfileSignals }
  from './components/PriceChart/utils/volumeProfileStatisticalAnalysis.js'

// Get some price data from your app (modify symbol as needed)
const response = await fetch('https://financialmodelingprep.com/api/v3/historical-price-full/AAPL?apikey=YOUR_API_KEY')
const data = await response.json()
const priceData = data.historical.slice(0, 100).map(d => ({
  date: d.date,
  close: d.close,
  volume: d.volume
}))

// Calculate volume profile statistics
const stats = calculateVolumeProfileStatistics(priceData, {
  numBins: 50,
  valueAreaPercent: 0.70,
  hvnThreshold: 1.5,
  lvnThreshold: 0.5
})

// Log results
console.log('=== VOLUME PROFILE STATISTICS ===')
console.log('POC Price:', stats.poc.price)
console.log('POC Volume %:', (stats.poc.volumePercent * 100).toFixed(1) + '%')
console.log('Value Area High:', stats.valueAreaHigh)
console.log('Value Area Low:', stats.valueAreaLow)
console.log('High Volume Nodes:', stats.highVolumeNodes.length)
console.log('Low Volume Nodes:', stats.lowVolumeNodes.length)

// Generate trading signals
const signals = generateVolumeProfileSignals(priceData, stats)
console.log('\n=== TRADING SIGNALS ===')
signals.forEach(signal => {
  console.log(`${signal.type}: ${signal.reason} (${(signal.confidence * 100).toFixed(0)}% confidence)`)
  console.log(`  ${signal.detail}`)
})
```

---

## 📊 Option 2: Add to Existing PriceChart (RECOMMENDED)

This adds POC, Value Area, HVN, and LVN overlays to your existing chart.

### Step 1: Modify PriceChart.jsx

**File:** `frontend/src/components/PriceChart.jsx`

**Add imports at the top (around line 28):**

```javascript
// Add these imports
import { calculateVolumeProfileStatistics } from './PriceChart/utils/volumeProfileStatisticalAnalysis'
import { CustomVolumeProfileStatisticalOverlay } from './PriceChart/components/VolumeProfileStatisticalOverlay'
```

**Add new props to component (around line 31):**

```javascript
function PriceChart({
  prices,
  indicators,
  signals,
  // ... existing props ...

  // ADD THESE NEW PROPS:
  volumeStatsEnabled = false,     // Toggle on/off
  volumeStatsShowPOC = true,      // Show Point of Control
  volumeStatsShowVA = true,       // Show Value Area
  volumeStatsShowHVN = true,      // Show High Volume Nodes
  volumeStatsShowLVN = false,     // Show Low Volume Nodes
  volumeStatsNumBins = 50,        // Number of price bins

  // ... rest of props
}) {
```

**Add calculation (around line 155, after other useMemo calculations):**

```javascript
// Calculate Volume Profile Statistics
const volumeProfileStats = useMemo(() => {
  if (!volumeStatsEnabled || !displayPrices || displayPrices.length === 0) {
    return null
  }

  return calculateVolumeProfileStatistics(displayPrices, {
    numBins: volumeStatsNumBins,
    valueAreaPercent: 0.70,
    hvnThreshold: 1.5,
    lvnThreshold: 0.5
  })
}, [volumeStatsEnabled, displayPrices, volumeStatsNumBins])
```

**Add overlay to chart (find your ComposedChart component and add this before the closing </ComposedChart> tag):**

```javascript
<ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
  {/* ... existing chart elements like Line, Area, XAxis, etc. ... */}

  {/* ADD THIS OVERLAY */}
  {volumeStatsEnabled && volumeProfileStats && (
    <Customized
      component={(props) => (
        <CustomVolumeProfileStatisticalOverlay
          {...props}
          volumeStats={volumeProfileStats}
          showPOC={volumeStatsShowPOC}
          showValueArea={volumeStatsShowVA}
          showHVN={volumeStatsShowHVN}
          showLVN={volumeStatsShowLVN}
        />
      )}
    />
  )}
</ComposedChart>
```

### Step 2: Add Toggle in StockAnalyzer.jsx

**File:** `frontend/src/components/StockAnalyzer.jsx`

**Add state (around your other useState calls):**

```javascript
const [volumeStatsEnabled, setVolumeStatsEnabled] = useState(false)
const [volumeStatsShowPOC, setVolumeStatsShowPOC] = useState(true)
const [volumeStatsShowVA, setVolumeStatsShowVA] = useState(true)
const [volumeStatsShowHVN, setVolumeStatsShowHVN] = useState(true)
const [volumeStatsShowLVN, setVolumeStatsShowLVN] = useState(false)
```

**Add controls to your UI (near your other chart controls):**

```javascript
{/* Volume Profile Statistics Controls */}
<div className="space-y-2 p-4 bg-gray-800 rounded-lg">
  <label className="flex items-center gap-2 text-white">
    <input
      type="checkbox"
      checked={volumeStatsEnabled}
      onChange={(e) => setVolumeStatsEnabled(e.target.checked)}
      className="w-4 h-4"
    />
    <span className="font-semibold">Volume Profile Statistics</span>
  </label>

  {volumeStatsEnabled && (
    <div className="ml-6 space-y-1 text-sm">
      <label className="flex items-center gap-2 text-gray-300">
        <input
          type="checkbox"
          checked={volumeStatsShowPOC}
          onChange={(e) => setVolumeStatsShowPOC(e.target.checked)}
        />
        Point of Control (POC)
      </label>
      <label className="flex items-center gap-2 text-gray-300">
        <input
          type="checkbox"
          checked={volumeStatsShowVA}
          onChange={(e) => setVolumeStatsShowVA(e.target.checked)}
        />
        Value Area (70%)
      </label>
      <label className="flex items-center gap-2 text-gray-300">
        <input
          type="checkbox"
          checked={volumeStatsShowHVN}
          onChange={(e) => setVolumeStatsShowHVN(e.target.checked)}
        />
        High Volume Nodes
      </label>
      <label className="flex items-center gap-2 text-gray-300">
        <input
          type="checkbox"
          checked={volumeStatsShowLVN}
          onChange={(e) => setVolumeStatsShowLVN(e.target.checked)}
        />
        Low Volume Nodes
      </label>
    </div>
  )}
</div>
```

**Pass props to PriceChart:**

```javascript
<PriceChart
  prices={priceData}
  indicators={indicators}
  signals={signals}
  // ... existing props ...

  // ADD THESE:
  volumeStatsEnabled={volumeStatsEnabled}
  volumeStatsShowPOC={volumeStatsShowPOC}
  volumeStatsShowVA={volumeStatsShowVA}
  volumeStatsShowHVN={volumeStatsShowHVN}
  volumeStatsShowLVN={volumeStatsShowLVN}
/>
```

### Step 3: Test It!

1. Start your app: `npm run dev`
2. Go to the "Analyze" tab
3. Enter a symbol (e.g., AAPL)
4. Check "Volume Profile Statistics"
5. You should see POC, Value Area, and HVN/LVN lines on the chart!

---

## 🎯 Option 3: Create New "Volume Stats" Tab

This creates a dedicated tab with full statistics, signals, and evolution analysis.

### Step 1: Create Component File

**File:** `frontend/src/components/VolumeProfileStatsTab.jsx`

```javascript
import React, { useState } from 'react'
import { Search, TrendingUp, Info } from 'lucide-react'
import VolumeProfileStatisticalAnalysisExample from './VolumeProfileStatisticalAnalysisExample'

const VolumeProfileStatsTab = () => {
  const [symbol, setSymbol] = useState('')
  const [loading, setLoading] = useState(false)
  const [priceData, setPriceData] = useState(null)
  const [error, setError] = useState(null)

  const fetchData = async () => {
    if (!symbol) return

    setLoading(true)
    setError(null)

    try {
      // Fetch stock data
      const response = await fetch(
        `http://localhost:8080/api/analyze?symbol=${symbol}&days=365`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch data')
      }

      const data = await response.json()

      // Transform to format needed by volume profile analysis
      const transformed = data.prices.map(p => ({
        date: p.date,
        close: p.close,
        high: p.high,
        low: p.low,
        volume: p.volume
      }))

      setPriceData(transformed)
    } catch (err) {
      setError(err.message)
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <TrendingUp size={32} />
          Volume Profile Statistical Analysis
        </h1>
        <p className="text-purple-100">
          Analyze POC, Value Area, High/Low Volume Nodes, and generate trading signals
        </p>
      </div>

      {/* Search Bar */}
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Enter stock symbol (e.g., AAPL)"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyPress={(e) => e.key === 'Enter' && fetchData()}
              className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
            />
          </div>
          <button
            onClick={fetchData}
            disabled={loading || !symbol}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            <Search size={20} />
            {loading ? 'Loading...' : 'Analyze'}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
            Error: {error}
          </div>
        )}
      </div>

      {/* Info Box */}
      {!priceData && (
        <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-6">
          <div className="flex gap-3">
            <Info size={24} className="text-blue-400 flex-shrink-0 mt-1" />
            <div className="text-blue-200">
              <h3 className="font-semibold mb-2">About Volume Profile Statistics</h3>
              <ul className="space-y-1 text-sm">
                <li><strong>POC (Point of Control):</strong> Price with highest volume - strong support/resistance</li>
                <li><strong>Value Area:</strong> Price range containing 70% of volume - fair value zone</li>
                <li><strong>HVN (High Volume Nodes):</strong> Strong support/resistance levels</li>
                <li><strong>LVN (Low Volume Nodes):</strong> Thin zones where price moves quickly</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {priceData && (
        <VolumeProfileStatisticalAnalysisExample
          priceData={priceData}
          benchmarkData={null}
        />
      )}
    </div>
  )
}

export default VolumeProfileStatsTab
```

### Step 2: Add Tab to App.jsx

**File:** `frontend/src/App.jsx`

**Import the component (around line 6):**

```javascript
import VolumeProfileStatsTab from './components/VolumeProfileStatsTab'
```

**Add tab button in your navigation (find where other tabs are defined):**

```javascript
<button
  onClick={() => setActiveTab('volumeStats')}
  className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-colors ${
    activeTab === 'volumeStats'
      ? 'bg-purple-600 text-white'
      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
  }`}
>
  <Activity size={20} />
  Volume Stats
</button>
```

**Add tab content (find where other tab contents are rendered):**

```javascript
{activeTab === 'volumeStats' && <VolumeProfileStatsTab />}
```

### Step 3: Test the New Tab!

1. Restart your app: `npm run dev`
2. You should see a new "Volume Stats" tab
3. Click it and enter a symbol like "AAPL"
4. Click "Analyze" to see complete volume profile analysis!

---

## 🔧 What You'll See

### Visual Elements on Chart:

1. **Red Line** - Point of Control (POC)
2. **Blue Shaded Area** - Value Area (70% of volume)
3. **Green Dashed Lines** - High Volume Nodes (support/resistance)
4. **Yellow Dashed Lines** - Low Volume Nodes (breakout zones)

### Statistics Panel Shows:

- POC price and volume percentage
- Value Area High/Low prices
- Number of HVN and LVN zones
- Total volume traded

### Trading Signals:

- BUY: Breakout above Value Area High
- SELL: Breakdown below Value Area Low
- HOLD: Price near High Volume Node
- WATCH: Price in Low Volume Node
- NEUTRAL: Price at Point of Control

---

## 💡 Common Use Cases

### Use Case 1: Find Support/Resistance
```javascript
const stats = calculateVolumeProfileStatistics(priceData)

console.log('Support levels (HVN):')
stats.highVolumeNodes.forEach(hvn => {
  console.log(`$${hvn.price.toFixed(2)} - ${(hvn.strength * 100).toFixed(0)}% strength`)
})
```

### Use Case 2: Check if Price is Overbought/Oversold
```javascript
const stats = calculateVolumeProfileStatistics(priceData)
const currentPrice = priceData[priceData.length - 1].close

if (currentPrice > stats.valueAreaHigh) {
  console.log('Price above value area - potentially overbought')
} else if (currentPrice < stats.valueAreaLow) {
  console.log('Price below value area - potentially oversold')
} else {
  console.log('Price in fair value zone')
}
```

### Use Case 3: Enhance Existing V3 Signals
```javascript
import { calculateVolumeProfileV3WithSells } from './volumeProfileV3Utils'
import { calculateVolumeProfileStatistics } from './volumeProfileStatisticalAnalysis'

// Your existing V3 calculation
const v3Result = calculateVolumeProfileV3WithSells(priceData, zoomRange)

// Add statistical analysis
const volumeStats = calculateVolumeProfileStatistics(priceData)

// Filter V3 breaks based on volume context
const enhancedBreaks = v3Result.breaks.filter(breakSignal => {
  // Only take breaks that aren't near strong HVN (high resistance)
  const nearStrongHVN = volumeStats.highVolumeNodes.some(hvn =>
    Math.abs(breakSignal.price - hvn.price) / breakSignal.price < 0.02 &&
    hvn.strength > 0.8
  )

  return !nearStrongHVN // Filter out breaks near strong resistance
})

console.log(`Filtered ${v3Result.breaks.length} breaks to ${enhancedBreaks.length} high-quality breaks`)
```

---

## 🎨 Customization Options

### Change Colors:

```javascript
<CustomVolumeProfileStatisticalOverlay
  volumeStats={volumeStats}
  pocColor="#ff0000"        // Red
  valueAreaColor="#0000ff"  // Blue
  hvnColor="#00ff00"        // Green
  lvnColor="#ffff00"        // Yellow
/>
```

### Adjust Sensitivity:

```javascript
const stats = calculateVolumeProfileStatistics(priceData, {
  numBins: 30,              // Less bins = broader zones
  valueAreaPercent: 0.80,   // 80% instead of 70%
  hvnThreshold: 2.0,        // Only very high volume = HVN (fewer HVNs)
  lvnThreshold: 0.3         // Very low volume = LVN (fewer LVNs)
})
```

### Show Only Top HVNs:

```javascript
const topHVNs = stats.highVolumeNodes.slice(0, 3) // Only top 3
```

---

## 🐛 Troubleshooting

### Issue: Nothing shows on chart
**Solution:** Check that `volumeStatsEnabled` is true and `volumeProfileStats` is not null

### Issue: Lines are off the chart
**Solution:** Your data range may be too wide. Adjust `numBins` parameter or filter price data

### Issue: Import errors
**Solution:** Make sure file paths are correct. Check:
```javascript
import { calculateVolumeProfileStatistics } from './PriceChart/utils/volumeProfileStatisticalAnalysis'
```

### Issue: Too many HVN/LVN lines cluttering chart
**Solution:** Increase thresholds:
```javascript
hvnThreshold: 2.0,  // More strict
lvnThreshold: 0.3   // More strict
```

Or limit how many to show:
```javascript
showHVN={volumeStatsShowHVN}
// In overlay component, modify to show only top 5:
highVolumeNodes.slice(0, 5).map(...)
```

---

## 📚 Next Steps

1. **Start with Option 2** (add to PriceChart) - easiest way to see it work
2. **Experiment with parameters** - adjust bins, thresholds to your preference
3. **Integrate with backtesting** - use signals to filter trade entries
4. **Compare with benchmark** - see how volume distribution differs from SPY

---

## 🆘 Need Help?

Check these files for reference:
- `VOLUME_PROFILE_STATISTICAL_ANALYSIS.md` - Full documentation
- `VolumeProfileStatisticalAnalysisExample.jsx` - Complete working example
- `volumeProfileStatisticalAnalysis.test.js` - Unit tests with examples

The implementation is ready to use! Choose an option above and start analyzing volume impact on price prediction.
