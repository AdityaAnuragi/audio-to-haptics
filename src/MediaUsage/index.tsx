import { useEffect, useRef, useState } from 'react'
import { HapticEngine } from '../audio/HapticEngine'
import './MediaUsage.css'

const engine = new HapticEngine()

export function MediaUsage() {
  const [ready, setReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  async function analyze() {
    await engine.analyze('/video/chippinIn.mp4')
    setReady(true)
  }

  useEffect(() => {
    if (ready && videoRef.current) {
      engine.attach(videoRef.current)
    }
    return () => engine.detach()
  }, [ready])

  return (
    <div>
      <button onClick={analyze}>{ready ? 'Re-analyze' : 'Analyze'}</button>
      <br /><br />
      <video ref={videoRef} src="/video/chippinIn.mp4" controls style={{ width: '100%' }} />
    </div>
  )
}
