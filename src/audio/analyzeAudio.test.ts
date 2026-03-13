import {describe, test, expect} from 'vitest'
import {
  shouldVibrate,
  computeTrends,
  trendsToVibrationPattern,
  classifyLoudness,
  BUCKET_SIZE,
  type Trend,
} from './analyzeAudio'

// Helper to build a Trend with defaults
function makeTrend(overrides: Partial<Trend> = {}): Trend {
  return {
    startIndex: 0,
    endIndex: 99,
    startTime: 0,
    endTime: 0.01,
    min: 0,
    max: 0,
    leftRms: 0,
    rightRms: 0,
    ...overrides,
  }
}

// ── shouldVibrate ──

describe('shouldVibrate', () => {
  test('returns false when max is below threshold', () => {
    expect(shouldVibrate(makeTrend({max: 0.499, leftRms: 0.3, rightRms: 0.3}))).toBe(false)
  })

  test('returns true when max is exactly at threshold and diff is 0', () => {
    expect(shouldVibrate(makeTrend({max: 0.5, leftRms: 0.3, rightRms: 0.3}))).toBe(true)
  })

  test('returns true when max is above threshold and diff is within bounds', () => {
    expect(shouldVibrate(makeTrend({max: 0.8, leftRms: 0.4, rightRms: 0.35}))).toBe(true)
  })

  test('rejects ramp-up (positive diff > upperBound 0.05)', () => {
    // rightRms - leftRms = 0.4 - 0.3 = 0.1, exceeds upperBound
    expect(shouldVibrate(makeTrend({max: 0.7, leftRms: 0.3, rightRms: 0.4}))).toBe(false)
  })

  test('rejects sharp drop-off (diff < lowerBound -0.3)', () => {
    // rightRms - leftRms = 0.1 - 0.5 = -0.4, below lowerBound
    expect(shouldVibrate(makeTrend({max: 0.7, leftRms: 0.5, rightRms: 0.1}))).toBe(false)
  })

  test('allows diff at lowerBound (-0.3)', () => {
    // rightRms - leftRms = 0.2 - 0.5 = -0.3 (clean in floating point)
    expect(shouldVibrate(makeTrend({max: 0.6, leftRms: 0.5, rightRms: 0.2}))).toBe(true)
  })

  test('allows diff exactly at upperBound (0.05)', () => {
    // rightRms - leftRms = 0.35 - 0.3 = 0.05
    expect(shouldVibrate(makeTrend({max: 0.6, leftRms: 0.3, rightRms: 0.35}))).toBe(true)
  })

  test('silence never vibrates', () => {
    expect(shouldVibrate(makeTrend({max: 0, leftRms: 0, rightRms: 0}))).toBe(false)
  })
})

// ── classifyLoudness ──

describe('classifyLoudness', () => {
  test('silence at max = 0', () => {
    expect(classifyLoudness(0)).toEqual({label: 'silence', color: '#666'})
  })

  test('quiet when max < 0.3', () => {
    expect(classifyLoudness(0.1)).toEqual({label: 'quiet', color: '#6b9'})
    expect(classifyLoudness(0.299)).toEqual({label: 'quiet', color: '#6b9'})
  })

  test('loud when 0.3 <= max < 0.7', () => {
    expect(classifyLoudness(0.3)).toEqual({label: 'loud', color: '#db6'})
    expect(classifyLoudness(0.5)).toEqual({label: 'loud', color: '#db6'})
    expect(classifyLoudness(0.699)).toEqual({label: 'loud', color: '#db6'})
  })

  test('very loud when max >= 0.7', () => {
    expect(classifyLoudness(0.7)).toEqual({label: 'very loud', color: '#f66'})
    expect(classifyLoudness(1.0)).toEqual({label: 'very loud', color: '#f66'})
  })
})

// ── computeTrends ──

describe('computeTrends', () => {
  test('empty data returns empty trends', () => {
    expect(computeTrends(new Float32Array([]), 44100)).toEqual([])
  })

  test('single bucket with known values', () => {
    // 10 samples, bucket size 10, sample rate 100 (so 1 bucket = 0.1s)
    const data = new Float32Array([0.1, -0.2, 0.3, -0.4, 0.5, -0.6, 0.7, -0.8, 0.9, -1.0])
    const trends = computeTrends(data, 100, 10)

    expect(trends).toHaveLength(1)
    const t = trends[0]
    expect(t.startIndex).toBe(0)
    expect(t.endIndex).toBe(9)
    expect(t.startTime).toBe(0)
    expect(t.endTime).toBe(9 / 100) // 0.09
    expect(t.min).toBe(0.1)  // min of abs values
    expect(t.max).toBe(1.0)  // max of abs values
  })

  test('splits data into correct number of buckets', () => {
    const data = new Float32Array(100)
    const trends = computeTrends(data, 44100, 10)
    expect(trends).toHaveLength(10)
  })

  test('partial last bucket is included', () => {
    const data = new Float32Array(15) // bucket size 10 → 2 buckets (10 + 5)
    data.fill(0.5)
    const trends = computeTrends(data, 100, 10)

    expect(trends).toHaveLength(2)
    expect(trends[1].startIndex).toBe(10)
    expect(trends[1].endIndex).toBe(14)
  })

  test('all zeros produces silence trends', () => {
    const data = new Float32Array(10) // all zeros
    const trends = computeTrends(data, 100, 10)

    expect(trends).toHaveLength(1)
    expect(trends[0].min).toBe(0)
    expect(trends[0].max).toBe(0)
    expect(trends[0].leftRms).toBe(0)
    expect(trends[0].rightRms).toBe(0)
  })

  test('RMS is computed correctly for each half', () => {
    // 4 samples, bucket size 4: left half = [0.6, 0.8], right half = [0.2, 0.4]
    const data = new Float32Array([0.6, 0.8, 0.2, 0.4])
    const trends = computeTrends(data, 100, 4)

    // left: sqrt((0.36 + 0.64) / 2) = sqrt(0.5) ≈ 0.707
    // right: sqrt((0.04 + 0.16) / 2) = sqrt(0.1) ≈ 0.316
    expect(trends[0].leftRms).toBeCloseTo(0.707, 2)
    expect(trends[0].rightRms).toBeCloseTo(0.316, 2)
  })

  test('negative values are treated as absolute', () => {
    const data = new Float32Array([-0.5, -0.9])
    const trends = computeTrends(data, 100, 2)

    expect(trends[0].min).toBe(0.5)
    expect(trends[0].max).toBe(0.9)
  })

  test('values are rounded to 3 decimal places', () => {
    // sqrt of something that produces many decimals
    const data = new Float32Array([0.1234567])
    const trends = computeTrends(data, 100, 1)

    expect(trends[0].min).toBe(0.123)
    expect(trends[0].max).toBe(0.123)
  })

  test('uses default BUCKET_SIZE when not specified', () => {
    const data = new Float32Array(BUCKET_SIZE * 3)
    const trends = computeTrends(data, 44100)
    expect(trends).toHaveLength(3)
  })

  test('time values are correct relative to sample rate', () => {
    const data = new Float32Array(20)
    const trends = computeTrends(data, 1000, 10) // 1000 Hz, 10 samples per bucket

    expect(trends[0].startTime).toBe(0)
    expect(trends[0].endTime).toBe(9 / 1000) // 0.009
    expect(trends[1].startTime).toBe(10 / 1000) // 0.01
    expect(trends[1].endTime).toBe(19 / 1000) // 0.019
  })
})

// ── trendsToVibrationPattern ──

describe('trendsToVibrationPattern', () => {
  test('empty trends returns empty pattern', () => {
    expect(trendsToVibrationPattern([])).toEqual([])
  })

  test('single vibrating trend', () => {
    const trends = [makeTrend({startTime: 0, endTime: 0.06, max: 0.8, leftRms: 0.3, rightRms: 0.3})]
    const pattern = trendsToVibrationPattern(trends)
    expect(pattern).toEqual([60]) // 60ms vibrate
  })

  test('single non-vibrating trend prepends 0', () => {
    const trends = [makeTrend({startTime: 0, endTime: 0.06, max: 0.1})]
    const pattern = trendsToVibrationPattern(trends)
    // first segment is pause → prepend 0 vibrate
    expect(pattern).toEqual([0, 60])
  })

  test('merges consecutive vibrating trends', () => {
    const trends = [
      makeTrend({startTime: 0, endTime: 0.06, max: 0.8, leftRms: 0.3, rightRms: 0.3}),
      makeTrend({startTime: 0.06, endTime: 0.12, max: 0.7, leftRms: 0.3, rightRms: 0.3}),
    ]
    const pattern = trendsToVibrationPattern(trends)
    expect(pattern).toEqual([120]) // merged: 60 + 60
  })

  test('merges consecutive non-vibrating trends', () => {
    const trends = [
      makeTrend({startTime: 0, endTime: 0.06, max: 0.1}),
      makeTrend({startTime: 0.06, endTime: 0.12, max: 0.2}),
    ]
    const pattern = trendsToVibrationPattern(trends)
    expect(pattern).toEqual([0, 120]) // prepend 0, then merged pause
  })

  test('alternating vibrate/pause pattern', () => {
    const trends = [
      makeTrend({startTime: 0, endTime: 0.06, max: 0.8, leftRms: 0.3, rightRms: 0.3}),     // vibrate
      makeTrend({startTime: 0.06, endTime: 0.12, max: 0.1}),                                 // pause
      makeTrend({startTime: 0.12, endTime: 0.18, max: 0.9, leftRms: 0.4, rightRms: 0.4}),   // vibrate
    ]
    const pattern = trendsToVibrationPattern(trends)
    expect(pattern).toEqual([60, 60, 60]) // vibrate, pause, vibrate
  })

  test('leading pause gets 0 prepended', () => {
    const trends = [
      makeTrend({startTime: 0, endTime: 0.06, max: 0.1}),                                   // pause
      makeTrend({startTime: 0.06, endTime: 0.12, max: 0.8, leftRms: 0.3, rightRms: 0.3}),   // vibrate
    ]
    const pattern = trendsToVibrationPattern(trends)
    // [0 (prepended vibrate), 60 (pause), 60 (vibrate)]
    expect(pattern).toEqual([0, 60, 60])
  })
})
