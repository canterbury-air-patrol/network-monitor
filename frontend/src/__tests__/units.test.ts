import { describe, expect, it } from 'vitest'
import {
  altitudeInputValue,
  DEFAULT_UNITS,
  formatAltitude,
  formatDistance,
  toAltitude,
  toDistance,
  toMetres,
} from '../units'

describe('altitude conversion', () => {
  it('leaves metres alone', () => {
    expect(toAltitude(320, 'm')).toBe(320)
    expect(toMetres(320, 'm')).toBe(320)
  })

  it('converts metres to feet and back', () => {
    expect(toAltitude(100, 'ft')).toBeCloseTo(328.084, 3)
    expect(toMetres(328.084, 'ft')).toBeCloseTo(100, 3)
  })

  it('round-trips a typed altitude', () => {
    expect(toAltitude(toMetres(1050, 'ft'), 'ft')).toBeCloseTo(1050, 6)
  })
})

describe('formatAltitude', () => {
  it('rounds to whole units and names them', () => {
    expect(formatAltitude(120.4, 'm')).toBe('120 m')
    expect(formatAltitude(120, 'ft')).toBe('394 ft')
  })

  it('reports sea level as zero rather than negative zero', () => {
    expect(formatAltitude(-0.2, 'm')).toBe('0 m')
    expect(formatAltitude(-0.02, 'ft')).toBe('0 ft')
  })

  it('keeps a below-datum altitude negative', () => {
    expect(formatAltitude(-12, 'm')).toBe('-12 m')
  })
})

describe('distance conversion', () => {
  it('converts metres to kilometres and miles', () => {
    expect(toDistance(2500, 'km')).toBe(2.5)
    expect(toDistance(1609.344, 'mi')).toBeCloseTo(1, 9)
  })
})

describe('formatDistance', () => {
  // Precision follows the magnitude, so a short hop stays readable and a long
  // leg is not padded with meaningless decimals
  it('shows two decimals under ten units', () => {
    expect(formatDistance(450, 'km')).toBe('0.45 km')
    expect(formatDistance(450, 'mi')).toBe('0.28 mi')
  })

  it('shows one decimal under a hundred units', () => {
    expect(formatDistance(42_400, 'km')).toBe('42.4 km')
  })

  it('drops the decimals above a hundred units', () => {
    expect(formatDistance(250_600, 'km')).toBe('251 km')
    expect(formatDistance(250_600, 'mi')).toBe('156 mi')
  })
})

describe('altitudeInputValue', () => {
  it('keeps a metre value as typed', () => {
    expect(altitudeInputValue(320, 'm')).toBe('320')
  })

  it('rounds a converted value to something an operator would type', () => {
    expect(altitudeInputValue(320, 'ft')).toBe('1049.9')
  })
})

describe('defaults', () => {
  it('starts on SI', () => {
    expect(DEFAULT_UNITS).toEqual({ altitude: 'm', distance: 'km' })
  })
})
