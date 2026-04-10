import { useRef, useState } from 'react'
import { useHaptics } from '../react'
import './SimpleUsage.css'

export function SimpleUsage() {
  const [url, setUrl] = useState('https://cdn.pixabay.com/audio/2022/03/24/audio_51594bdccc.mp3')
  const audioRef = useRef<HTMLAudioElement>(null)
  const { analyze, ready } = useHaptics(audioRef)

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
      <audio ref={audioRef} src={url} controls />
    </div>
  )
}
