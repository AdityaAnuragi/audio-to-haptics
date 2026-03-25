import { useRef, useState } from 'react'
import { HapticEngine } from '../audio/HapticEngine'
import './SimpleUsage.css'

const engine = new HapticEngine()

export function SimpleUsage() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [url, setUrl] = useState('/Death Metal Drumming.mp3')
  const [status, setStatus] = useState<"idle" | "analyzing" | "ready" | "playing">('idle')

  async function handleAnalyze() {
    const audio = audioRef.current!
    audio.src = url
    setStatus('analyzing')
    await engine.load(url, audio)
    setStatus('ready')
  }

  function handlePlay() {
    void audioRef.current!.play()
    setStatus('playing')
  }

  function handleStop() {
    audioRef.current!.pause()
    setStatus('ready')
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>SimpleUsage</h2>
      <input
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="Audio URL"
        style={{ width: 400 }}
      />
      <button onClick={handleAnalyze} disabled={!url || status === 'analyzing'}>
        Analyze
      </button>

      {status === 'ready' && <button onClick={handlePlay}>Play + Vibrate</button>}
      {status === 'playing' && <button onClick={handleStop}>Stop</button>}

      <p>Status: {status}</p>
      <audio ref={audioRef} />
    </div>
  )
}
