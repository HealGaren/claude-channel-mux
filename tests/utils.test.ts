import { describe, it, expect } from 'vitest'
import { chunk, noteSent, RECENT_SENT_CAP } from '../src/adapters/discord/utils.js'

describe('chunk()', () => {
  it('returns single-element array when text fits within limit', () => {
    expect(chunk('hello', 10, 'length')).toEqual(['hello'])
  })

  it('returns original text when exactly at limit', () => {
    const text = 'a'.repeat(2000)
    expect(chunk(text, 2000, 'length')).toEqual([text])
  })

  describe('length mode', () => {
    it('splits at limit boundary', () => {
      const text = 'a'.repeat(30)
      const result = chunk(text, 10, 'length')
      expect(result).toHaveLength(3)
      expect(result.every((c) => c.length <= 10)).toBe(true)
      expect(result.join('')).toBe(text)
    })
  })

  describe('newline mode', () => {
    it('prefers paragraph breaks', () => {
      const text = 'aaaa\n\nbbbb\n\ncccc'
      // limit=10, paragraph break at index 4 which is > 10/2=5? No, 4 < 5
      // Let's use a bigger example
      const long = 'a'.repeat(6) + '\n\n' + 'b'.repeat(6) + '\n\n' + 'c'.repeat(6)
      // "aaaaaa\n\nbbbbbb\n\ncccccc" = 22 chars, limit=15
      const result = chunk(long, 15, 'newline')
      expect(result[0]).toBe('aaaaaa\n\nbbbbbb')
      expect(result[1]).toBe('cccccc')
    })

    it('falls back to line breaks', () => {
      const text = 'aaaaaa\nbbbbbb\ncccccc'
      const result = chunk(text, 14, 'newline')
      expect(result[0]).toBe('aaaaaa\nbbbbbb')
      expect(result[1]).toBe('cccccc')
    })

    it('falls back to space breaks', () => {
      const text = 'aaaaaaa bbbbbbb ccccccc'
      const result = chunk(text, 16, 'newline')
      // cuts at space position, remainder keeps leading space
      expect(result[0]).toBe('aaaaaaa bbbbbbb')
      expect(result[1]).toBe(' ccccccc')
    })

    it('hard cuts when no break points exist', () => {
      const text = 'a'.repeat(30)
      const result = chunk(text, 10, 'newline')
      expect(result).toHaveLength(3)
      expect(result[0]).toBe('a'.repeat(10))
    })

    it('strips leading newlines from remainder', () => {
      // "aaaaaa\n\n\n\nbbbbbb" = 16 chars, limit=10
      // lastIndexOf('\n\n', 10) = 7, which is > 5 (limit/2), so cut=7
      // first chunk: "aaaaaa\n" (0..7), remainder: "\n\nbbbbbb"
      // strip leading newlines from remainder -> "bbbbbb"
      // But actually slice(0, cut) includes up to index 7
      // Let's just verify the behavior empirically
      const text = 'aaaa\n\n\n\nbbbb'
      const result = chunk(text, 6, 'newline')
      // The key point: leading newlines on remainder chunks get stripped
      expect(result.length).toBeGreaterThanOrEqual(2)
      // Last chunk should not have leading newlines
      expect(result[result.length - 1]).toBe('bbbb')
    })
  })

  it('handles empty string', () => {
    expect(chunk('', 10, 'length')).toEqual([''])
  })
})

describe('noteSent()', () => {
  it('adds id to the set', () => {
    const set = new Set<string>()
    noteSent(set, 'abc')
    expect(set.has('abc')).toBe(true)
  })

  it('caps the set at RECENT_SENT_CAP', () => {
    const set = new Set<string>()
    for (let i = 0; i < RECENT_SENT_CAP + 10; i++) {
      noteSent(set, `id-${i}`)
    }
    expect(set.size).toBe(RECENT_SENT_CAP)
    // oldest entries should be evicted
    expect(set.has('id-0')).toBe(false)
    expect(set.has(`id-${RECENT_SENT_CAP + 9}`)).toBe(true)
  })
})
