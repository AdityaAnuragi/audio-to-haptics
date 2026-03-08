import { useRef, useState } from 'react'
import './App.css'
import { analyzeAudio, type AnalysisResult } from './audio/analyzeAudio'

function App() {
  const [url, setUrl] = useState('https://cdn.pixabay.com/audio/2025/11/06/audio_6328b5c947.mp3')
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

      {result && (
        <div style={{ textAlign: 'left' }}>
          <h2>Result</h2>
          <p>Sample Rate: {result.sampleRate} Hz</p>
          <p>Duration: {result.duration.toFixed(2)}s</p>
          <p>Channels: {result.numberOfChannels}</p>
          <p>Total Samples: {result.channelData.length.toLocaleString()}</p>
          <p>First 10 values: [{result.channelData.slice(0, 10).join(', ')}]</p>
        </div>
      )}
    </div>
  )
}

export default App
