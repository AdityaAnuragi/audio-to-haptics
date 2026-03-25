import { useRef, useState } from 'react'
import { HapticEngine } from '../audio/HapticEngine'
import './MediaUsage.css'

const engine = new HapticEngine()

const URLS = {
  deathMetal: '/Death Metal Drumming.mp3',
  bike: 'https://cdn.pixabay.com/audio/2024/01/24/audio_23938106b7.mp3',
} as const

export function MediaUsage() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [url, setUrl] = useState<typeof URLS[keyof typeof URLS]>(URLS.deathMetal)
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'ready'>('idle')

  function handleToggle() {
    setUrl(u => u === URLS.deathMetal ? URLS.bike : URLS.deathMetal)
    setStatus('idle')
  }

  async function handleAnalyze() {
    setStatus('analyzing')
    await engine.load(url, audioRef.current!)
    setStatus('ready')
  }

  return (
    <div className="media-usage">
      <h2>MediaUsage</h2>
      <audio ref={audioRef} controls src={url} />
      <button onClick={handleToggle}>
        Switch to {url === URLS.deathMetal ? 'Bike' : 'Death Metal'}
      </button>
      <button onClick={handleAnalyze} disabled={!url || status === 'analyzing'}>
        {status === 'analyzing' ? 'Analyzing...' : 'Enable Haptics'}
      </button>
    </div>
  )
}
