import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDebug } from '../src/debug.js'

describe('createDebug', () => {
  const originalEnv = process.env.CHANNEL_MUX_DEBUG

  beforeEach(() => {
    delete process.env.CHANNEL_MUX_DEBUG
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CHANNEL_MUX_DEBUG = originalEnv
    } else {
      delete process.env.CHANNEL_MUX_DEBUG
    }
  })

  it('does not write when disabled', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const dbg = createDebug('test')
    dbg('hello')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('reports enabled=false when env var is not set', () => {
    const dbg = createDebug('test')
    expect(dbg.enabled).toBe(false)
  })

  it('writes to stderr when CHANNEL_MUX_DEBUG=1', () => {
    process.env.CHANNEL_MUX_DEBUG = '1'
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const dbg = createDebug('mux:test')
    dbg('hello', 'world')
    expect(spy).toHaveBeenCalledOnce()
    const output = spy.mock.calls[0][0] as string
    expect(output).toContain('mux:test:')
    expect(output).toContain('hello world')
    expect(output).toMatch(/^\[.*T.*Z\]/) // ISO timestamp
    spy.mockRestore()
  })

  it('reports enabled=true when CHANNEL_MUX_DEBUG=true', () => {
    process.env.CHANNEL_MUX_DEBUG = 'true'
    const dbg = createDebug('test')
    expect(dbg.enabled).toBe(true)
  })

  it('JSON-stringifies non-string arguments', () => {
    process.env.CHANNEL_MUX_DEBUG = '1'
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const dbg = createDebug('test')
    dbg('data', { key: 'value' })
    const output = spy.mock.calls[0][0] as string
    expect(output).toContain('{"key":"value"}')
    spy.mockRestore()
  })

  it('reflects env changes dynamically', () => {
    const dbg = createDebug('test')
    expect(dbg.enabled).toBe(false)
    process.env.CHANNEL_MUX_DEBUG = '1'
    expect(dbg.enabled).toBe(true)
    delete process.env.CHANNEL_MUX_DEBUG
    expect(dbg.enabled).toBe(false)
  })
})
