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

function computeTrends(data: Float32Array, sampleRate: number, bucketSize = 4410): Trend[] {
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

function App() {
  const [url, setUrl] = useState('https://cdn.pixabay.com/audio/2025/05/27/audio_3331fe5270.mp3\n')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

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

      <button
        onClick={() => {
          if (playing) {
            audioRef.current?.pause()
            audioRef.current = null
            setPlaying(false)
          } else {
            const audio = new Audio(url)
            audio.onended = () => setPlaying(false)
            audio.play()
            audioRef.current = audio
            setPlaying(true)
          }
        }}
        disabled={!url}
        style={{ marginBottom: '16px' }}
      >
        {playing ? 'Stop' : 'Play'}
      </button>

      {error && <p style={{ color: '#ff6b6b' }}>Error: {error}</p>}

      {result && <ResultView result={result} />}
    </div>
  )
}

function ResultView({ result }: { result: AnalysisResult }) {
  const trends = useMemo(() => computeTrends(result.channelData, result.sampleRate), [result.channelData, result.sampleRate])

  return (
    <div style={{ textAlign: 'left' }}>
      <h2>Result</h2>
      <p>Sample Rate: {result.sampleRate} Hz</p>
      <p>Duration: {result.duration.toFixed(2)}s</p>
      <p>Channels: {result.numberOfChannels}</p>
      <p>Total Samples: {result.channelData.length.toLocaleString()}</p>

      <h3>Trends (absolute values, per ~0.1s bucket)</h3>
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
