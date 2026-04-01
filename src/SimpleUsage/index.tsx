import { useEffect, useRef, useState } from 'react'
import { HapticEngine } from '../audio/HapticEngine'
import './SimpleUsage.css'

const engine = new HapticEngine()

export function SimpleUsage() {
  const [url, setUrl] = useState('/TRIMMED Chippin In.mp3')
  const [ready, setReady] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  async function analyze() {
    await engine.analyze(url)
    setReady(true)
  }

  useEffect(() => {
    if (ready && audioRef.current) {
      engine.attach(audioRef.current)
    }
    return () => engine.detach()
  }, [ready])

  return (
    <div>
      <input
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="Audio URL"
        style={{ width: '400px' }}
      />
      <br /><br />
      <button onClick={analyze}>{ready ? 'Re-analyze' : 'Analyze'}</button>
      <br /><br />
      <audio ref={audioRef} src={url} controls />
    </div>
  )
}
