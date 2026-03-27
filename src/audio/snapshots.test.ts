import {describe, test, expect} from 'vitest'
import {computeVibrationMap, trendsToVibrationPattern} from './analyzeAudio'
import {bike, beepBeep, sniper, deathMetal, chippinIn, heartBeat} from './fixtures'

describe('bike', () => {
  test('vibration map matches expected', () => {
    const vibrationMap = computeVibrationMap(bike.trends)
    expect(vibrationMap).toEqual(bike.expectedVibrationMap)
  })

  test('vibration pattern matches expected', () => {
    const vibrationMap = computeVibrationMap(bike.trends)
    const pattern = trendsToVibrationPattern(bike.trends, vibrationMap)
    expect(pattern).toEqual(bike.expectedVibrationPattern)
  })
})

describe('beep beep', () => {
  test('vibration map matches expected', () => {
    const vibrationMap = computeVibrationMap(beepBeep.trends)
    expect(vibrationMap).toEqual(beepBeep.expectedVibrationMap)
  })

  test('vibration pattern matches expected', () => {
    const vibrationMap = computeVibrationMap(beepBeep.trends)
    const pattern = trendsToVibrationPattern(beepBeep.trends, vibrationMap)
    expect(pattern).toEqual(beepBeep.expectedVibrationPattern)
  })
})

describe('sniper', () => {
  test('vibration map matches expected', () => {
    const vibrationMap = computeVibrationMap(sniper.trends)
    expect(vibrationMap).toEqual(sniper.expectedVibrationMap)
  })

  test('vibration pattern matches expected', () => {
    const vibrationMap = computeVibrationMap(sniper.trends)
    const pattern = trendsToVibrationPattern(sniper.trends, vibrationMap)
    expect(pattern).toEqual(sniper.expectedVibrationPattern)
  })
})

describe('death metal', () => {
  test('vibration map matches expected', () => {
    const vibrationMap = computeVibrationMap(deathMetal.trends)
    expect(vibrationMap).toEqual(deathMetal.expectedVibrationMap)
  })

  test('vibration pattern matches expected', () => {
    const vibrationMap = computeVibrationMap(deathMetal.trends)
    const pattern = trendsToVibrationPattern(deathMetal.trends, vibrationMap)
    expect(pattern).toEqual(deathMetal.expectedVibrationPattern)
  })
})

describe('chippin in', () => {
  test('vibration map matches expected', () => {
    const vibrationMap = computeVibrationMap(chippinIn.trends)
    expect(vibrationMap).toEqual(chippinIn.expectedVibrationMap)
  })

  test('vibration pattern matches expected', () => {
    const vibrationMap = computeVibrationMap(chippinIn.trends)
    const pattern = trendsToVibrationPattern(chippinIn.trends, vibrationMap)
    expect(pattern).toEqual(chippinIn.expectedVibrationPattern)
  })
})

describe('heart beat', () => {
  test('vibration map matches expected', () => {
    const vibrationMap = computeVibrationMap(heartBeat.trends)
    expect(vibrationMap).toEqual(heartBeat.expectedVibrationMap)
  })

  test('vibration pattern matches expected', () => {
    const vibrationMap = computeVibrationMap(heartBeat.trends)
    const pattern = trendsToVibrationPattern(heartBeat.trends, vibrationMap)
    expect(pattern).toEqual(heartBeat.expectedVibrationPattern)
  })
})
