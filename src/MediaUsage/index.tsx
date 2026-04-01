import { useHaptics } from '../audio/useHaptics'
import './MediaUsage.css'

export function MediaUsage() {
  const { mediaRef, analyze, ready } = useHaptics<HTMLVideoElement>()

  return (
    <div>
      <button onClick={() => analyze('/video/chippinIn.mp4')}>{ready ? 'Re-analyze' : 'Analyze'}</button>
      <br /><br />
      <video ref={mediaRef} src="/video/chippinIn.mp4" controls style={{ width: '100%' }} />
    </div>
  )
}
