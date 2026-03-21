import { describe, expect, it } from 'vitest'
import { RingBuffer } from '../src/ring-buffer.js'

describe('RingBuffer', () => {
  it('returns items in order within capacity', () => {
    const buf = new RingBuffer<number>(5)
    buf.push(1)
    buf.push(2)
    buf.push(3)
    expect(buf.toArray()).toEqual([1, 2, 3])
    expect(buf.size).toBe(3)
  })

  it('drops oldest items when over capacity', () => {
    const buf = new RingBuffer<number>(3)
    buf.push(1)
    buf.push(2)
    buf.push(3)
    buf.push(4)
    buf.push(5)
    expect(buf.toArray()).toEqual([3, 4, 5])
    expect(buf.size).toBe(3)
  })

  it('returns empty array when empty', () => {
    const buf = new RingBuffer<string>(5)
    expect(buf.toArray()).toEqual([])
    expect(buf.size).toBe(0)
  })

  it('handles exactly capacity items', () => {
    const buf = new RingBuffer<number>(3)
    buf.push(1)
    buf.push(2)
    buf.push(3)
    expect(buf.toArray()).toEqual([1, 2, 3])
    expect(buf.size).toBe(3)
  })

  it('wraps around multiple times', () => {
    const buf = new RingBuffer<number>(2)
    for (let i = 1; i <= 10; i++) {
      buf.push(i)
    }
    expect(buf.toArray()).toEqual([9, 10])
  })
})
