import { useState } from 'react'

/**
 * Custom hook to manage chart interaction state (selection, panning, etc.)
 * @returns {Object} Interaction state and setters
 */
export const useChartInteractions = () => {
  // Manual channel selection state
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState(null)
  const [selectionEnd, setSelectionEnd] = useState(null)

  // Volume profile manual selection state
  const [isSelectingVolumeProfile, setIsSelectingVolumeProfile] = useState(false)
  const [volumeProfileSelectionStart, setVolumeProfileSelectionStart] = useState(null)
  const [volumeProfileSelectionEnd, setVolumeProfileSelectionEnd] = useState(null)

  // Chart panning state
  const [isPanning, setIsPanning] = useState(false)
  const [panStartX, setPanStartX] = useState(null)
  const [panStartZoom, setPanStartZoom] = useState(null)

  // Controls visibility
  const [controlsVisible, setControlsVisible] = useState(false)

  const resetSelection = () => {
    setIsSelecting(false)
    setSelectionStart(null)
    setSelectionEnd(null)
  }

  const resetVolumeProfileSelection = () => {
    setIsSelectingVolumeProfile(false)
    setVolumeProfileSelectionStart(null)
    setVolumeProfileSelectionEnd(null)
  }

  const resetPanning = () => {
    setIsPanning(false)
    setPanStartX(null)
    setPanStartZoom(null)
  }

  return {
    // Selection state
    isSelecting,
    setIsSelecting,
    selectionStart,
    setSelectionStart,
    selectionEnd,
    setSelectionEnd,
    resetSelection,

    // Volume profile selection state
    isSelectingVolumeProfile,
    setIsSelectingVolumeProfile,
    volumeProfileSelectionStart,
    setVolumeProfileSelectionStart,
    volumeProfileSelectionEnd,
    setVolumeProfileSelectionEnd,
    resetVolumeProfileSelection,

    // Panning state
    isPanning,
    setIsPanning,
    panStartX,
    setPanStartX,
    panStartZoom,
    setPanStartZoom,
    resetPanning,

    // Controls
    controlsVisible,
    setControlsVisible
  }
}
