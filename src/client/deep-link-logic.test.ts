/**
 * Unit tests for the pure deep-link-logic module: parsing the `#msg=<key>`
 * URL hash and rebuilding it. No React, no DOM — the anchor key is treated as
 * an opaque string (length-prefixed `13:input-message<id>` — never split).
 */
import { describe, expect, it } from 'vitest'
import { buildMessageHash, parseDeepLinkHash } from './deep-link-logic'

describe('parseDeepLinkHash', () => {
  it('extracts the anchor key from a #msg= hash, opaque and unparsed', () => {
    expect(parseDeepLinkHash('#msg=13:input-messageabc')).toBe('13:input-messageabc')
    expect(parseDeepLinkHash('#msg=14:assistant-step3:2')).toBe('14:assistant-step3:2')
  })

  it('returns null for an empty hash', () => {
    expect(parseDeepLinkHash('')).toBeNull()
  })

  it('returns null for an empty #msg= value', () => {
    expect(parseDeepLinkHash('#msg=')).toBeNull()
  })

  it('returns null for hashes that are not message deep links', () => {
    expect(parseDeepLinkHash('#other=value')).toBeNull()
    expect(parseDeepLinkHash('#msg')).toBeNull()
    expect(parseDeepLinkHash('#')).toBeNull()
    expect(parseDeepLinkHash('msg=13:input-messageabc')).toBeNull()
  })

  it('round-trips every key shape through buildMessageHash', () => {
    for (const key of ['13:input-messageabc', '13:user<kbd-1>', '14:assistant-step3:2']) {
      expect(parseDeepLinkHash(buildMessageHash(key))).toBe(key)
    }
  })

  it('percent-encodes URL-fragment-unsafe key characters and decodes them back', () => {
    // The URL fragment parser encodes `<`/`>` (and `"` / backtick / lone `%`),
    // so a raw `13:user<dl-2>` hash would read back as `%3Cdl-2%3E` and never
    // match a mark. The builder encodes, the parser decodes.
    expect(buildMessageHash('13:user<dl-2>')).toBe('#msg=13:user%3Cdl-2%3E')
    expect(parseDeepLinkHash('#msg=13:user%3Cdl-2%3E')).toBe('13:user<dl-2>')
    expect(parseDeepLinkHash(buildMessageHash('13:input-message<msgId>'))).toBe('13:input-message<msgId>')
  })

  it('returns null for a key with a malformed percent escape', () => {
    expect(parseDeepLinkHash('#msg=abc%ZZ')).toBeNull()
    expect(parseDeepLinkHash('#msg=abc%')).toBeNull()
  })
})

describe('buildMessageHash', () => {
  it('prefixes the key with #msg=', () => {
    expect(buildMessageHash('13:input-messageabc')).toBe('#msg=13:input-messageabc')
  })
})
