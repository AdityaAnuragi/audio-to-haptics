import { useEffect, useRef, useState } from 'react'
import { HapticEngine } from './HapticEngine'
import type { HapticOptions } from './analyzeAudio'

export function useHaptics<T extends HTMLMediaElement = HTMLMediaElement>(opts?: Partial<HapticOptions>) {
  const engineRef = useRef(new HapticEngine(opts ?? {}))
  const mediaRef = useRef<T>(null)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    const engine = engineRef.current
    if (ready && mediaRef.current) {
      engine.attach(mediaRef.current, (t) => setPlaybackTime(t))
    }
    return () => engine.detach()
  }, [ready])

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
    mediaRef,
    analyze,
    analyzeBuffer,
    ready,
    loading,
    error,
    playbackTime,
    muted,
    toggleMuted,
    engine: engineRef.current,
  }
}
