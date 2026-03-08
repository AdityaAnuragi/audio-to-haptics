import { useMemo, useRef, useState } from 'react'
import './App.css'
import { analyzeAudio, type AnalysisResult } from './audio/analyzeAudio'

interface Trend {
  startIndex: number
  endIndex: number
  startTime: number
  endTime: number
  min: number
  max: number
}

function computeTrends(data: Float32Array, sampleRate: number, bucketSize = 4410 * 0.4): Trend[] {
  const trends: Trend[] = []

  for (let i = 0; i < data.length; i += bucketSize) {
    const end = Math.min(i + bucketSize, data.length)
    let min = Infinity
    let max = -Infinity

    for (let j = i; j < end; j++) {
      const v = Math.abs(data[j])
      if (v < min) min = v
      if (v > max) max = v
    }

    // round for readability
    min = Math.round(min * 1000) / 1000
    max = Math.round(max * 1000) / 1000

    const startTime = i / sampleRate
    const endTime = (end - 1) / sampleRate

    const last = trends[trends.length - 1]
    // merge with previous trend if same range
    if (last && last.min === min && last.max === max) {
      last.endIndex = end - 1
      last.endTime = endTime
    } else {
      trends.push({ startIndex: i, endIndex: end - 1, startTime, endTime, min, max })
    }
  }

  return trends
}

function trendsToVibrationPattern(trends: Trend[]): number[] {
  // Build alternating [vibrate, pause, vibrate, pause, ...] array
  // "loud" and "very loud" = vibrate, everything else = pause
  const segments: { vibrate: boolean; ms: number }[] = []

  for (const t of trends) {
    const ms = Math.round((t.endTime - t.startTime) * 1000)
    const vibrate = t.max >= 0.3

    const last = segments[segments.length - 1]
    if (last && last.vibrate === vibrate) {
      last.ms += ms
    } else {
      segments.push({ vibrate, ms })
    }
  }

  // Vibration API pattern starts with vibrate — if first segment is a pause, prepend 0
  if (segments.length > 0 && !segments[0].vibrate) {
    segments.unshift({ vibrate: true, ms: 0 })
  }

  return segments.map((s) => s.ms)
}

// https://cdn.pixabay.com/audio/2025/05/27/audio_3331fe5270.mp3 (simple gun)
// https://cdn.pixabay.com/audio/2025/10/21/audio_92be5a14ad.mp3 (sniper)
// https://cdn.pixabay.com/audio/2022/03/21/audio_f0e01c4b7a.mp3 (ball bouncing)
// https://cdn.pixabay.com/audio/2022/03/19/audio_1712057a76.mp3 (hammering a nail, not the best example)
// https://cdn.pixabay.com/audio/2022/03/10/audio_fecee3808e.mp3 (hammering a nail, a little better)

function App() {
  const [url, setUrl] = useState('https://cdn.pixabay.com/audio/2025/05/27/audio_3331fe5270.mp3')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const trends = useMemo(() => result ? computeTrends(result.channelData, result.sampleRate) : [], [result])
  const pattern = useMemo(() => trendsToVibrationPattern(trends), [trends])

  const handleAnalyze = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await analyzeAudio(url)
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1>Audio to Haptics</h1>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Audio URL"
          style={{ flex: 1, padding: '8px', fontSize: '14px' }}
        />
        <button onClick={handleAnalyze} disabled={loading || !url}>
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => {
            if (playing) {
              audioRef.current?.pause()
              audioRef.current = null
              navigator.vibrate(0)
              setPlaying(false)
            } else {
              const audio = new Audio(url)
              audio.onended = () => { navigator.vibrate(0); setPlaying(false) }
              audio.play()
              audioRef.current = audio
              setPlaying(true)
            }
          }}
          disabled={!url}
        >
          {playing ? 'Stop' : 'Play'}
        </button>
        <button
          onClick={() => {
            if (playing) {
              audioRef.current?.pause()
              audioRef.current = null
              navigator.vibrate(0)
              setPlaying(false)
            } else {
              const audio = new Audio(url)
              audio.onended = () => { navigator.vibrate(0); setPlaying(false) }
              audio.play()
              navigator.vibrate(pattern)
              audioRef.current = audio
              setPlaying(true)
            }
          }}
          disabled={!url || pattern.length === 0}
        >
          {playing ? 'Stop' : 'Play + Vibrate'}
        </button>
      </div>

      {error && <p style={{ color: '#ff6b6b' }}>Error: {error}</p>}

      {result && <ResultView result={result} trends={trends} pattern={pattern} />}
    </div>
  )
}

function ResultView({ result, trends, pattern }: { result: AnalysisResult; trends: Trend[]; pattern: number[] }) {
  return (
    <div style={{ textAlign: 'left' }}>
      <h2>Result</h2>
      <button onClick={() => navigator.vibrate(pattern)}>
        Vibrate
      </button>
      <button onClick={() => navigator.vibrate(0)} style={{ marginLeft: '8px' }}>
        Stop Vibration
      </button>
      <p style={{ fontSize: '12px', color: '#888' }}>
        Pattern: [{pattern.join(', ')}] ({pattern.length} entries)
      </p>
      <p>Sample Rate: {result.sampleRate} Hz</p>
      <p>Duration: {result.duration.toFixed(2)}s</p>
      <p>Channels: {result.numberOfChannels}</p>
      <p>Total Samples: {result.channelData.length.toLocaleString()}</p>

      <h3>Trends (absolute values)</h3>
      <div style={{ maxHeight: '400px', overflow: 'auto', fontSize: '13px', fontFamily: 'monospace' }}>
        {trends.map((t, i) => (
          <div key={i} style={{ padding: '2px 0' }}>
            {t.startTime.toFixed(2)}s – {t.endTime.toFixed(2)}s{' '}
            <span style={{ color: '#888' }}>
              [{t.startIndex.toLocaleString()} – {t.endIndex.toLocaleString()}]
            </span>{' '}
            {(() => {
              const label = t.max === 0 ? 'silence' : t.max < 0.3 ? 'quiet' : t.max < 0.7 ? 'loud' : 'very loud'
              const color = t.max === 0 ? '#666' : t.max < 0.3 ? '#6b9' : t.max < 0.7 ? '#db6' : '#f66'
              return <>
                <span style={{ color }}>{label}</span>
                {t.max > 0 && ` (${t.min} – ${t.max})`}
              </>
            })()}
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
