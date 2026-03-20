import type { Attachment } from 'discord.js'
import { describe, expect, it } from 'vitest'
import { chunk, noteSent, RECENT_SENT_CAP, safeAttName } from '../src/utils.js'

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
      const long = `${'a'.repeat(6)}\n\n${'b'.repeat(6)}\n\n${'c'.repeat(6)}`
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
      const text = 'aaaa\n\n\n\nbbbb'
      const result = chunk(text, 6, 'newline')
      expect(result).toHaveLength(2)
      expect(result[0]).toBe('aaaa\n\n')
      expect(result[1]).toBe('bbbb')
    })
  })

  it('handles empty string', () => {
    expect(chunk('', 10, 'length')).toEqual([''])
  })
})

describe('safeAttName()', () => {
  function fakeAtt(name: string | null, id = 'fallback-id'): Attachment {
    return { name, id } as unknown as Attachment
  }

  it('returns name as-is when clean', () => {
    expect(safeAttName(fakeAtt('photo.png'))).toBe('photo.png')
  })

  it('replaces brackets', () => {
    expect(safeAttName(fakeAtt('file[1].txt'))).toBe('file_1_.txt')
  })

  it('replaces newlines and semicolons', () => {
    expect(safeAttName(fakeAtt('a\r\nb;c.txt'))).toBe('a__b_c.txt')
  })

  it('falls back to id when name is null', () => {
    expect(safeAttName(fakeAtt(null, '123456'))).toBe('123456')
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
