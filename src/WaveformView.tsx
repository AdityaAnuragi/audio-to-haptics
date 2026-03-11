import {useRef, useState, useEffect} from 'react'
import type {Trend} from './App'
import {shouldVibrate, VIBRATE_THRESHOLD} from './App'

interface WaveformViewProps {
  channelData: Float32Array
  sampleRate: number
  trends: Trend[]
  playing: boolean
  elapsed: number // ms since playback started
}

const WINDOW_SAMPLES = 44100 // 1 second at 44100Hz

// Padding must match between canvas draw and playhead positioning
const PAD_LEFT_PCT = 45 / 800 * 100  // 5.625%
const PAD_RIGHT_PCT = 10 / 800 * 100 // 1.25%

export default function WaveformView({channelData, sampleRate, trends, playing, elapsed}: WaveformViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [offset, setOffset] = useState(0)

  const maxOffset = Math.max(0, channelData.length - WINDOW_SAMPLES)
  const stepSize = Math.floor(WINDOW_SAMPLES / 2)
  const windowEnd = Math.min(offset + WINDOW_SAMPLES, channelData.length)
  const windowLen = windowEnd - offset
  const startMs = (offset / sampleRate * 1000).toFixed(0)
  const endMs = (windowEnd / sampleRate * 1000).toFixed(0)
  const windowMs = ((windowEnd - offset) / sampleRate * 1000).toFixed(0)

  // Current playback sample position
  const currentSample = (elapsed / 1000) * sampleRate

  // Auto-advance page when playback passes current window
  useEffect(() => {
    if (!playing) return
    if (currentSample >= windowEnd && offset < maxOffset) {
      setOffset(Math.min(maxOffset, windowEnd))
    }
  }, [playing, currentSample, windowEnd, offset, maxOffset])

  // Reset to start when playback stops
  useEffect(() => {
    if (!playing) setOffset(0)
  }, [playing])

  // Playhead position as percentage within the plot area (0-100)
  const inWindow = playing && currentSample >= offset && currentSample < windowEnd
  const playheadPct = inWindow ? ((currentSample - offset) / windowLen) * 100 : 0

  // Current trend at playhead
  const currentTrend = playing
    ? trends.find(t => currentSample >= t.startIndex && currentSample <= t.endIndex)
    : undefined
  const isVibrating = currentTrend ? shouldVibrate(currentTrend) : false
  const isLoud = currentTrend ? currentTrend.max > 0 : false

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const pad = {top: 20, bottom: 30, left: 45, right: 10}
    const plotW = width - pad.left - pad.right
    const plotH = height - pad.top - pad.bottom

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, width, height)

    // Vibration overlay regions
    for (const t of trends) {
      if (!shouldVibrate(t)) continue
      if (t.endIndex < offset || t.startIndex >= windowEnd) continue

      const x1 = pad.left + ((Math.max(t.startIndex, offset) - offset) / windowLen) * plotW
      const x2 = pad.left + ((Math.min(t.endIndex, windowEnd - 1) - offset) / windowLen) * plotW

      ctx.fillStyle = 'rgba(0, 255, 255, 0.15)'
      ctx.fillRect(x1, pad.top, x2 - x1, plotH)
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)'
      ctx.lineWidth = 1
      ctx.strokeRect(x1, pad.top, x2 - x1, plotH)
    }

    // Waveform — min/max per pixel column for accurate representation
    const samplesPerPx = Math.max(1, Math.floor(windowLen / plotW))
    ctx.strokeStyle = '#4a9'
    ctx.lineWidth = 1
    ctx.beginPath()

    for (let px = 0; px < plotW; px++) {
      const startSample = offset + Math.floor((px / plotW) * windowLen)
      const endSample = Math.min(startSample + samplesPerPx, windowEnd)
      let minVal = Infinity, maxVal = -Infinity

      for (let s = startSample; s < endSample; s++) {
        const v = Math.abs(channelData[s])
        if (v < minVal) minVal = v
        if (v > maxVal) maxVal = v
      }

      // Map [0, 1] → [plotH, 0] (top = 1, bottom = 0)
      const y1 = pad.top + (1 - maxVal) * plotH
      const y2 = pad.top + (1 - minVal) * plotH

      ctx.moveTo(pad.left + px, y1)
      ctx.lineTo(pad.left + px, y2)
    }
    ctx.stroke()

    // Threshold line
    ctx.strokeStyle = 'rgba(255, 100, 100, 0.3)'
    ctx.setLineDash([4, 4])
    const threshY = pad.top + (1 - VIBRATE_THRESHOLD) * plotH
    ctx.beginPath()
    ctx.moveTo(pad.left, threshY)
    ctx.lineTo(pad.left + plotW, threshY)
    ctx.stroke()
    ctx.setLineDash([])

    // Y axis
    ctx.strokeStyle = '#666'
    ctx.beginPath()
    ctx.moveTo(pad.left, pad.top)
    ctx.lineTo(pad.left, pad.top + plotH)
    ctx.stroke()

    // Bottom axis
    ctx.beginPath()
    ctx.moveTo(pad.left, pad.top + plotH)
    ctx.lineTo(pad.left + plotW, pad.top + plotH)
    ctx.stroke()

    // Y-axis labels
    ctx.fillStyle = '#aaa'
    ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    ctx.fillText('1.0', pad.left - 4, pad.top + 4)
    ctx.fillText(String(VIBRATE_THRESHOLD), pad.left - 4, threshY + 3)
    ctx.fillText('0.0', pad.left - 4, pad.top + plotH + 4)

    // X-axis labels
    ctx.textAlign = 'center'
    const startTimeMs = offset / sampleRate * 1000
    const endTimeMs = windowEnd / sampleRate * 1000
    const tickCount = 5
    for (let i = 0; i <= tickCount; i++) {
      const x = pad.left + (i / tickCount) * plotW
      const timeMs = startTimeMs + (i / tickCount) * (endTimeMs - startTimeMs)
      ctx.fillText(`${timeMs.toFixed(0)}ms`, x, pad.top + plotH + 15)

      ctx.strokeStyle = '#666'
      ctx.beginPath()
      ctx.moveTo(x, pad.top + plotH)
      ctx.lineTo(x, pad.top + plotH + 4)
      ctx.stroke()
    }
  }, [channelData, offset, sampleRate, trends, windowEnd, windowLen])

  return (
    <div>
      <h3>Waveform</h3>
      <p style={{fontSize: '12px', color: '#888', margin: '4px 0'}}>
        Viewing {startMs}ms – {endMs}ms (window: {windowMs}ms)
        {' | '}<span style={{color: 'cyan'}}>cyan = vibration</span>
        {' | '}<span style={{color: 'rgba(255, 100, 100, 0.6)'}}>dashed = threshold ({VIBRATE_THRESHOLD})</span>
      </p>
      <canvas
        ref={canvasRef}
        width={800}
        height={300}
        style={{width: '100%', height: 'auto', border: '1px solid #333'}}
      />
      {/* Playhead bar below canvas — matches canvas plot area padding */}
      <div style={{
        position: 'relative',
        height: '12px',
        background: '#111',
        marginLeft: `${PAD_LEFT_PCT}%`,
        marginRight: `${PAD_RIGHT_PCT}%`,
        borderRadius: '2px',
        overflow: 'hidden',
      }}>
        {inWindow && <div style={{
          position: 'absolute',
          left: `${playheadPct}%`,
          top: 0,
          bottom: 0,
          width: '2px',
          background: '#fff',
          transition: 'none',
        }}/>}
      </div>
      <div style={{display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center'}}>
        <button onClick={() => setOffset(0)} disabled={offset === 0}>
          |←
        </button>
        <button onClick={() => setOffset(Math.max(0, offset - stepSize))} disabled={offset === 0}>
          ←
        </button>
        <button onClick={() => setOffset(Math.min(maxOffset, offset + stepSize))} disabled={offset >= maxOffset}>
          →
        </button>
        <button onClick={() => setOffset(maxOffset)} disabled={offset >= maxOffset}>
          →|
        </button>
        <span style={{fontSize: '12px', color: '#888'}}>
          {Math.round(offset / channelData.length * 100)}% through audio
        </span>
      </div>
      {playing && <div style={{display: 'flex', gap: '8px', marginTop: '8px'}}>
        <div style={{
          flex: 1,
          padding: '6px 12px',
          background: isLoud ? '#0ff' : '#333',
          color: isLoud ? '#000' : '#666',
          fontFamily: 'monospace',
          fontSize: '14px',
          fontWeight: 'bold',
          textAlign: 'center',
          borderRadius: '4px',
        }}>
          {isLoud ? 'SOUND' : 'silence'}
        </div>
        <div style={{
          flex: 1,
          padding: '6px 12px',
          background: isVibrating ? '#0ff' : '#333',
          color: isVibrating ? '#000' : '#666',
          fontFamily: 'monospace',
          fontSize: '14px',
          fontWeight: 'bold',
          textAlign: 'center',
          borderRadius: '4px',
        }}>
          {isVibrating ? 'VIBRATING' : 'no vibration'}
        </div>
      </div>}
    </div>
  )
}
