import {describe, test, expect} from 'vitest'
import {trendsToVibrationPattern} from './analyzeAudio'
import {beepBeep, bikeRev} from './fixtures'

describe('beep beep', () => {
  test('vibration pattern matches expected', () => {
    const pattern = trendsToVibrationPattern(beepBeep.trends)
    expect(pattern).toEqual(beepBeep.vibrationPattern)
  })
})

describe('bike rev', () => {
  test('vibration pattern matches expected', () => {
    const pattern = trendsToVibrationPattern(bikeRev.trends)
    expect(pattern).toEqual(bikeRev.vibrationPattern)
  })
})
