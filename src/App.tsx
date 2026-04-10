import {useEffect, useRef, useState} from 'react'
import './App.css'
import {type Trend, intensityToPattern, DEFAULT_OPTIONS} from './audio/analyzeAudio'
import {HapticEngine} from './audio/HapticEngine'
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
  {url: '/video/heart_beat.mp4', label: 'heart beat (local mp4, lossy)' },
  {url: '/video/beep_beep.mp4', label: 'beep_beep.mp4 (local mp4, lossy)' },
  {url: '/video/chippinIn_from_mp3.mp4', label: 'TRIMMED chippin in VIDEO (local mp4, lossy)' },
  {url: '/video/chippinIn_flac.mkv', label: 'TRIMMED chippin in VIDEO (local mkv, lossless)' },
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

interface Analysis {
  channelData: Float32Array
  sampleRate: number
  duration: number
  numberOfChannels: number
  outputLatency: number
  baseLatency: number
  trends: Trend[]
  vibrationMap: boolean[]
  noiseFloor: number
  bucketSize: number
  pattern: number[]
  chainEndTime: number[]
  chainIntensity: number[]
  chainLength: number[]
  shortChainBuckets: number
  intensityFloor: number
  cycleMs: number
}

function App() {
  const [url, setUrl] = useState('https://cdn.pixabay.com/audio/2022/03/24/audio_51594bdccc.mp3')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [playing, setPlaying] = useState(false)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [vibrateMode, setVibrateMode] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // const rafRef = useRef<number>(0)
  const engineRef = useRef(new HapticEngine())

  const trends = analysis?.trends ?? []
  const vibrationMap = analysis?.vibrationMap ?? []
  const noiseFloor = analysis?.noiseFloor ?? 0
  const bucketSize = analysis?.bucketSize ?? DEFAULT_OPTIONS.bucketSize
  const pattern = analysis?.pattern ?? []

  // cleanup engine on unmount
  useEffect(() => () => engineRef.current.detach(), [])

  // play-only RAF for playbackTime (no vibration)
  useEffect(() => {
    if (!playing || vibrateMode) return
    let rafId = 0
    const tick = () => {
      if (audioRef.current) setPlaybackTime(audioRef.current.currentTime)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [playing, vibrateMode])

  const handleAnalyze = async () => {
    setLoading(true)
    setError(null)
    setAnalysis(null)

    try {
      const engine = engineRef.current
      await engine.analyze(url)
      setAnalysis({
        channelData: engine.channelData!,
        sampleRate: engine.sampleRate,
        duration: engine.duration,
        numberOfChannels: engine.numberOfChannels,
        outputLatency: engine.outputLatency,
        baseLatency: engine.baseLatency,
        trends: engine.trends,
        vibrationMap: engine.vibrationMap,
        noiseFloor: engine.noiseFloor,
        bucketSize: engine.opts.bucketSize,
        pattern: engine.pattern,
        chainEndTime: engine.chainEndTime,
        chainIntensity: engine.chainIntensity,
        chainLength: engine.chainLength,
        shortChainBuckets: engine.opts.shortChainBuckets,
        intensityFloor: engine.opts.intensityFloor,
        cycleMs: engine.opts.cycleMs,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const stop = () => {
    engineRef.current.detach()
    audioRef.current?.pause()
    audioRef.current = null
    setVibrateMode(false)
    setPlaying(false)
    setPlaybackTime(0)
  }

  return (
    <div>
      <h1>Audio to Haptics</h1>

      <div style={{marginBottom: '8px'}}>
        <select
          value={TEST_AUDIOS.some(a => a.url === url) ? url : '__custom__'}
          onChange={(e) => {
            const val = e.target.value
            if (val === '__custom__') {
              setUrl('')
            } else {
              setUrl(val)
            }
            setAnalysis(null)
            setError(null)
            if (playing) stop()
            else setPlaybackTime(0)
          }}
          style={{width: '100%', padding: '8px', fontSize: '14px'}}
        >
          {TEST_AUDIOS.map((a) => <option key={a.url} value={a.url}>{a.label}</option>)}
          <option value="__custom__">Custom URL...</option>
        </select>
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
        <button onClick={handleAnalyze} disabled={loading || !url}>
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
        <button
          onClick={() => {
            if (playing) {
              stop()
            } else {
              const audio = new Audio(url)
              audio.onended = () => stop()
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
              stop()
            } else {
              const audio = new Audio(url)
              audio.onended = () => stop()
              await audio.play()
              engineRef.current.attach(audio, (t) => setPlaybackTime(t))
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

      <VibrationTester/>

      {analysis && <>
        <WaveformView channelData={analysis.channelData} sampleRate={analysis.sampleRate} trends={trends} vibrationMap={vibrationMap} noiseFloor={noiseFloor} bucketSize={bucketSize} playing={playing} playbackTime={playbackTime}/>
        <ResultView analysis={analysis} trends={trends} vibrationMap={vibrationMap} pattern={pattern}/>
      </>}
    </div>
  )
}

function formatPattern(pattern: number[]): string {
  if (pattern.length === 1) return `[${pattern[0]}ms]`
  const on = pattern[0], gap = pattern[1]
  const repeats = Math.floor(pattern.length / 2)
  const lastGap = pattern[pattern.length - 1]
  const gapStr = lastGap !== gap ? `~${gap}` : `${gap}`
  return `[${on}, ${gapStr}] ×${repeats}`
}

function ResultView({analysis, trends, vibrationMap, pattern}: { analysis: Analysis; trends: Trend[]; vibrationMap: boolean[]; pattern: number[] }) {
  return (
    <div style={{textAlign: 'left'}}>
      <h2>Result</h2>
      <button onClick={() => navigator.vibrate(pattern)}>
        Vibrate
      </button>
      <button onClick={() => navigator.vibrate(0)} style={{marginLeft: '8px'}}>
        Stop Vibration
      </button>
      <button
        onClick={() => {
          const data = JSON.stringify({trends, vibrationMap, vibrationPattern: pattern})
          navigator.clipboard.writeText(data).then(() => alert('Copied!'))
        }}
        style={{marginLeft: '8px'}}
      >
        Copy Test Data
      </button>
      <p style={{fontSize: '12px', color: '#888'}}>
        Pattern: [{pattern.join(', ')}] ({pattern.length} entries)
      </p>
      <p>Sample Rate: {analysis.sampleRate} Hz</p>
      <p>Duration: {analysis.duration.toFixed(2)}s</p>
      <p>Channels: {analysis.numberOfChannels}</p>
      <p>Total Samples: {analysis.channelData.length.toLocaleString()}</p>
      <p>Output Latency: {analysis.outputLatency}s ({Math.round(analysis.outputLatency * 1000)}ms)</p>
      <p>Base Latency: {analysis.baseLatency}s ({Math.round(analysis.baseLatency * 1000)}ms)</p>

      <h3>Haptic Chains</h3>
      {(() => {
        const bucketDurationMs = Math.round(analysis.bucketSize / analysis.sampleRate * 1000)
        // build chain list from vibrationMap
        const chains: { startIdx: number; endIdx: number }[] = []
        for (let i = 0; i < trends.length; i++) {
          if (!vibrationMap[i] || vibrationMap[i - 1]) continue
          let j = i
          while (j < trends.length && vibrationMap[j]) j++
          chains.push({ startIdx: i, endIdx: j - 1 })
        }
        return <>
          <p style={{fontSize: '12px', color: '#888'}}>{chains.length} chains ({vibrationMap.filter(Boolean).length} buckets)</p>
          <div style={{maxHeight: '400px', overflow: 'auto', fontSize: '13px', fontFamily: 'monospace'}}>
            {chains.map(({ startIdx, endIdx }) => {
              const first = trends[startIdx]
              const last = trends[endIdx]
              const length = analysis.chainLength[startIdx]
              const avgIntensity = analysis.chainIntensity[startIdx]
              const remainingMs = Math.max(bucketDurationMs, Math.round((analysis.chainEndTime[startIdx] - first.startTime) * 1000))
              const isShortChain = length < analysis.shortChainBuckets
              const r = Math.round(avgIntensity < 0.5 ? avgIntensity * 2 * 255 : 255)
              const g = Math.round(avgIntensity < 0.5 ? 255 : (1 - (avgIntensity - 0.5) * 2) * 255)
              const b = Math.round(avgIntensity < 0.5 ? 255 * (1 - avgIntensity * 2) : 0)
              return (
                <div key={startIdx} style={{padding: '2px 0'}}>
                  {first.startTime.toFixed(2)}s – {last.endTime.toFixed(2)}s{' '}
                  <span style={{color: '#888'}}>{length}b</span>{' '}
                  <span style={{color: `rgb(${r},${g},${b})`, fontWeight: 'bold'}}>{Math.round(avgIntensity * 100)}%{avgIntensity < analysis.intensityFloor ? <span style={{color: '#888'}}> →{Math.round(analysis.intensityFloor * 100)}%</span> : null}</span>
                  {' '}{isShortChain
                    ? <span style={{color: '#f90', fontWeight: 'bold'}}>MAX</span>
                    : <span style={{color: '#888'}}>{formatPattern(intensityToPattern(remainingMs, avgIntensity, {...DEFAULT_OPTIONS, intensityFloor: analysis.intensityFloor, cycleMs: analysis.cycleMs}))}</span>
                  }
                </div>
              )
            })}
          </div>
        </>
      })()}
    </div>
  )
}

function VibrationTester() {
  const pattern = Array(100).fill([10, 10]).flat()
  return (
    <div style={{marginTop: '24px', textAlign: 'left'}}>
      <h3>Vibration Tester</h3>
      <button onClick={() => navigator.vibrate(pattern)}>Send [10, 10] ×50 ({pattern.length} entries)</button>
      <button onClick={() => navigator.vibrate(0)} style={{marginLeft: '8px'}}>Stop</button>
    </div>
  )
}

export default App
