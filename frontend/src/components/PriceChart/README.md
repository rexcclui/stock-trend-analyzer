# PriceChart Component Refactoring

This directory contains the refactored PriceChart component, broken down into smaller, maintainable modules.

## Structure

```
PriceChart/
├── components/          # Reusable sub-components
│   ├── CustomTooltip.jsx
│   ├── CustomXAxisTick.jsx
│   ├── CustomZoneLines.jsx
│   ├── CustomSlopeChannelLabel.jsx
│   ├── CustomVolumeProfile.jsx
│   └── index.js
├── hooks/              # Custom React hooks
│   ├── useChannelState.js
│   ├── useChartInteractions.js
│   ├── useSMACache.js
│   ├── useSlopeChannel.js
│   ├── useVolumeProfile.js
│   ├── usePerformanceComparison.js
│   └── index.js
├── utils/              # Pure calculation functions
│   ├── calculations.js
│   ├── channelUtils.js
│   ├── volumeUtils.js
│   ├── slopeChannelOptimizer.js
│   └── index.js
└── README.md
```

## Components

### `CustomTooltip`
Chart tooltip displaying price, SMA values, and comparison stock data.

### `CustomXAxisTick`
X-axis tick with special highlighting for month/year transitions.

### `CustomZoneLines`
Slope channel zone visualization with volume-weighted coloring.

### `CustomSlopeChannelLabel`
Standard deviation multiplier label at channel midpoint.

### `CustomVolumeProfile`
Volume profile visualization showing volume distribution across price levels.

**Note**: Additional components can be extracted:
- CustomLegend
- CustomAllChannelZoneLines
- CustomRevAllChannelZoneLines
- CustomAllChannelStdevLabels
- CustomRevAllChannelStdevLabels
- CustomManualChannelZoneLines
- CustomManualChannelLabels

## Hooks

### `useChannelState`
Manages state for slope channels, including:
- Optimized lookback count and stdev multiplier
- All channels (forward and reversed)
- Channel visibility
- Manual channels

### `useChartInteractions`
Manages user interaction state:
- Manual channel selection
- Volume profile selection
- Chart panning
- Controls visibility

### `useSMACache`
Memoized SMA calculations for multiple periods.

### `useSlopeChannel`
Calculates slope channel using linear regression with optimization:
- Volume-weighted option
- Automatic parameter optimization
- Zone color calculations

### `useVolumeProfile`
Calculates volume profiles for price ranges:
- Auto mode (entire visible range)
- Manual mode (user-selected ranges)

### `usePerformanceComparison`
Calculates performance comparison metrics:
- Rolling performance vs benchmark
- Performance variance thresholds

## Utils

### `calculations.js`
Pure calculation functions:
- `calculateSMA` - Simple Moving Average
- `calculateLinearRegression` - Linear regression with standard deviation
- `calculateRSquared` - R² goodness of fit
- `calculateVolumeThreshold` - Volume percentile thresholds
- `calculateRollingThresholds` - Rolling volume thresholds
- `calculateTouchCount` - Channel boundary touches
- `getVolumeLookbackWindow` - Dynamic lookback window sizing
- `getSmaColor` - SMA line colors

### `channelUtils.js`
Channel-specific utilities:
- `findOptimalStdev` - Find optimal channel width
- `calculateChannelDistribution` - Price distribution within channel
- `generateChannelData` - Generate channel visualization data
- `checkTrendBreak` - Detect trend breaks
- `calculateChannelZones` - Calculate zones within channel

### `volumeUtils.js`
Volume-related utilities:
- `calculateVolumeProfile` - Volume profile bins
- `calculateZoneColors` - Zone colors based on volume weights
- `buildSpyVolumeMap` - SPY volume lookup map
- `calculateVolumeRatios` - Stock/SPY volume ratios
- `getVolumeColor` - Volume-based coloring
- `calculateNumZones` - Dynamic zone count

### `slopeChannelOptimizer.js`
Advanced slope channel algorithms:
- `findBestChannel` - Find optimal lookback and stdev parameters
- `calculateSlopeChannel` - Complete slope channel calculation

## Benefits of Refactoring

1. **Maintainability**: Smaller, focused modules are easier to understand and modify
2. **Testability**: Pure functions and isolated hooks can be unit tested
3. **Reusability**: Utilities and hooks can be reused across components
4. **Performance**: Proper memoization with useMemo prevents unnecessary recalculations
5. **Separation of Concerns**: Clear separation between state, calculations, and UI

## Migration Guide

The original PriceChart.jsx remains functional. To migrate to the refactored version:

1. Import hooks:
   ```javascript
   import { useSlopeChannel, useChannelState, useVolumeProfile } from './PriceChart/hooks'
   ```

2. Import utilities:
   ```javascript
   import { calculateSMA, getSmaColor } from './PriceChart/utils'
   ```

3. Import components:
   ```javascript
   import { CustomTooltip, CustomZoneLines, CustomVolumeProfile } from './PriceChart/components'
   ```

4. Replace inline calculations with hook calls
5. Replace inline functions with imported utilities
6. Replace inline component definitions with imported components

## Progress

### ✅ Completed
- [x] Extract calculation utilities (SMA, linear regression, volume calculations)
- [x] Create custom hooks for state management and calculations
- [x] Extract main chart overlay components
- [x] Add comprehensive documentation

### 🚧 In Progress / Future Work
- [ ] Extract remaining overlay components (CustomLegend, channel-specific components)
- [ ] Update main PriceChart.jsx to use refactored hooks and utilities
- [ ] Add unit tests for utilities and hooks
- [ ] Add TypeScript types for better type safety
- [ ] Performance profiling and optimization
