import {useEffect, useMemo, useRef, useState} from 'react'
import './App.css'
import {analyzeAudio, type AnalysisResult, type Trend, BUCKET_SIZE, computeVibrationMap, computeNoiseFloor, computeTrends, trendsToVibrationPattern, classifyLoudness} from './audio/analyzeAudio'
import WaveformView from './WaveformView'


const TEST_AUDIOS = [
  {url: 'https://cdn.pixabay.com/audio/2021/12/31/audio_6d5c2e6cc2.mp3', label: 'bass house' },
  {url: 'https://cdn.pixabay.com/audio/2025/12/25/audio_2be1458a60.mp3', label: 'House Energetic Upbeat' },
  {url: 'when you\'re overqualified for the job.mp3', label: 'drumming meme video' },
  {url: 'https://cdn.pixabay.com/audio/2022/03/24/audio_51594bdccc.mp3', label: 'heart beat' },
  {url: 'https://cdn.pixabay.com/audio/2025/07/16/audio_a368a84757.mp3', label: 'thunder' },
  {url: 'https://cdn.pixabay.com/audio/2025/07/24/audio_567d8dde9e.mp3', label: 'fireworks' },
  {url: 'https://cdn.pixabay.com/audio/2026/02/20/audio_4ea619fc0d.mp3', label: 'Whip' },
  {url: 'https://cdn.pixabay.com/audio/2022/03/10/audio_7f90c5e4fc.mp3', label: 'Metal clashing' },
  // public folder
  {url: '/TRIMMED Chippin In.mp3', label: 'TRIMMED Chippin In.mp3' },
  {url: '/Chop Suey.mp3', label: 'Chop Suey.mp3' },
  {url: '/Death Metal Drumming.mp3', label: 'Death Metal (this is really good)' },
  {url: '/Death Metal Drumming pt.2.mp3', label: 'Death Metal Drumming pt.2.mp3' },
  {url: '/George Kollias -  Shall Rise Shall Be Dead.mp3', label: 'George Kollias (Spike - 1.4)' },
  // favorites
  {url: 'https://cdn.pixabay.com/audio/2022/11/05/audio_997c8fe344.mp3', label: 'Beep beep (0.5, perfect)'},
  {url: 'https://cdn.pixabay.com/audio/2024/01/24/audio_23938106b7.mp3', label: 'Bike (0.5, good)'},
  // {url: 'https://cdn.pixabay.com/audio/2025/05/07/audio_208fe5a4c3.mp3', label: 'Bike rev (0.5)'},
  {url: 'https://cdn.pixabay.com/audio/2022/12/06/audio_e25cf45a1c.mp3', label: 'Chainsaw (0.5, really good)'},
  // threshold 0.3
  {url: 'https://cdn.pixabay.com/audio/2022/03/10/audio_888827b659.mp3', label: 'Truck (0.3)'},
  // threshold 0.4
  {url: 'https://cdn.pixabay.com/audio/2025/05/27/audio_3331fe5270.mp3', label: 'Simple gun (0.4)'},
  {url: 'https://cdn.pixabay.com/audio/2025/10/21/audio_92be5a14ad.mp3', label: 'Sniper (0.4)'},
  {url: 'https://cdn.pixabay.com/audio/2022/03/21/audio_f0e01c4b7a.mp3', label: 'Ball bouncing (0.4)'},
  {url: 'https://cdn.pixabay.com/audio/2022/03/19/audio_1712057a76.mp3', label: 'Hammering nail (0.4, not great)'},
  {url: 'https://cdn.pixabay.com/audio/2022/03/10/audio_fecee3808e.mp3', label: 'Hammering nail (0.4, better)'},
  // threshold 0.5
  {url: 'https://cdn.pixabay.com/audio/2024/06/19/audio_68b1203fa2.mp3', label: 'Chainsaw (0.5, best)'},
  {url: 'https://cdn.pixabay.com/audio/2022/03/15/audio_f683707390.mp3', label: 'Chainsaw (0.5)'},
  {url: 'https://cdn.pixabay.com/audio/2022/03/10/audio_d5bb26c341.mp3', label: 'Chainsaw (0.5, weak)'},
  {url: 'https://cdn.pixabay.com/audio/2022/03/15/audio_045f46ad75.mp3', label: 'Bike passing by (0.5)'},
  {url: 'https://cdn.pixabay.com/audio/2022/03/10/audio_62476ec2db.mp3', label: 'Bike firing (0.5, fail)'},
  {url: 'https://cdn.pixabay.com/audio/2022/03/10/audio_6bb0a8df69.mp3', label: 'Unknown (0.5)'},
  {url: 'https://cdn.pixabay.com/audio/2024/12/03/audio_731302cf58.mp3', label: 'Bike taking off (0.5)'},
  // {url: 'https://cdn.pixabay.com/audio/2024/01/24/audio_23938106b7.mp3', label: 'Bike (0.5, good)'},
  {url: 'https://cdn.pixabay.com/audio/2025/05/07/audio_208fe5a4c3.mp3', label: 'Bike rev (0.5)'},
  {url: 'https://cdn.pixabay.com/audio/2026/02/25/audio_44dfed5596.mp3', label: 'Car engine (0.5, bad)'},
  {url: 'https://cdn.pixabay.com/audio/2024/10/27/audio_c331d77d7e.mp3', label: 'Swords (0.5, eh)'},
  {url: 'https://cdn.pixabay.com/audio/2022/03/15/audio_2335b3b43a.mp3', label: 'More beeps (0.5)'},
  {url: 'https://cdn.pixabay.com/audio/2022/11/04/audio_9ff1118f72.mp3', label: 'More beeps 2 (0.5)'},
]


function App() {
  const [url, setUrl] = useState('https://cdn.pixabay.com/audio/2024/01/24/audio_23938106b7.mp3')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [playing, setPlaying] = useState(false)
  const [playbackTime, setPlaybackTime] = useState(0) // seconds, from audioEl.currentTime
  const [vibrateMode, setVibrateMode] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number>(0)
  const wasVibratingRef = useRef(false)
  const lastInterruptionRef = useRef(0)

  const trends = useMemo(() => result ? computeTrends(result.channelData, result.sampleRate) : [], [result])
  const vibrationMap = useMemo(() => computeVibrationMap(trends), [trends])
  const noiseFloor = useMemo(() => computeNoiseFloor(trends), [trends])
  const pattern = useMemo(() => trendsToVibrationPattern(trends, vibrationMap), [trends, vibrationMap])

  // noise floor stats
  useEffect(() => {
    if (trends.length === 0) return
    const peak = trends.reduce((max, t) => Math.max(max, t.max), 0)
    const belowFloor = trends.filter(t => t.max > 0 && t.max < noiseFloor).length
    const silent = trends.filter(t => t.max === 0).length
    const total = trends.length
    console.log(`[noise floor] peak=${peak}, noiseFloor=${noiseFloor.toFixed(4)}, buckets: ${total} total, ${silent} silent, ${belowFloor} below floor (${(belowFloor/total*100).toFixed(1)}% filtered), ${total - silent - belowFloor} above floor`)
  }, [trends, noiseFloor])

  // uncomment to log trends/vibrationPattern for test fixtures
  // useEffect(() => {
  //   if (trends.length > 0) {
  //     console.log('trends:', JSON.stringify(trends))
  //     console.log('vibrationPattern:', JSON.stringify(pattern))
  //   }
  // }, [trends, pattern])

  useEffect(() => {
    if (playing) {
      const tick = () => {
        const audio = audioRef.current
        if (audio) {
          setPlaybackTime(audio.currentTime)

          // RAF-synced vibration: look up trend at current playback position
          // Mute window: suppress haptics during audio pipeline warmup
          const muteWindowMs = ((result?.outputLatency ?? 0) + (result?.baseLatency ?? 0)) * 1000
          const inMuteWindow = performance.now() - lastInterruptionRef.current < muteWindowMs
          if (vibrateMode && trends.length > 0 && !inMuteWindow) {
            const bucketIndex = Math.floor((audio.currentTime * (result?.sampleRate ?? 44100)) / BUCKET_SIZE)
            const shouldVib = vibrationMap[bucketIndex] ?? false

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
  }, [playing, vibrateMode, vibrationMap, result, trends.length])

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

      <div style={{display: 'flex', gap: '8px', marginBottom: '8px'}}>
        <select
          value={TEST_AUDIOS.some(a => a.url === url) ? url : '__custom__'}
          onChange={(e) => {
            const val = e.target.value
            if (val === '__custom__') {
              setUrl('')
            } else {
              setUrl(val)
            }
            setResult(null)
            setError(null)
            setPlaybackTime(0)
            if (playing) {
              audioRef.current?.pause()
              audioRef.current = null
              navigator.vibrate(0)
              setVibrateMode(false)
              setPlaying(false)
            }
          }}
          style={{flex: 1, padding: '8px', fontSize: '14px'}}
        >
          {TEST_AUDIOS.map((a) => <option key={a.url} value={a.url}>{a.label}</option>)}
          <option value="__custom__">Custom URL...</option>
        </select>
        <button onClick={handleAnalyze} disabled={loading || !url}>
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>
      {!TEST_AUDIOS.some(a => a.url === url) && <div style={{display: 'flex', gap: '8px', marginBottom: '16px'}}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Audio URL"
          style={{flex: 1, padding: '8px', fontSize: '14px'}}
        />
      </div>}

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
          onClick={async () => {
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
              await audio.play() // wait for playback to actually begin before starting RAF loop
              lastInterruptionRef.current = performance.now()
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
        <WaveformView channelData={result.channelData} sampleRate={result.sampleRate} trends={trends} vibrationMap={vibrationMap} noiseFloor={noiseFloor} playing={playing} playbackTime={playbackTime} audioEl={audioRef.current}/>
        <ResultView result={result} trends={trends} vibrationMap={vibrationMap} pattern={pattern}/>
      </>}
    </div>
  )
}

function ResultView({result, trends, vibrationMap, pattern}: { result: AnalysisResult; trends: Trend[]; vibrationMap: boolean[]; pattern: number[] }) {
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
      <p>Output Latency: {result.outputLatency}s ({Math.round(result.outputLatency * 1000)}ms)</p>
      <p>Base Latency: {result.baseLatency}s ({Math.round(result.baseLatency * 1000)}ms)</p>

      <h3>Trends (absolute values)</h3>
      {(() => {
        const vibrateTrends = trends.filter((_, i) => vibrationMap[i])
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
