import {
  analyzeAudio,
  decodeAudioBuffer,
  computeTrends,
  computeVibrationMap,
  computeNoiseFloor,
  trendsToVibrationPattern,
  computeChainData,
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
  private _playbackIntensity: number = 0
  private _playbackIsShortBurst: boolean = false
  private _audioEl: HTMLMediaElement | null = null
  private _onTick: ((time: number, intensity: number, isShortBurst: boolean) => void) | null = null
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

  /** Per-bucket amplitude data from the analysis. One entry per ~60ms of audio. Returns a copy. */
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

  /** Current playback intensity as a 0–1 value, updated every animation frame. 0 = silent or paused, 1 = loudest peak in the audio. Use this to drive visual effects like scaling, brightness, or blur. */
  get playbackIntensity(): number { return this._playbackIntensity }

  /** Whether the current moment is a short transient burst (e.g. a gunshot, heartbeat, drum hit) rather than a sustained section. `true` = sharp hit, fire a spike effect. `false` = sustained sound or silence, use a slower breathing animation. */
  get playbackIsShortBurst(): boolean { return this._playbackIsShortBurst }

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
   * @param onTick - Optional callback fired every animation frame with the current playback time in seconds
   */
  async load(url: string, mediaEl: HTMLMediaElement, onTick?: (time: number, intensity: number, isShortBurst: boolean) => void): Promise<void> {
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
   * @param onTick - Optional callback fired every animation frame with the current playback time in seconds
   */
  attach(mediaEl: HTMLMediaElement, onTick?: (time: number, intensity: number, isShortBurst: boolean) => void): void {
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
          this._playbackIntensity = shouldVib ? (this._chainIntensity[bucketIndex] ?? 0) : 0
          this._playbackIsShortBurst = shouldVib ? this._chainLength[bucketIndex] < this._opts.shortChainBuckets : false

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
          this._playbackIntensity = 0
          this._playbackIsShortBurst = false
        }

        this._onTick?.(currentTime, this._playbackIntensity, this._playbackIsShortBurst)
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
