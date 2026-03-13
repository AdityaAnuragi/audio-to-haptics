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

export const VIBRATE_THRESHOLD = 0.5

export function shouldVibrate(t: Trend): boolean {
  const diff = t.rightRms - t.leftRms
  const lowerBound = -0.3
  const upperBound = 0.05
  return (t.max >= VIBRATE_THRESHOLD) && (lowerBound <= diff && diff <= upperBound)
  // return (t.max >= 0.5) && (diff < 0.1)
}

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

export function trendsToVibrationPattern(trends: Trend[]): number[] {
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

export async function decodeAudioBuffer(arrayBuffer: ArrayBuffer): Promise<AnalysisResult> {
  const audioContext = new AudioContext()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
  const channelData = audioBuffer.getChannelData(0)

  const outputLatency = audioContext.outputLatency ?? -100
  const baseLatency = audioContext.baseLatency ?? -100

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
