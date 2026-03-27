import { useRef, useState } from 'react'
import { HapticEngine } from '../audio/HapticEngine'
import { DEFAULT_OPTIONS } from '../audio/analyzeAudio'
import './MediaUsage.css'

const URLS = {
  video: '/video/chippinIn.mp4',
  audio: 'https://cdn.pixabay.com/audio/2022/11/05/audio_997c8fe344.mp3',
} as const

export function MediaUsage() {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const engineRef = useRef(new HapticEngine())
  const [url, setUrl] = useState<typeof URLS[keyof typeof URLS]>(URLS.audio)
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'ready'>('idle')
  const [spikeRatio, setSpikeRatio] = useState(DEFAULT_OPTIONS.spikeRatio)
  const [neighborRadius, setNeighborRadius] = useState(DEFAULT_OPTIONS.neighborRadius)
  const [sustainLowerBound, setSustainLowerBound] = useState(DEFAULT_OPTIONS.sustainLowerBound)
  const [sustainUpperBound, setSustainUpperBound] = useState(DEFAULT_OPTIONS.sustainUpperBound)
  const [vibrateThresholdRatio, setVibrateThresholdRatio] = useState(DEFAULT_OPTIONS.vibrateThresholdRatio)
  const [muted, setMuted] = useState(false)

  function handleToggle() {
    setUrl(u => u === URLS.video ? URLS.audio : URLS.video)
    setStatus('idle')
  }

  async function handleAnalyze() {
    setStatus('analyzing')
    engineRef.current = new HapticEngine({ spikeRatio, neighborRadius, sustainLowerBound, sustainUpperBound, vibrateThresholdRatio })
    await engineRef.current.load(url, mediaRef.current!)
    setStatus('ready')
  }

  return (
    <div className="media-usage">
      <h2>MediaUsage</h2>

      {url === URLS.video
        ? <video ref={el => { mediaRef.current = el }} controls src={url} />
        : <audio ref={el => { mediaRef.current = el }} controls src={url} />
      }

      <button onClick={handleToggle}>
        Switch to {url === URLS.video ? 'Audio' : 'Video'}
      </button>
      <label>spikeRatio: {spikeRatio}
        <input type="range" min={1.0} max={3.0} step={0.1} value={spikeRatio} onChange={e => setSpikeRatio(Number(e.target.value))} />
      </label>
      <label>neighborRadius: {neighborRadius}
        <input type="range" min={1} max={10} step={1} value={neighborRadius} onChange={e => setNeighborRadius(Number(e.target.value))} />
      </label>
      <label>sustainLowerBound: {sustainLowerBound}
        <input type="range" min={0} max={1.0} step={0.05} value={sustainLowerBound} onChange={e => setSustainLowerBound(Number(e.target.value))} />
      </label>
      <label>sustainUpperBound: {sustainUpperBound}
        <input type="range" min={1.0} max={1.5} step={0.05} value={sustainUpperBound} onChange={e => setSustainUpperBound(Number(e.target.value))} />
      </label>
      <label>vibrateThresholdRatio: {vibrateThresholdRatio}
        <input type="range" min={0.1} max={0.9} step={0.05} value={vibrateThresholdRatio} onChange={e => setVibrateThresholdRatio(Number(e.target.value))} />
      </label>

      <button onClick={() => { engineRef.current.toggleMuted(); setMuted(m => !m) }} disabled={status !== 'ready'}>
        {muted ? 'Unmute Haptics' : 'Mute Haptics'}
      </button>

      <button onClick={handleAnalyze} disabled={status === 'analyzing'}>
        {status === 'analyzing' ? 'Analyzing...' : 'Enable Haptics'}
      </button>
    </div>
  )
}
