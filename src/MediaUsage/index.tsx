import { useRef } from 'react'
import { useHaptics } from '../audio/useHaptics'
import './MediaUsage.css'

export function MediaUsage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { analyze, ready } = useHaptics(videoRef)

  return (
    <div>
      <button onClick={() => analyze('/video/chippinIn.mp4')}>{ready ? 'Re-analyze' : 'Analyze'}</button>
      <br /><br />
      <video ref={videoRef} src="/video/chippinIn.mp4" controls style={{ width: '100%' }} />
    </div>
  )
}
