# PriceChart.jsx Refactoring Plan

## Current State
- **Total lines:** 6,767
- **Status:** Monolithic component with inline calculations, custom components, and complex state management

## Refactoring Goals
Break down the massive component into:
1. Smaller, focused utility functions
2. Separate rendering components
3. Custom hooks for state management
4. Control panel components

---

## Priority 1: Extract Large Custom Rendering Components (2,123 lines)

### CustomVolumeProfileV2 (~1,276 lines) - Line 5388
**Dependencies:**
- volumeProfileV2Enabled, volumeProfileV2Data, displayPrices, zoomRange
- volV2HoveredBar, setVolV2HoveredBar, volumeProfileV2Breakouts, breakoutPL

**Action:** Extract to `/components/CustomVolumeProfileV2.jsx`

### CustomLegend (~347 lines) - Line 3783
**Dependencies:**
- Many state variables and setters for visibility control
- SMA, channel, and profile visibility states

**Action:** Extract to `/components/CustomLegend.jsx`

### Other Custom Components (~500 lines combined)
- CustomResistanceLine (~100 lines) - Line 4134
- CustomSecondVolZoneLine (~90 lines) - Line 4232
- CustomThirdVolZoneLine (~90 lines) - Line 4323
- CustomRevAllChannelZoneLines (~120 lines) - Line 4599
- CustomRevAllChannelStdevLabels (~80 lines) - Line 4719
- CustomManualChannelZoneLines (~122 lines) - Line 4801
- CustomManualChannelLabels (~92 lines) - Line 4923
- CustomBestChannelZoneLines (~136 lines) - Line 5015
- CustomBestStdevLabels (~79 lines) - Line 5151
- CustomBestStdevZoneLines (~100 lines) - Line 6657

**Action:** Extract to individual files in `/components/`

---

## Priority 2: Extract Large Calculation Functions (1,444 lines)

### findAllChannelsWithConstantStdev (~538 lines) - Line 1199
**Status:** ✅ Helper functions created in `utils/channelCalculations.js`
**Next:** Refactor to use helper functions, extract to utils

### calculateSlopeChannel (~399 lines) - Line 437
**Dependencies:** Many state variables, optimization logic
**Action:** Extract to `/utils/slopeChannelCalculator.js`

### findAllChannelsReversed (~338 lines) - Line 851
**Dependencies:** getInitialLookbackForPeriod, days
**Action:** Extract to `/utils/channelFinders.js`

### calculateVolumeProfileV2 (~169 lines) - Line 2103
**Action:** Extract to `/utils/volumeProfileCalculations.js`

---

## Priority 3: Extract Medium Calculation Functions (900+ lines)

### calculateZoneColors (~70 lines) - Line 1737
### calculateAllChannelZones (~58 lines) - Line 1807
### calculateManualChannelZones (~47 lines) - Line 1865
### calculateBreakoutPL (~300+ lines) - Line 2272
### calculateSingleVolumeProfile (~60 lines) - Line 1998
### calculateVolumeProfiles (~45 lines) - Line 2058
### calculateRollingThresholds (~40 lines) - Line 1957
### findTurningPoints (~30 lines) - Line 3475
### getTransitionDates (~20 lines) - Line 3741
### adjustChannelRangeWithoutRecalc (~17 lines) - Line 1172
### getChannelLocalIndex (~10 lines) - Line 1189
### getSmaColor (~6 lines) - Line 3164
### getCursorStyle (~15 lines) - Line 5632

**Action:** Group related functions and extract to appropriate util files

---

## Priority 4: Extract Event Handlers to Custom Hooks

### Mouse/Interaction Handlers
- handleWheel (~70 lines) - Line 2960
- handleMouseMove (~90 lines) - Line 3170
- handleMouseLeave (~10 lines) - Line 3257
- handleMouseDown (~26 lines) - Line 3267
- handleMouseUp (~27 lines) - Line 3293

**Action:** Extract to `/hooks/useChartInteractions.js` (partially done, needs completion)

### Channel Management Handlers
- fitManualChannel (~155 lines) - Line 3320
- extendManualChannel (~235 lines) - Line 3506

**Action:** Extract to `/hooks/useManualChannels.js`

---

## Priority 5: Extract useEffect Hooks

### Large useEffect blocks
- Resistance Line calculation - Line 79
- Market Gap calculation - Line 218
- Reversed All Channels - Line 1478
- Best Channels - Line 1551
- Best Stdev Channels - Line 1665
- Volume Profile V2 calculation - Line 2291
- Optimized parameters reset - Line 64

**Action:** Extract to appropriate custom hooks

---

## Priority 6: Extract Control Panels (~400 lines)

### Channel Controls Panel (Line 5634-5800+)
Large inline control panel JSX with sliders and inputs

**Action:** Extract to `/components/ChannelControlsPanel.jsx`

### Volume Profile V2 Controls
Inline date range controls and sliders

**Action:** Extract to `/components/VolumeProfileV2Controls.jsx`

---

## Implementation Strategy

### Phase 1: Foundation (Current)
✅ Create helper utilities in `utils/channelCalculations.js`
- [ ] Document refactoring plan (this file)
- [ ] Set up proper exports in utils/index.js

### Phase 2: Extract Largest Components
- [ ] CustomVolumeProfileV2 (1,276 lines → separate file)
- [ ] CustomLegend (347 lines → separate file)
- [ ] Other Custom rendering components

### Phase 3: Extract Calculations
- [ ] Refactor findAllChannelsWithConstantStdev using helpers
- [ ] Extract calculateSlopeChannel
- [ ] Extract findAllChannelsReversed
- [ ] Extract other calculation functions

### Phase 4: Extract Hooks
- [ ] Complete useChartInteractions
- [ ] Create useManualChannels
- [ ] Create useChannelCalculations
- [ ] Create useVolumeProfileCalculations

### Phase 5: Extract Control Panels
- [ ] ChannelControlsPanel
- [ ] VolumeProfileV2Controls

### Phase 6: Final Cleanup
- [ ] Remove all extracted inline code from PriceChart.jsx
- [ ] Add proper imports
- [ ] Update exports in index files
- [ ] Test all functionality
- [ ] Update documentation

---

## Expected Outcome

### Before
- PriceChart.jsx: 6,767 lines

### After (Target)
- PriceChart.jsx: ~1,500-2,000 lines (main orchestration)
- /components/: ~15 new component files (~2,500 lines)
- /utils/: ~8 new utility files (~2,000 lines)
- /hooks/: ~6 new hook files (~1,200 lines)

### Benefits
- **Readability:** Each file focuses on a single responsibility
- **Maintainability:** Easier to find and fix bugs
- **Testability:** Individual functions can be unit tested
- **Reusability:** Components and utilities can be reused
- **Performance:** Better code splitting opportunities
