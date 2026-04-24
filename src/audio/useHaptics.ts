import { useEffect, useRef, useState, type RefObject } from 'react'
import { HapticEngine } from './HapticEngine'
import type { HapticOptions } from './analyzeAudio'

/**
 * React hook for audio-to-haptics. Wraps `HapticEngine` and manages its lifecycle automatically —
 * including calling `detach()` when the component unmounts. For manual lifecycle control, use `HapticEngine` directly instead.
 *
 * @param mediaRef - A ref attached to your `<audio>` or `<video>` element
 * @param opts - Optional algorithm knobs to configure. Any fields you omit fall back to `DEFAULT_OPTIONS`.
 *
 * @returns
 * - `analyze(url)` — fetch + analyze an audio URL. Sets `loading` while in flight, `ready` when done.
 * - `analyzeBuffer(arrayBuffer)` — same as `analyze` but for raw bytes (file input, drag-and-drop). Use `analyze` for a URL instead.
 * - `ready` — `true` once analysis completes. Safe to read `engine` data after this point.
 * - `loading` — `true` while analysis is in flight.
 * - `error` — error message string if analysis threw, `null` otherwise.
 * - `playbackTime` — current playback position in seconds, updated every animation frame while playing.
 * - `playbackChainIntensity` — chain-average intensity (0–1) for the active vibration chain, updated every animation frame. Constant across the whole chain — does not vary as the chain decays. 0 outside vibrating chains.
 * - `playbackChainIsShortBurst` — `true` when the current chain is a short transient burst (its bucket count is less than `opts.shortChainBuckets`). Constant for every bucket in the chain. `false` during sustained chains or silence.
 * - `muted` — whether haptics are suppressed. Triggers a re-render when toggled.
 * - `toggleMuted()` — flips the muted state and updates React state.
 * - `engine` — direct access to the underlying `HapticEngine` instance. Read analysis data (trends, vibrationMap, etc.) here after `ready` is `true`.
 */
export function useHaptics(mediaRef: RefObject<HTMLMediaElement | null>, opts?: Partial<HapticOptions>) {
  const engineRef = useRef(new HapticEngine(opts ?? {}))
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [playbackChainIntensity, setPlaybackChainIntensity] = useState(0)
  const [playbackChainIsShortBurst, setPlaybackChainIsShortBurst] = useState(false)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    const engine = engineRef.current
    if (ready && mediaRef.current) {
      engine.attach(mediaRef.current, (t, chainIntensity, chainIsShortBurst) => {
        setPlaybackTime(t)
        setPlaybackChainIntensity(chainIntensity)
        setPlaybackChainIsShortBurst(chainIsShortBurst)
      })
    }
    return () => engine.detach()
  }, [ready, mediaRef])

  async function analyze(url: string) {
    setLoading(true)
    setError(null)
    try {
      await engineRef.current.analyze(url)
      setReady(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function analyzeBuffer(arrayBuffer: ArrayBuffer) {
    setLoading(true)
    setError(null)
    try {
      await engineRef.current.analyzeBuffer(arrayBuffer)
      setReady(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  function toggleMuted() {
    engineRef.current.toggleMuted()
    setMuted(engineRef.current.muted)
  }

  return {
    analyze,
    analyzeBuffer,
    ready,
    loading,
    error,
    playbackTime,
    playbackChainIntensity,
    playbackChainIsShortBurst,
    muted,
    toggleMuted,
    engine: engineRef.current,
  }
}
