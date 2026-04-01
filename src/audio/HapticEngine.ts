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
  private _audioEl: HTMLMediaElement | null = null
  private _onTick: ((time: number) => void) | null = null
  private _cleanup: (() => void) | null = null

  constructor(opts: Partial<HapticOptions> = {}) {
    this._opts = {...DEFAULT_OPTIONS, ...opts}
  }

  get channelData(): Float32Array | null { return this._channelData ? new Float32Array(this._channelData) : null }
  get sampleRate(): number { return this._sampleRate }
  get duration(): number { return this._duration }
  get numberOfChannels(): number { return this._numberOfChannels }
  get outputLatency(): number { return this._outputLatency }
  get baseLatency(): number { return this._baseLatency }
  get trends(): Trend[] { return structuredClone(this._trends) }
  get vibrationMap(): boolean[] { return [...this._vibrationMap] }
  get noiseFloor(): number { return this._noiseFloor }
  get chainEndTime(): number[] { return [...this._chainEndTime] }
  get chainIntensity(): number[] { return [...this._chainIntensity] }
  get chainLength(): number[] { return [...this._chainLength] }
  get opts(): HapticOptions { return {...this._opts} }
  get muted(): boolean { return this._muted }
  set muted(value: boolean) { this._muted = value }
  toggleMuted(): void { this._muted = !this._muted }
  get pattern(): number[] { return [...this._pattern] }

  async analyze(url: string): Promise<void> {
    const result = await analyzeAudio(url)
    this._storeResult(result)
  }

  /** Convenience: analyze + attach in one call. Set audioEl.src yourself before calling play(). */
  async load(url: string, mediaEl: HTMLMediaElement, onTick?: (time: number) => void): Promise<void> {
    await this.analyze(url)
    this.attach(mediaEl, onTick)
  }

  /** For when the user already has raw audio bytes (file input, drag-and-drop, WebSocket, etc.) */
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

  attach(mediaEl: HTMLMediaElement, onTick?: (time: number) => void): void {
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
        this._onTick?.(currentTime)

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

        if (this._trends.length > 0 && !inMuteWindow && !this._audioEl.paused) {
          const bucketIndex = Math.floor((currentTime * this._sampleRate) / bucketSize)
          const shouldVib = this._vibrationMap[bucketIndex] ?? false

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
      }
      this._rafId = requestAnimationFrame(tick)
    }
    this._rafId = requestAnimationFrame(tick)
  }

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
