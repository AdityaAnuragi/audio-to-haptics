/**
 * Amplitude data for a single time bucket of audio.
 * Think of it like a snapshot every ~60ms: "between 1.2s and 1.26s, the loudest the audio got was 0.8".
 * The full analysis is an array of these, one per bucket.
 */
export interface Trend {
  /** Sample index where this bucket starts */
  startIndex: number

  /** Sample index where this bucket ends (inclusive) */
  endIndex: number

  /** Start time of this bucket in seconds */
  startTime: number

  /** End time of this bucket in seconds */
  endTime: number

  /** Minimum absolute amplitude in this bucket (rarely used) */
  min: number

  /** Peak absolute amplitude in this bucket — primary value used for vibration decisions */
  max: number

  /** RMS amplitude of the first half of the bucket */
  leftRms: number

  /** RMS amplitude of the second half of the bucket */
  rightRms: number
}

/**
 * Knobs for tuning the vibration algorithm.
 * All fields have sensible defaults via `DEFAULT_OPTIONS` — you only need to override what you want to change.
 *
 * Pass a `Partial<HapticOptions>` to `HapticEngine` (vanilla JS / any framework)
 * or to `useHaptics` (React projects).
 */
export interface HapticOptions {
  /** Number of audio samples per bucket. Controls timing precision. Default ~60ms at 44100Hz. */
  bucketSize: number

  /** Noise floor as a fraction of peak amplitude. Buckets below this are never vibrated. Default: 0.4 */
  vibrateThresholdRatio: number

  /** Absolute minimum noise floor regardless of peak. Prevents triggering on near-digital-silence. Default: 0.04 */
  vibrateThresholdMin: number

  /** How many past buckets to compare against when detecting a spike. Default: 4 (~240ms) */
  neighborRadius: number

  /**
   * How much louder than the past average a bucket must be to trigger vibration.
   * Lower = more vibration, higher = only strong spikes. Default: 1.5
   */
  spikeRatio: number

  /**
   * Minimum ratio of current `trend.max` to the previous bucket's `trend.max` to sustain vibration through a decay tail.
   * e.g. 0.75 means "keep vibrating as long as the current bucket hasn't dropped below 75% of the previous bucket's peak".
   * Default: 0.75
   */
  sustainLowerBound: number

  /**
   * Maximum ratio of current `trend.max` to the previous bucket's `trend.max` to count as sustain.
   * Anything above this is treated as a new rising section, not a decay tail — so it won't be sustained through.
   * Default: 1.01
   */
  sustainUpperBound: number

  /**
   * Chains with a length strictly less than this value fire as a solid MAX pulse instead of PWM.
   * e.g. with the default of 4: chains of length 1, 2, or 3 → solid pulse; length 4 or longer → PWM.
   * Short sounds (kicks, snaps) feel more impactful as a solid pulse. Default: 4
   */
  shortChainBuckets: number

  /**
   * Minimum intensity (0–1) for sections where haptics are active.
   * Clamps quieter-but-haptic sections upward so the motor doesn't receive a duty cycle too low to spin.
   * e.g. 0.55 means even the quietest vibrating section gets at least 55% duty cycle. Default: 0.55
   */
  intensityFloor: number

  /**
   * PWM cycle period in ms. Each on+off pair sums to this value.
   * At 20ms with 50% intensity: `[10, 10, 10, 10, ...]` (10ms on, 10ms off, repeating).
   * At 10ms with 50% intensity: `[5, 5, 5, 5, ...]` (5ms on, 5ms off, repeating).
   * Motor inertia smooths these rapid cycles into perceived partial amplitude. Default: 20
   */
  cycleMs: number
}

/** Sensible defaults for all algorithm knobs. Pass `Partial<HapticOptions>` to override only what you need. */
export const DEFAULT_OPTIONS: HapticOptions = {
  bucketSize: 4410 * 0.6,
  vibrateThresholdRatio: 0.4,
  vibrateThresholdMin: 0.040,
  neighborRadius: 4,
  spikeRatio: 1.5,
  sustainLowerBound: 0.75,
  sustainUpperBound: 1.01,
  shortChainBuckets: 4,
  intensityFloor: 0.6,
  cycleMs: 20,
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

export function intensityToPattern(durationMs: number, intensity: number, opts: HapticOptions = DEFAULT_OPTIONS): number[] {
  const clamped = Math.max(opts.intensityFloor, Math.min(1, intensity))
  if (clamped >= 1) return [durationMs]
  const cycleMs = opts.cycleMs
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

export function computeChainData(trends: Trend[], vibrationMap: boolean[], opts: HapticOptions = DEFAULT_OPTIONS): { chainEndTime: number[], chainIntensity: number[], chainLength: number[] } {
  const noiseFloor = computeNoiseFloor(trends, opts)
  const chainEndTime: number[] = new Array(trends.length).fill(0)
  const chainIntensity: number[] = new Array(trends.length).fill(0)
  const chainLength: number[] = new Array(trends.length).fill(0)

  let i = 0
  while (i < trends.length) {
    if (!vibrationMap[i]) { i++; continue }

    let j = i
    while (j < trends.length && vibrationMap[j]) j++
    // run covers i..j-1

    const endTime = trends[j - 1].endTime
    const length = j - i
    let sum = 0
    for (let k = i; k < j; k++) sum += computeIntensity(trends[k].max, noiseFloor)
    const avgIntensity = sum / length

    for (let k = i; k < j; k++) {
      chainEndTime[k] = endTime
      chainIntensity[k] = avgIntensity
      chainLength[k] = length
    }

    i = j
  }

  return { chainEndTime, chainIntensity, chainLength }
}

// export function classifyLoudness(max: number): { label: string; color: string } {
//   if (max === 0) return {label: 'silence', color: '#666'}
//   if (max < 0.3) return {label: 'quiet', color: '#6b9'}
//   if (max < 0.7) return {label: 'loud', color: '#db6'}
//   return {label: 'very loud', color: '#f66'}
// }

/**
 * Raw output from decoding an audio file — returned by `analyzeAudio` and `decodeAudioBuffer`.
 * You won't usually need to work with this directly; it's consumed internally by `HapticEngine`.
 */
export interface AnalysisResult {
  /** Raw amplitude samples from the first audio channel, one float per sample */
  channelData: Float32Array

  /** Samples per second (typically 44100 or 48000) */
  sampleRate: number

  /** Total length of the audio in seconds */
  duration: number

  /** Number of channels in the original audio (e.g. 1 = mono, 2 = stereo) */
  numberOfChannels: number

  /**
   * Audio hardware pipeline delay in seconds, reported by the browser's AudioContext.
   * Used to calculate the mute window after play/seek so haptics don't fire before sound reaches the speakers.
   */
  outputLatency: number

  /**
   * Additional browser-side audio processing delay in seconds.
   * Combined with `outputLatency` for the full mute window calculation.
   */
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

/**
 * Decodes raw audio bytes into an `AnalysisResult`.
 * Use this when you already have the file as an `ArrayBuffer` — e.g. from a file input or drag-and-drop.
 * For a URL, use `analyzeAudio` instead.
 *
 * @param arrayBuffer - Raw audio file bytes (MP3, WAV, FLAC, etc.)
 * @returns Decoded audio data including channel samples, sample rate, duration, and latency values
 */
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

/**
 * Fetches an audio file from a URL and decodes it into an `AnalysisResult`.
 * For raw bytes (file input, drag-and-drop), use `decodeAudioBuffer` instead.
 *
 * @param url - URL of the audio file to fetch and decode (MP3, WAV, FLAC, etc.)
 * @returns Decoded audio data including channel samples, sample rate, duration, and latency values
 * @throws If the fetch fails (non-2xx response) or the audio can't be decoded
 */
export async function analyzeAudio(url: string): Promise<AnalysisResult> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return decodeAudioBuffer(arrayBuffer)
}
