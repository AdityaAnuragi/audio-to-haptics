import {useEffect, useMemo, useRef, useState} from 'react'
import './App.css'
import {analyzeAudio, type AnalysisResult, type Trend, BUCKET_SIZE, shouldVibrate} from './audio/analyzeAudio'
import WaveformView from './WaveformView'

function computeTrends(data: Float32Array, sampleRate: number, bucketSize = BUCKET_SIZE): Trend[] {
  const trends: Trend[] = []

  for (let i = 0; i < data.length; i += bucketSize) {
    const end = Math.min(i + bucketSize, data.length)
    const mid = Math.floor((i + end) / 2)
    let min = Infinity
    let max = -Infinity
    let leftSumOfSquares = 0
    let rightSumOfSquares = 0

    for (let j = i; j < end; j++) {
      const v = Math.abs(data[j])
      if (v < min) min = v
      if (v > max) max = v
      if (j < mid) {
        leftSumOfSquares += v * v
      } else {
        rightSumOfSquares += v * v
      }
    }

    const leftCount = mid - i
    const rightCount = end - mid
    let leftRms = Math.sqrt(leftSumOfSquares / (leftCount || 1))
    let rightRms = Math.sqrt(rightSumOfSquares / (rightCount || 1))

    // round for readability
    min = Math.round(min * 1000) / 1000
    max = Math.round(max * 1000) / 1000
    leftRms = Math.round(leftRms * 1000) / 1000
    rightRms = Math.round(rightRms * 1000) / 1000

    const startTime = i / sampleRate
    const endTime = (end - 1) / sampleRate

    trends.push({startIndex: i, endIndex: end - 1, startTime, endTime, min, max, leftRms, rightRms})
  }

  return trends
}

function trendsToVibrationPattern(trends: Trend[]): number[] {
  // Build alternating [vibrate, pause, vibrate, pause, ...] array
  // "loud" and "very loud" = vibrate, everything else = pause
  const segments: { vibrate: boolean; ms: number }[] = []

  for (const t of trends) {
    const ms = Math.round((t.endTime - t.startTime) * 1000)
    const vibrate = shouldVibrate(t)

    const last = segments[segments.length - 1]
    if (last && last.vibrate === vibrate) {
      last.ms += ms
    } else {
      segments.push({vibrate, ms})
    }
  }

  // Vibration API pattern starts with vibrate — if first segment is a pause, prepend 0
  if (segments.length > 0 && !segments[0].vibrate) {
    segments.unshift({vibrate: true, ms: 0})
  }

  return segments.map((s) => s.ms)
}

// threshold value of 0.3
// https://cdn.pixabay.com/audio/2022/03/10/audio_888827b659.mp3 (truck)

// threshold value of 0.4
// https://cdn.pixabay.com/audio/2025/05/27/audio_3331fe5270.mp3 (simple gun)
// https://cdn.pixabay.com/audio/2025/10/21/audio_92be5a14ad.mp3 (sniper)
// https://cdn.pixabay.com/audio/2022/03/21/audio_f0e01c4b7a.mp3 (ball bouncing)
// https://cdn.pixabay.com/audio/2022/03/19/audio_1712057a76.mp3 (hammering a nail, not the best example)
// https://cdn.pixabay.com/audio/2022/03/10/audio_fecee3808e.mp3 (hammering a nail, a little better)

// threshold value of 0.5
// https://cdn.pixabay.com/audio/2024/06/19/audio_68b1203fa2.mp3 (chainsaw, best eg)
// https://cdn.pixabay.com/audio/2022/03/15/audio_f683707390.mp3 (chainsaw, )
// https://cdn.pixabay.com/audio/2022/03/10/audio_d5bb26c341.mp3 (chainsaw, quite weak)
// https://cdn.pixabay.com/audio/2022/12/06/audio_e25cf45a1c.mp3 (chainsaw, this is also really really good const threshold = 0.5 const lowerBound = -0.3 const upperBound = 0.02, bucket size = 4410 * 0.6 or 60ms)
// https://cdn.pixabay.com/audio/2022/11/05/audio_997c8fe344.mp3 (beep beep I'm a sheep, this is perfect with const threshold = 0.5 const lowerBound = -0.4 const upperBound = 0.05 )
// https://cdn.pixabay.com/audio/2022/03/15/audio_045f46ad75.mp3 (bike passing by)
// https://cdn.pixabay.com/audio/2022/03/10/audio_62476ec2db.mp3 (bike firing, utterfail this one)
// https://cdn.pixabay.com/audio/2025/05/07/audio_208fe5a4c3.mp3 (bike rev)
// https://cdn.pixabay.com/audio/2022/03/10/audio_6bb0a8df69.mp3
// https://cdn.pixabay.com/audio/2024/12/03/audio_731302cf58.mp3 (bike taking off)
// https://cdn.pixabay.com/audio/2024/01/24/audio_23938106b7.mp3 (bike, good, const threshold = 0.5 const lowerBound = -0.4 const upperBound = 0.02)
// https://cdn.pixabay.com/audio/2026/02/25/audio_44dfed5596.mp3 (car engine, bad)
// https://cdn.pixabay.com/audio/2024/10/27/audio_c331d77d7e.mp3 (swords, eh)
// https://cdn.pixabay.com/audio/2022/03/15/audio_2335b3b43a.mp3 (more beeps)
// https://cdn.pixabay.com/audio/2022/11/04/audio_9ff1118f72.mp3 (more beeps)


function classifyLoudness(max: number): { label: string; color: string } {
  if (max === 0) return {label: 'silence', color: '#666'}
  if (max < 0.3) return {label: 'quiet', color: '#6b9'}
  if (max < 0.7) return {label: 'loud', color: '#db6'}
  return {label: 'very loud', color: '#f66'}
}

function App() {
  const [url, setUrl] = useState('https://cdn.pixabay.com/audio/2022/11/05/audio_997c8fe344.mp3')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [playing, setPlaying] = useState(false)
  const [playbackTime, setPlaybackTime] = useState(0) // seconds, from audioEl.currentTime
  const [vibrateMode, setVibrateMode] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number>(0)
  const wasVibratingRef = useRef(false)

  const trends = useMemo(() => result ? computeTrends(result.channelData, result.sampleRate) : [], [result])
  const pattern = useMemo(() => trendsToVibrationPattern(trends), [trends])

  useEffect(() => {
    if (playing) {
      const tick = () => {
        const audio = audioRef.current
        if (audio) {
          setPlaybackTime(audio.currentTime)

          // RAF-synced vibration: look up trend at current playback position
          if (vibrateMode && trends.length > 0) {
            const bucketIndex = Math.floor((audio.currentTime * (result?.sampleRate ?? 44100)) / BUCKET_SIZE)
            const trend = trends[bucketIndex]
            const shouldVib = trend ? shouldVibrate(trend) : false

            if (shouldVib) {
              // fire/re-fire each frame to keep motor going across bucket boundaries
              navigator.vibrate(Math.round(BUCKET_SIZE / (result?.sampleRate ?? 44100) * 1000))
              wasVibratingRef.current = true
            } else if (wasVibratingRef.current) {
              navigator.vibrate(0)
              wasVibratingRef.current = false
            }
          }
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } else {
      cancelAnimationFrame(rafRef.current)
      setPlaybackTime(0)
      if (wasVibratingRef.current) {
        navigator.vibrate(0)
        wasVibratingRef.current = false
      }
    }
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, vibrateMode, trends, result])

  const handleAnalyze = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await analyzeAudio(url)
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1>Audio to Haptics</h1>

      <div style={{display: 'flex', gap: '8px', marginBottom: '16px'}}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Audio URL"
          style={{flex: 1, padding: '8px', fontSize: '14px'}}
        />
        <button onClick={handleAnalyze} disabled={loading || !url}>
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      <div style={{display: 'flex', gap: '8px', marginBottom: '16px'}}>
        <button
          onClick={() => {
            if (playing) {
              audioRef.current?.pause()
              audioRef.current = null
              navigator.vibrate(0)
              setVibrateMode(false)
              setPlaying(false)
            } else {
              const audio = new Audio(url)
              audio.onended = () => {
                navigator.vibrate(0);
                setVibrateMode(false)
                setPlaying(false)
              }
              void audio.play()
              audioRef.current = audio
              setPlaying(true)
            }
          }}
          disabled={!url}
        >
          {playing ? 'Stop' : 'Play'}
        </button>
        <button
          onClick={() => {
            if (playing) {
              audioRef.current?.pause()
              audioRef.current = null
              navigator.vibrate(0)
              setVibrateMode(false)
              setPlaying(false)
            } else {
              const audio = new Audio(url)
              audio.onended = () => {
                navigator.vibrate(0);
                setVibrateMode(false)
                setPlaying(false)
              }
              void audio.play()
              setVibrateMode(true)
              audioRef.current = audio
              setPlaying(true)
            }
          }}
          disabled={!url || trends.length === 0}
        >
          {playing ? 'Stop' : 'Play + Vibrate'}
        </button>
        {playing && <span style={{fontFamily: 'monospace', fontSize: '16px', alignSelf: 'center'}}>
          {playbackTime.toFixed(3)}s (from audio element)
        </span>}
      </div>

      {error && <p style={{color: '#ff6b6b'}}>Error: {error}</p>}

      {result && <>
        <WaveformView channelData={result.channelData} sampleRate={result.sampleRate} trends={trends} playing={playing} playbackTime={playbackTime} audioEl={audioRef.current}/>
        <ResultView result={result} trends={trends} pattern={pattern}/>
      </>}
    </div>
  )
}

function ResultView({result, trends, pattern}: { result: AnalysisResult; trends: Trend[]; pattern: number[] }) {
  return (
    <div style={{textAlign: 'left'}}>
      <h2>Result</h2>
      <button onClick={() => navigator.vibrate(pattern)}>
        Vibrate
      </button>
      <button onClick={() => navigator.vibrate(0)} style={{marginLeft: '8px'}}>
        Stop Vibration
      </button>
      <p style={{fontSize: '12px', color: '#888'}}>
        Pattern: [{pattern.join(', ')}] ({pattern.length} entries)
      </p>
      <p>Sample Rate: {result.sampleRate} Hz</p>
      <p>Duration: {result.duration.toFixed(2)}s</p>
      <p>Channels: {result.numberOfChannels}</p>
      <p>Total Samples: {result.channelData.length.toLocaleString()}</p>

      <h3>Trends (absolute values)</h3>
      {(() => {
        const vibrateTrends = trends.filter(shouldVibrate)
        return <>
          <p style={{fontSize: '12px', color: '#888'}}>{vibrateTrends.length} vibrate-worthy trends</p>
          <div style={{maxHeight: '400px', overflow: 'auto', fontSize: '13px', fontFamily: 'monospace'}}>
            {vibrateTrends.map((t, i) => (
              <div key={i} style={{padding: '2px 0'}}>
                {t.startTime.toFixed(2)}s – {t.endTime.toFixed(2)}s{' '}
                <span style={{color: '#888'}}>
              [{t.startIndex.toLocaleString()} – {t.endIndex.toLocaleString()}]
            </span>{' '}
                {(() => {
                  const {label, color} = classifyLoudness(t.max)
                  const diff = Math.round((t.rightRms - t.leftRms) * 1000) / 1000
                  return <>
                    <span style={{color}}>{label}</span>
                    {` (${t.min} – ${t.max})`}
                    {' '}<span style={{color: '#888'}}>L:{t.leftRms} R:{t.rightRms} ({diff >= 0 ? '+' : ''}{diff})</span>
                    {' '}<span style={{color: '#0ff', fontWeight: 'bold'}}>VIBRATE</span>
                  </>
                })()}
              </div>
            ))}
          </div>
        </>
      })()}
    </div>
  )
}

export default App
