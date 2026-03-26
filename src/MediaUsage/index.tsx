import { useRef, useState } from 'react'
import { HapticEngine } from '../audio/HapticEngine'
import './MediaUsage.css'

const engine = new HapticEngine()

const URLS = {
  video: '/video/chippinIn.mp4',
  audio: 'https://cdn.pixabay.com/audio/2022/11/05/audio_997c8fe344.mp3',
} as const

export function MediaUsage() {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const [url, setUrl] = useState<typeof URLS[keyof typeof URLS]>(URLS.audio)
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'ready'>('idle')

  function handleToggle() {
    setUrl(u => u === URLS.video ? URLS.audio : URLS.video)
    setStatus('idle')
  }

  async function handleAnalyze() {
    setStatus('analyzing')
    await engine.load(url, mediaRef.current!)
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
      <button onClick={handleAnalyze} disabled={status === 'analyzing'}>
        {status === 'analyzing' ? 'Analyzing...' : 'Enable Haptics'}
      </button>
    </div>
  )
}
