import { useEffect, useRef, useState } from 'react'
import { HapticEngine } from '../audio/HapticEngine'
// import { intensityToPattern, DEFAULT_OPTIONS, type Trend } from '../audio/analyzeAudio'
import './MediaUsage.css'

const engine = new HapticEngine()

// interface Analysis {
//   channelData: Float32Array
//   sampleRate: number
//   duration: number
//   numberOfChannels: number
//   outputLatency: number
//   baseLatency: number
//   trends: Trend[]
//   vibrationMap: boolean[]
//   noiseFloor: number
//   bucketSize: number
//   pattern: number[]
//   chainEndTime: number[]
//   chainIntensity: number[]
//   chainLength: number[]
//   shortChainBuckets: number
//   intensityFloor: number
//   cycleMs: number
// }

// function formatPattern(pattern: number[]): string {
//   if (pattern.length === 1) return `[${pattern[0]}ms]`
//   const on = pattern[0], gap = pattern[1]
//   const repeats = Math.floor(pattern.length / 2)
//   const lastGap = pattern[pattern.length - 1]
//   const gapStr = lastGap !== gap ? `~${gap}` : `${gap}`
//   return `[${on}, ${gapStr}] ×${repeats}`
// }

export function MediaUsage() {
  const [ready, setReady] = useState(false)
  // const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  async function analyze() {
    await engine.analyze('/video/chippinIn.mp4')
    setReady(true)
    // const opts = engine.opts
    // setAnalysis({
    //   channelData: engine.channelData!,
    //   sampleRate: engine.sampleRate,
    //   duration: engine.duration,
    //   numberOfChannels: engine.numberOfChannels,
    //   outputLatency: engine.outputLatency,
    //   baseLatency: engine.baseLatency,
    //   trends: engine.trends,
    //   vibrationMap: engine.vibrationMap,
    //   noiseFloor: engine.noiseFloor,
    //   bucketSize: opts.bucketSize,
    //   pattern: engine.pattern,
    //   chainEndTime: engine.chainEndTime,
    //   chainIntensity: engine.chainIntensity,
    //   chainLength: engine.chainLength,
    //   shortChainBuckets: opts.shortChainBuckets,
    //   intensityFloor: opts.intensityFloor,
    //   cycleMs: opts.cycleMs,
    // })
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
      {/* {analysis && <ResultView analysis={analysis} trends={analysis.trends} vibrationMap={analysis.vibrationMap} pattern={analysis.pattern} />} */}
    </div>
  )
}

// function ResultView({ analysis, trends, vibrationMap, pattern }: { analysis: Analysis; trends: Trend[]; vibrationMap: boolean[]; pattern: number[] }) {
//   return (
//     <div style={{ textAlign: 'left' }}>
//       <h2>Result</h2>
//       <button onClick={() => navigator.vibrate(pattern)}>Vibrate</button>
//       <button onClick={() => navigator.vibrate(0)} style={{ marginLeft: '8px' }}>Stop Vibration</button>
//       <button
//         onClick={() => {
//           const data = JSON.stringify({ trends, vibrationMap, vibrationPattern: pattern })
//           navigator.clipboard.writeText(data).then(() => alert('Copied!'))
//         }}
//         style={{ marginLeft: '8px' }}
//       >
//         Copy Test Data
//       </button>
//       <p style={{ fontSize: '12px', color: '#888' }}>Pattern: [{pattern.join(', ')}] ({pattern.length} entries)</p>
//       <p>Sample Rate: {analysis.sampleRate} Hz</p>
//       <p>Duration: {analysis.duration.toFixed(2)}s</p>
//       <p>Channels: {analysis.numberOfChannels}</p>
//       <p>Total Samples: {analysis.channelData.length.toLocaleString()}</p>
//       <p>Output Latency: {analysis.outputLatency}s ({Math.round(analysis.outputLatency * 1000)}ms)</p>
//       <p>Base Latency: {analysis.baseLatency}s ({Math.round(analysis.baseLatency * 1000)}ms)</p>
//
//       <h3>Haptic Chains</h3>
//       {(() => {
//         const bucketDurationMs = Math.round(analysis.bucketSize / analysis.sampleRate * 1000)
//         const chains: { startIdx: number; endIdx: number }[] = []
//         for (let i = 0; i < trends.length; i++) {
//           if (!vibrationMap[i] || vibrationMap[i - 1]) continue
//           let j = i
//           while (j < trends.length && vibrationMap[j]) j++
//           chains.push({ startIdx: i, endIdx: j - 1 })
//         }
//         return <>
//           <p style={{ fontSize: '12px', color: '#888' }}>{chains.length} chains ({vibrationMap.filter(Boolean).length} buckets)</p>
//           <div style={{ maxHeight: '400px', overflow: 'auto', fontSize: '13px', fontFamily: 'monospace' }}>
//             {chains.map(({ startIdx, endIdx }) => {
//               const first = trends[startIdx]
//               const last = trends[endIdx]
//               const length = analysis.chainLength[startIdx]
//               const avgIntensity = analysis.chainIntensity[startIdx]
//               const remainingMs = Math.max(bucketDurationMs, Math.round((analysis.chainEndTime[startIdx] - first.startTime) * 1000))
//               const isShortChain = length < analysis.shortChainBuckets
//               const r = Math.round(avgIntensity < 0.5 ? avgIntensity * 2 * 255 : 255)
//               const g = Math.round(avgIntensity < 0.5 ? 255 : (1 - (avgIntensity - 0.5) * 2) * 255)
//               const b = Math.round(avgIntensity < 0.5 ? 255 * (1 - avgIntensity * 2) : 0)
//               return (
//                 <div key={startIdx} style={{ padding: '2px 0' }}>
//                   {first.startTime.toFixed(2)}s – {last.endTime.toFixed(2)}s{' '}
//                   <span style={{ color: '#888' }}>{length}b</span>{' '}
//                   <span style={{ color: `rgb(${r},${g},${b})`, fontWeight: 'bold' }}>{Math.round(avgIntensity * 100)}%{avgIntensity < analysis.intensityFloor ? <span style={{ color: '#888' }}> →{Math.round(analysis.intensityFloor * 100)}%</span> : null}</span>
//                   {' '}{isShortChain
//                     ? <span style={{ color: '#f90', fontWeight: 'bold' }}>MAX</span>
//                     : <span style={{ color: '#888' }}>{formatPattern(intensityToPattern(remainingMs, avgIntensity, { ...DEFAULT_OPTIONS, intensityFloor: analysis.intensityFloor, cycleMs: analysis.cycleMs }))}</span>
//                   }
//                 </div>
//               )
//             })}
//           </div>
//         </>
//       })()}
//     </div>
//   )
// }
