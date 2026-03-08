import { useRef, useState } from 'react'
import { analyzeAudio, type AnalysisResult } from './audio/analyzeAudio'
import './App.css'

// https://cdn.pixabay.com/audio/2025/11/06/audio_6328b5c947.mp3, 400

function App() {
  const [url, setUrl] = useState('https://cdn.pixabay.com/audio/2025/11/06/audio_6328b5c947.mp3')
  const [totalRuns, setTotalRuns] = useState<number>(0)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'playing' | 'error'>('idle')
  const [error, setError] = useState('')
  const [delay, setDelay] = useState(400)
  const audioRef = useRef<HTMLAudioElement>(null)
  const vibrateTimeoutRef = useRef<number | null>(null)

  const handleAnalyze = async () => {
    if (!url.trim()) return
    setStatus('analyzing')
    setError('')
    try {
      const analysis = await analyzeAudio(url.trim())
      setResult(analysis)
      setStatus('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
      setStatus('error')
    }
  }

  const handlePlayVibrate = async () => {
    setTotalRuns(curr => curr + 1)
    if (!result || !audioRef.current) return
    const audio = audioRef.current
    audio.currentTime = 0

    // Wait for audio to actually start producing sound
    const playingPromise = new Promise<void>(resolve => {
      audio.addEventListener('playing', () => resolve(), { once: true })
    })
    audio.play()
    await playingPromise

    // Delay vibration to compensate for audio output latency
    setStatus('playing')
    vibrateTimeoutRef.current = window.setTimeout(() => {
      if ('vibrate' in navigator) {
        navigator.vibrate(result.pattern)
      }
    }, delay)
    audio.onended = () => setStatus('idle')
  }

  const handleStop = () => {
    if (vibrateTimeoutRef.current !== null) {
      clearTimeout(vibrateTimeoutRef.current)
      vibrateTimeoutRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if ('vibrate' in navigator) {
      navigator.vibrate(0)
    }
    setStatus('idle')
  }

  const vibrationSupported = 'vibrate' in navigator



  return (
    <div>
      <h1>Audio to Haptics</h1>
      <h2>Total runs: {totalRuns}</h2>
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Paste audio URL..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ width: '100%', maxWidth: '500px', padding: '0.5em', fontSize: '1em' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem' }}>
        <button onClick={handleAnalyze} disabled={!url.trim() || status === 'analyzing'}>
          {status === 'analyzing' ? 'Analyzing...' : 'Analyze'}
        </button>
        <button onClick={handlePlayVibrate} disabled={!result || status === 'analyzing'}>
          Play + Vibrate
        </button>
        <button onClick={handleStop} disabled={status !== 'playing'}>
          Stop
        </button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label>
          Vibration delay offset: {delay}ms
          <br />
          <input
            type="range"
            min={0}
            max={2000}
            step={10}
            value={delay}
            onChange={(e) => setDelay(Number(e.target.value))}
            style={{ width: '300px' }}
          />
        </label>
      </div>

      {!vibrationSupported && (
        <p style={{ color: '#f59e0b' }}>
          Vibration API not supported on this device — pattern will still be generated.
        </p>
      )}

      {error && <p style={{ color: '#ef4444' }}>{error}</p>}

      {url.trim() && <audio ref={audioRef} src={url.trim()} preload="auto" />}

      {result && (
        <div style={{ textAlign: 'left', marginTop: '1rem' }}>
          <p>Duration: {(result.durationMs / 1000).toFixed(2)}s | Frames: {result.frameCount} | Pattern segments: {result.pattern.length}</p>
          <pre style={{
            background: '#2d2d2d',
            color: '#e2e8f0',
            border: '1px solid #444',
            padding: '1rem',
            borderRadius: '8px',
            maxHeight: '300px',
            overflow: 'auto',
            fontSize: '0.85em',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}>
            {JSON.stringify(result.pattern)}
          </pre>
          <button onClick={() => navigator.clipboard.writeText(JSON.stringify(result.pattern))}>
            Copy Pattern
          </button>
        </div>
      )}
    </div>
  )
}

export default App
