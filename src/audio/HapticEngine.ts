import {
  analyzeAudio,
  decodeAudioBuffer,
  computeTrends,
  computeVibrationMap,
  computeNoiseFloor,
  trendsToVibrationPattern,
  computeChainData,
  computeIntensity,
  intensityToPattern,
  type AnalysisResult,
  type Trend,
  type HapticOptions,
  DEFAULT_OPTIONS,
} from './analyzeAudio'

/**
 * Core class for audio-to-haptics conversion. Works in vanilla JS and any framework.
 * For React projects, use the `useHaptics` hook instead — it manages the lifecycle automatically.
 * When using this class directly, you are responsible for calling `detach()` yourself.
 *
 * **Buckets and chains**: the audio is split into fixed-size time slices called *buckets* —
 * each one holds the peak amplitude for that window. The duration per bucket is controlled by
 * `opts.bucketSize` (default 2646 samples = ~60ms at 44100Hz; e.g. 4410 samples = ~100ms).
 * A *chain* is a consecutive run of vibrating buckets. Chain-level values (intensity, length,
 * end time) are aggregated across the whole run and are the same constant for every bucket in
 * the chain. Bucket-level values vary per slice.
 *
 * @example
 * ```ts
 * const engine = new HapticEngine()
 * await engine.analyze('https://example.com/audio.mp3')
 * engine.attach(audioElement)
 * // later:
 * engine.detach()
 * ```
 */
export class HapticEngine {
  private _opts: HapticOptions
  private _channelData: Float32Array | null = null
  private _sampleRate: number = 44100
  private _duration: number = 0
  private _numberOfChannels: number = 0
  private _outputLatency: number = 0
  private _baseLatency: number = 0
  private _trends: Trend[] = []
  private _vibrationMap: boolean[] = []
  private _noiseFloor: number = 0
  private _pattern: number[] = []
  private _chainEndTime: number[] = []
  private _chainIntensity: number[] = []
  private _chainLength: number[] = []

  private _muted = false
  private _rafId = 0
  private _wasVibrating = false
  private _lastInterruption = 0
  private _playbackChainIntensity: number = 0
  private _playbackBucketIntensity: number = 0
  private _playbackChainIsShortBurst: boolean = false
  private _audioEl: HTMLMediaElement | null = null
  private _onTick: ((time: number, chainIntensity: number, bucketIntensity: number, chainIsShortBurst: boolean) => void) | null = null
  private _cleanup: (() => void) | null = null

  /**
   * @param opts - Optional algorithm knobs to configure. Any fields you omit fall back to `DEFAULT_OPTIONS`.
   */
  constructor(opts: Partial<HapticOptions> = {}) {
    this._opts = {...DEFAULT_OPTIONS, ...opts}
  }

  /** Raw amplitude samples from the first audio channel. `null` before analysis. Returns a copy. */
  get channelData(): Float32Array | null { return this._channelData ? new Float32Array(this._channelData) : null }

  /** Samples per second of the analyzed audio (typically 44100 or 48000). */
  get sampleRate(): number { return this._sampleRate }

  /** Total length of the analyzed audio in seconds. */
  get duration(): number { return this._duration }

  /** Number of channels in the original audio (e.g. 1 = mono, 2 = stereo). */
  get numberOfChannels(): number { return this._numberOfChannels }

  /** Audio hardware pipeline delay in seconds. Used internally for the mute window calculation. */
  get outputLatency(): number { return this._outputLatency }

  /** Browser-side audio processing delay in seconds. Used internally for the mute window calculation. */
  get baseLatency(): number { return this._baseLatency }

  /** Per-bucket amplitude data from the analysis. One entry per bucket (duration controlled by `opts.bucketSize`, default ~60ms). Returns a copy. */
  get trends(): Trend[] { return structuredClone(this._trends) }

  /**
   * Boolean array, one entry per bucket. `true` means the device should vibrate during that bucket.
   * Returns a copy.
   */
  get vibrationMap(): boolean[] { return [...this._vibrationMap] }

  /** Computed noise floor amplitude. Buckets below this are never vibrated. */
  get noiseFloor(): number { return this._noiseFloor }

  /**
   * Per-bucket end time of the vibration chain that bucket belongs to, in seconds.
   * Used by the RAF loop to calculate how long to fire the vibration pattern.
   * Returns a copy.
   */
  get chainEndTime(): number[] { return [...this._chainEndTime] }

  /**
   * Per-bucket average intensity (0–1) of the vibration chain that bucket belongs to.
   * Used by the RAF loop to calculate PWM duty cycle.
   * Returns a copy.
   */
  get chainIntensity(): number[] { return [...this._chainIntensity] }

  /**
   * Per-bucket length (in buckets) of the vibration chain that bucket belongs to.
   * Chains shorter than `opts.shortChainBuckets` fire as a solid MAX pulse instead of PWM.
   * Returns a copy.
   */
  get chainLength(): number[] { return [...this._chainLength] }

  /** Copy of the current algorithm options. Reflects what was passed to the constructor merged with `DEFAULT_OPTIONS`. */
  get opts(): HapticOptions { return {...this._opts} }

  /**
   * Chain-average intensity (0–1) for the active vibration chain, updated every animation frame.
   * Constant across every bucket in the chain — does not vary as the chain decays.
   * 0 outside vibrating chains (silence, paused, or below noise floor).
   * This is the value used to compute PWM duty cycle for haptics.
   */
  get playbackChainIntensity(): number { return this._playbackChainIntensity }

  /**
   * Per-bucket intensity (0–1) for the current bucket, updated every animation frame.
   * Varies within a chain as the audio decays — use this to drive frame-by-frame visuals
   * like a blob that shrinks as a kick drum echo fades.
   * 0 outside vibrating chains (same gate as `playbackChainIntensity`).
   */
  get playbackBucketIntensity(): number { return this._playbackBucketIntensity }

  /**
   * Whether the current chain is a short transient burst, updated every animation frame.
   * Derived from the chain's bucket count: `true` when `chainLength < opts.shortChainBuckets`.
   * Constant for every bucket in the chain — does not change mid-chain.
   * `true` = short chain (kick, snap, gunshot — fires as solid MAX pulse).
   * `false` = sustained chain or silence (fires as PWM pattern).
   */
  get playbackChainIsShortBurst(): boolean { return this._playbackChainIsShortBurst }

  /** Whether haptics are suppressed. When `true`, `navigator.vibrate()` is never called, but the RAF loop keeps running. */
  get muted(): boolean { return this._muted }

  /** Suppress or restore haptics. The RAF loop keeps running either way. */
  set muted(value: boolean) { this._muted = value }

  /** Flips the muted state. */
  toggleMuted(): void { this._muted = !this._muted }

  /**
   * The full vibration pattern as a `navigator.vibrate()` array — alternating vibrate/pause durations in ms.
   * Used for fire-and-forget playback. The RAF loop uses chain data instead for precise sync.
   * Returns a copy.
   */
  get pattern(): number[] { return [...this._pattern] }

  /**
   * Fetches an audio file from a URL and runs the full analysis pipeline.
   * Call this before `attach()`. For raw bytes, use `analyzeBuffer` instead.
   *
   * @param url - URL of the audio file to fetch and analyze (MP3, WAV, FLAC, etc.)
   */
  async analyze(url: string): Promise<void> {
    const result = await analyzeAudio(url)
    this._storeResult(result)
  }

  /**
   * Convenience: runs `analyze` + `attach` in one call.
   * Set `mediaEl.src` yourself before calling `play()` — e.g. `<audio src="...">` or `<video src="...">`.
   *
   * @param url - URL of the audio file to analyze
   * @param mediaEl - The `<audio>` or `<video>` element to attach to
   * @param onTick - Optional callback fired every animation frame. See `attach()` for argument details.
   */
  async load(url: string, mediaEl: HTMLMediaElement, onTick?: (time: number, chainIntensity: number, bucketIntensity: number, chainIsShortBurst: boolean) => void): Promise<void> {
    await this.analyze(url)
    this.attach(mediaEl, onTick)
  }

  /**
   * Runs the full analysis pipeline from raw audio bytes.
   * Use this when you already have the file as an `ArrayBuffer` — e.g. from a file input or drag-and-drop.
   * For a URL, use `analyze` instead.
   *
   * @param arrayBuffer - Raw audio file bytes (MP3, WAV, FLAC, etc.)
   */
  async analyzeBuffer(arrayBuffer: ArrayBuffer): Promise<void> {
    const result = await decodeAudioBuffer(arrayBuffer)
    this._storeResult(result)
  }

  private _storeResult(result: AnalysisResult): void {
    this._channelData = result.channelData
    this._sampleRate = result.sampleRate
    this._duration = result.duration
    this._numberOfChannels = result.numberOfChannels
    this._outputLatency = result.outputLatency
    this._baseLatency = result.baseLatency
    this._trends = computeTrends(result.channelData, result.sampleRate, this._opts.bucketSize)
    this._vibrationMap = computeVibrationMap(this._trends, this._opts)
    this._noiseFloor = computeNoiseFloor(this._trends, this._opts)
    this._pattern = trendsToVibrationPattern(this._trends, this._vibrationMap)
    const { chainEndTime, chainIntensity, chainLength } = computeChainData(this._trends, this._vibrationMap, this._opts)
    this._chainEndTime = chainEndTime
    this._chainIntensity = chainIntensity
    this._chainLength = chainLength

    const peak = this._trends.reduce((max, t) => Math.max(max, t.max), 0)
    const belowFloor = this._trends.filter(t => t.max > 0 && t.max < this._noiseFloor).length
    const silent = this._trends.filter(t => t.max === 0).length
    const total = this._trends.length
    console.log(`[noise floor] peak=${peak}, noiseFloor=${this._noiseFloor.toFixed(4)}, buckets: ${total} total, ${silent} silent, ${belowFloor} below floor (${(belowFloor/total*100).toFixed(1)}% filtered), ${total - silent - belowFloor} above floor`)
  }

  /**
   * Starts the RAF loop that drives haptics in sync with the media element.
   * Call this after `analyze()` or `analyzeBuffer()` completes.
   * Automatically handles pause, seek, and mute window suppression.
   *
   * @param mediaEl - The `<audio>` or `<video>` element to sync haptics with
   * @param onTick - Optional callback fired every animation frame while playing.
   *   - `time` — current playback position in seconds
   *   - `chainIntensity` — chain-average intensity (0–1); constant for the whole chain. Same as `playbackChainIntensity`.
   *   - `bucketIntensity` — per-bucket intensity (0–1); varies frame-by-frame within a chain. Same as `playbackBucketIntensity`.
   *   - `chainIsShortBurst` — `true` if the chain is shorter than `opts.shortChainBuckets`. Same as `playbackChainIsShortBurst`.
   */
  attach(mediaEl: HTMLMediaElement, onTick?: (time: number, chainIntensity: number, bucketIntensity: number, chainIsShortBurst: boolean) => void): void {
    this.detach()
    this._audioEl = mediaEl
    this._onTick = onTick ?? null

    const onPause = () => {
      navigator.vibrate(0)
      this._wasVibrating = false
      this._lastInterruption = performance.now()
    }

    const onSeeked = () => {
      if (this._wasVibrating) {
        navigator.vibrate(0)
        this._wasVibrating = false
      }
      this._lastInterruption = performance.now()
    }

    mediaEl.addEventListener('pause', onPause)
    mediaEl.addEventListener('seeked', onSeeked)

    this._cleanup = () => {
      mediaEl.removeEventListener('pause', onPause)
      mediaEl.removeEventListener('seeked', onSeeked)
    }

    const bucketSize = this._opts.bucketSize
    let wasPaused = true
    const tick = () => {
      if (this._audioEl) {
        const currentTime = this._audioEl.currentTime
        const isPlaying = !this._audioEl.paused

        if (isPlaying && wasPaused) {
          // Detect paused→playing transition inside the RAF loop rather than from a DOM
          // event. DOM events (play/playing) may fire before the audio hardware pipeline
          // is ready on some devices, causing the mute window to start too early.
          // Measuring from here ensures the mute window is anchored to the same frame
          // that begins executing haptic logic.
          this._lastInterruption = performance.now()
        }
        wasPaused = !isPlaying

        const muteWindowMs = (this._outputLatency + this._baseLatency) * 1000
        const inMuteWindow = performance.now() - this._lastInterruption < muteWindowMs

        if (this._trends.length > 0 && isPlaying) {
          const bucketIndex = Math.floor((currentTime * this._sampleRate) / bucketSize)
          const shouldVib = this._vibrationMap[bucketIndex] ?? false

          // Visual sync: updated every frame regardless of mute window
          this._playbackChainIntensity = shouldVib ? (this._chainIntensity[bucketIndex] ?? 0) : 0
          this._playbackBucketIntensity = shouldVib ? computeIntensity(this._trends[bucketIndex].max, this._noiseFloor) : 0
          this._playbackChainIsShortBurst = shouldVib ? this._chainLength[bucketIndex] < this._opts.shortChainBuckets : false

          // Haptics: gated by mute window
          if (!inMuteWindow) {
            if (shouldVib && !this._muted) {
              if (!this._wasVibrating) {
                const bucketDurationMs = Math.round(bucketSize / this._sampleRate * 1000)
                const remainingMs = Math.max(bucketDurationMs, Math.round((this._chainEndTime[bucketIndex] - currentTime) * 1000))
                const isShortChain = this._chainLength[bucketIndex] < this._opts.shortChainBuckets
                const pattern = isShortChain
                  ? [remainingMs]
                  : intensityToPattern(remainingMs, this._chainIntensity[bucketIndex], this._opts)
                navigator.vibrate(pattern)
                this._wasVibrating = true
              }
            } else if (this._wasVibrating) {
              navigator.vibrate(0)
              this._wasVibrating = false
            }
          }
        } else {
          this._playbackChainIntensity = 0
          this._playbackBucketIntensity = 0
          this._playbackChainIsShortBurst = false
        }

        this._onTick?.(currentTime, this._playbackChainIntensity, this._playbackBucketIntensity, this._playbackChainIsShortBurst)
      }
      this._rafId = requestAnimationFrame(tick)
    }
    this._rafId = requestAnimationFrame(tick)
  }

  /**
   * Stops the RAF loop, cancels any active vibration, and removes all event listeners.
   * Safe to call even if `attach()` was never called.
   */
  detach(): void {
    cancelAnimationFrame(this._rafId)
    this._rafId = 0
    if (this._wasVibrating) {
      navigator.vibrate(0)
      this._wasVibrating = false
    }
    this._cleanup?.()
    this._cleanup = null
    this._audioEl = null
    this._onTick = null
  }
}
