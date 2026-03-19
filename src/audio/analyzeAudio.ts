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

export const BUCKET_SIZE = 4410 * 0.6

export const VIBRATE_THRESHOLD_RATIO = 0.2 // noise floor as fraction of peak amplitude
export const VIBRATE_THRESHOLD_MIN = 0.020  // absolute minimum floor (prevents triggering on digital silence)
export const NEIGHBOR_RADIUS = 5   // look at N buckets on each side (~300ms at 60ms/bucket), default 5
export const SPIKE_RATIO = 2      // must be this much louder than neighbor average, default 1.5
export const PREVIOUS_WEIGHT = 0.5     // past neighbors count less in the average (helps decay tails sustain haptics)

export function computeNoiseFloor(trends: Trend[]): number {
  const peakAmplitude = trends.reduce((max, t) => Math.max(max, t.max), 0)
  return Math.max(peakAmplitude * VIBRATE_THRESHOLD_RATIO, VIBRATE_THRESHOLD_MIN)
}

// Path B: compare each bucket to its neighbors instead of absolute threshold + RMS diff
export function computeVibrationMap(trends: Trend[]): boolean[] {
  const noiseFloor = computeNoiseFloor(trends)

  return trends.map((t, i) => {
    if (t.max < noiseFloor) return false

    let sum = 0
    let count = 0
    for (let j = i - NEIGHBOR_RADIUS; j <= i + NEIGHBOR_RADIUS; j++) {
      if (j === i || j < 0 || j >= trends.length) continue
      const weight = j < i ? PREVIOUS_WEIGHT : 1
      sum += trends[j].max * weight
      count += 1
    }

    if (count === 0) return true // isolated bucket, no neighbors
    const neighborAvg = sum / count
    if (neighborAvg < 0.001) return true // spike from silence

    return t.max / neighborAvg >= SPIKE_RATIO
  })
}

// old approach: absolute threshold + RMS left/right diff bounds
// export function shouldVibrate(t: Trend): boolean {
//   const diff = t.rightRms - t.leftRms
//   const lowerBound = -0.09
//   const upperBound = 0.015
//   return (t.max >= VIBRATE_THRESHOLD) && (lowerBound <= diff && diff <= upperBound)
// }

export function computeTrends(data: Float32Array, sampleRate: number, bucketSize = BUCKET_SIZE): Trend[] {
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

  // Vibration API pattern starts with vibrate — if first segment is a pause, prepend 0
  if (segments.length > 0 && !segments[0].vibrate) {
    segments.unshift({vibrate: true, ms: 0})
  }

  return segments.map((s) => s.ms)
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
export async function filterToBass(audioBuffer: AudioBuffer, cutoffHz = 350): Promise<Float32Array> {
  const offline = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate)
  const source = offline.createBufferSource()
  source.buffer = audioBuffer

  const filter = offline.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = cutoffHz

  source.connect(filter)
  filter.connect(offline.destination)
  source.start(0)

  const rendered = await offline.startRendering()
  return rendered.getChannelData(0)
}

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
