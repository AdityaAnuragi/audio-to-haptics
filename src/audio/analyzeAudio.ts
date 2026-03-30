export interface Trend {
  startIndex: number
  endIndex: number
  startTime: number
  endTime: number
  min: number
  max: number
  leftRms: number
  rightRms: number
}

export interface HapticOptions {
  bucketSize: number
  vibrateThresholdRatio: number // noise floor as a fraction of peak amplitude
  vibrateThresholdMin: number   // absolute minimum floor (prevents triggering on digital silence)
  neighborRadius: number        // look at N buckets in the past (~240ms at 60ms/bucket)
  spikeRatio: number            // must be this much louder than past neighbor average
  sustainLowerBound: number     // minimum ratio of current to previous max to sustain vibration through decay
  sustainUpperBound: number     // maximum ratio of current to previous max to sustain (blocks rising sections)
}

export const DEFAULT_OPTIONS: HapticOptions = {
  bucketSize: 4410 * 0.6,
  vibrateThresholdRatio: 0.4,
  vibrateThresholdMin: 0.040,
  neighborRadius: 4,
  spikeRatio: 1.5,
  sustainLowerBound: 0.75,
  sustainUpperBound: 1.01,
}

// export const BUCKET_SIZE = DEFAULT_OPTIONS.bucketSize
// export const VIBRATE_THRESHOLD_RATIO = DEFAULT_OPTIONS.vibrateThresholdRatio
// export const VIBRATE_THRESHOLD_MIN = DEFAULT_OPTIONS.vibrateThresholdMin
// export const NEIGHBOR_RADIUS = DEFAULT_OPTIONS.neighborRadius
// export const SPIKE_RATIO = DEFAULT_OPTIONS.spikeRatio
// export const PREVIOUS_WEIGHT = 0.5 // redundant with past-only comparison — asymmetry is already achieved by dropping future neighbors
// export const SUSTAIN_LOWER_BOUND = DEFAULT_OPTIONS.sustainLowerBound
// export const SUSTAIN_UPPER_BOUND = DEFAULT_OPTIONS.sustainUpperBound

export function computeNoiseFloor(trends: Trend[], opts: HapticOptions = DEFAULT_OPTIONS): number {
  const peakAmplitude = trends.reduce((max, t) => Math.max(max, t.max), 0)
  return Math.max(peakAmplitude * opts.vibrateThresholdRatio, opts.vibrateThresholdMin)
}

// Path B: compare each bucket to its past neighbors (past-only — no future context, avoids lifting future's loud neighbors into the average)
export function computeVibrationMap(trends: Trend[], opts: HapticOptions = DEFAULT_OPTIONS): boolean[] {
  const noiseFloor = computeNoiseFloor(trends, opts)
  const result: boolean[] = []

  for (let i = 0; i < trends.length; i++) {
    const t = trends[i]

    // sustain check runs before a noise floor — decay tail can bridge below the floor naturally
    let vibrate = false
    if (i > 0 && result[i - 1]) {
      const prev = trends[i - 1].max
      if (t.max >= prev * opts.sustainLowerBound && t.max <= prev * opts.sustainUpperBound) {
        vibrate = true
        console.log(`[${i}] sustained: max=${t.max} prev=${prev} pct=${(t.max / prev * 100).toFixed(1)}%`)
      }
    }

    if (!vibrate) {
      if (t.max < noiseFloor) { result.push(false); continue }

      let sum = 0
      let count = 0
      for (let j = i - opts.neighborRadius; j < i; j++) {
        if (j < 0) continue
        sum += trends[j].max
        count += 1
      }

      if (count === 0 || sum / count < 0.001) {
        vibrate = true // isolated bucket or spike from silence
      } else {
        const pastAvg = sum / count
        const ratio = t.max / pastAvg
        vibrate = ratio >= opts.spikeRatio
        if (vibrate) {
          console.log(`[${i}] max=${t.max} pastAvg=${pastAvg.toFixed(4)} ratio=${ratio.toFixed(2)}`)
        }
      }
    }

    result.push(vibrate)
  }

  return result
}

// post-processing attempt (burst-based density cap + onset memory) — reverted, added complexity without solving decay tail problem
// export function postProcessVibrationMap(...) { ... }

// old approach: absolute threshold + RMS left/right diff bounds
// export function shouldVibrate(t: Trend): boolean {
//   const diff = t.rightRms - t.leftRms
//   const lowerBound = -0.09
//   const upperBound = 0.015
//   return (t.max >= VIBRATE_THRESHOLD) && (lowerBound <= diff && diff <= upperBound)
// }

export function computeTrends(data: Float32Array, sampleRate: number, bucketSize = DEFAULT_OPTIONS.bucketSize): Trend[] {
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

export function trendsToVibrationPattern(trends: Trend[], vibrationMap: boolean[]): number[] {
  const segments: { vibrate: boolean; ms: number }[] = []

  for (let i = 0; i < trends.length; i++) {
    const t = trends[i]
    const ms = Math.round((t.endTime - t.startTime) * 1000)
    const vibrate = vibrationMap[i]

    const last = segments[segments.length - 1]
    if (last && last.vibrate === vibrate) {
      last.ms += ms
    } else {
      segments.push({vibrate, ms})
    }
  }

  // Vibration API pattern starts with vibrating — if the first segment is a pause, prepend 0
  if (segments.length > 0 && !segments[0].vibrate) {
    segments.unshift({vibrate: true, ms: 0})
  }

  return segments.map((s) => s.ms)
}

export function computeIntensity(trendMax: number, noiseFloor: number): number {
  return Math.max(0, Math.min(1, (trendMax - noiseFloor) / (1 - noiseFloor)))
}

export function intensityToPattern(durationMs: number, intensity: number): number[] {
  const clamped = Math.max(0.5, Math.min(1, intensity))
  if (clamped >= 1) return [durationMs]
  const cycleMs = 20
  const onMs = Math.max(1, Math.round(cycleMs * clamped))
  const offMs = cycleMs - onMs
  if (offMs === 0) return [durationMs]
  const numCycles = Math.floor(durationMs / cycleMs)
  if (numCycles === 0) return [durationMs]
  const remainder = durationMs - numCycles * cycleMs
  const pattern: number[] = []
  for (let i = 0; i < numCycles; i++) pattern.push(onMs, offMs)
  pattern[pattern.length - 1] = offMs + remainder
  return pattern
}

export function computeChainData(trends: Trend[], vibrationMap: boolean[], opts: HapticOptions = DEFAULT_OPTIONS): { chainEndTime: number[], chainIntensity: number[] } {
  const noiseFloor = computeNoiseFloor(trends, opts)
  const chainEndTime: number[] = new Array(trends.length).fill(0)
  const chainIntensity: number[] = new Array(trends.length).fill(0)

  let i = 0
  while (i < trends.length) {
    if (!vibrationMap[i]) { i++; continue }

    let j = i
    while (j < trends.length && vibrationMap[j]) j++
    // run covers i..j-1

    const endTime = trends[j - 1].endTime
    let sum = 0
    for (let k = i; k < j; k++) sum += computeIntensity(trends[k].max, noiseFloor)
    const avgIntensity = sum / (j - i)

    for (let k = i; k < j; k++) {
      chainEndTime[k] = endTime
      chainIntensity[k] = avgIntensity
    }

    i = j
  }

  return { chainEndTime, chainIntensity }
}

export function classifyLoudness(max: number): { label: string; color: string } {
  if (max === 0) return {label: 'silence', color: '#666'}
  if (max < 0.3) return {label: 'quiet', color: '#6b9'}
  if (max < 0.7) return {label: 'loud', color: '#db6'}
  return {label: 'very loud', color: '#f66'}
}

export interface AnalysisResult {
  channelData: Float32Array
  sampleRate: number
  duration: number
  numberOfChannels: number
  outputLatency: number
  baseLatency: number
}

/** Run audio through a lowpass filter at cutoffHz using OfflineAudioContext → bass-only Float32Array */
// export async function filterToBass(audioBuffer: AudioBuffer, cutoffHz = 350): Promise<Float32Array> {
//   const offline = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate)
//   const source = offline.createBufferSource()
//   source.buffer = audioBuffer
//
//   const filter = offline.createBiquadFilter()
//   filter.type = 'lowpass'
//   filter.frequency.value = cutoffHz
//
//   source.connect(filter)
//   filter.connect(offline.destination)
//   source.start(0)
//
//   const rendered = await offline.startRendering()
//   return rendered.getChannelData(0)
// }

export async function decodeAudioBuffer(arrayBuffer: ArrayBuffer): Promise<AnalysisResult> {
  const audioContext = new AudioContext()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
  // Path B uses full-spectrum amplitude (no bass filter)
  const channelData = audioBuffer.getChannelData(0)
  // const channelData = await filterToBass(audioBuffer)

  const outputLatency = audioContext.outputLatency ?? 0
  const baseLatency = audioContext.baseLatency ?? 0

  await audioContext.close()

  return {
    channelData,
    sampleRate: audioBuffer.sampleRate,
    duration: audioBuffer.duration,
    numberOfChannels: audioBuffer.numberOfChannels,
    outputLatency,
    baseLatency,
  }
}

export async function analyzeAudio(url: string): Promise<AnalysisResult> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return decodeAudioBuffer(arrayBuffer)
}
