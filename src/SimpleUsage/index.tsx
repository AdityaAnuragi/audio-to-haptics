import { useState } from 'react'
import { useHaptics } from '../audio/useHaptics'
import './SimpleUsage.css'

export function SimpleUsage() {
  const [url, setUrl] = useState('/TRIMMED Chippin In.mp3')
  const { mediaRef, analyze, ready } = useHaptics()

  return (
    <div>
      <input
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="Audio URL"
        style={{ width: '400px' }}
      />
      <br /><br />
      <button onClick={() => analyze(url)}>{ready ? 'Re-analyze' : 'Analyze'}</button>
      <br /><br />
      <audio ref={mediaRef} src={url} controls />
    </div>
  )
}
