/**
 * Unit tests for the locale dictionary (zh/en). Pure data, no React, no DOM.
 *
 * The contract the later i18n threading depends on:
 *   1. zh and en expose IDENTICAL key sets (a missing translation is a
 *      red test, not a runtime lookup miss).
 *   2. Every value is literal text plus well-formed `{name}` placeholders —
 *      balanced braces, no stray `{{`/`}}`, no empty `{}`, so a naive
 *      `value.replace('{n}', n)` substitution is always well-defined.
 */
import { describe, expect, it } from 'vitest'
import { en, interpolate, translateDict, zh } from './locales'

/**
 * Literal text interleaved with `{name}` tokens only. Rejects stray `{`,
 * `}`, `{{`, `{}`, and any brace pair whose name is empty or non-alphanumeric.
 */
const PLACEHOLDER_STRUCTURE = /^(?:[^{}]+|\{[A-Za-z][A-Za-z0-9]*\})*$/

describe('locales', () => {
  it('zh and en share an identical key set', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })

  it('every zh value has balanced {name} placeholders', () => {
    for (const [key, value] of Object.entries(zh)) {
      expect(value, `zh.${key} must not be empty`).toBeTruthy()
      expect(value, `zh.${key}`).toMatch(PLACEHOLDER_STRUCTURE)
    }
  })

  it('every en value has balanced {name} placeholders', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value, `en.${key} must not be empty`).toBeTruthy()
      expect(value, `en.${key}`).toMatch(PLACEHOLDER_STRUCTURE)
    }
  })
})

describe('interpolate / translateDict (language-override engine)', () => {
  it('interpolate fills {name} placeholders and leaves unknown params as-is', () => {
    expect(interpolate('第 {n} / {m} 条', { n: 3, m: 5 })).toBe('第 3 / 5 条')
    expect(interpolate('用时 {name}', { name: '1m30s' })).toBe('用时 1m30s')
    expect(interpolate('跳转到第 {n} 条消息', { n: 2, extra: 1 })).toBe('跳转到第 2 条消息')
  })

  it('interpolate without params returns the template verbatim', () => {
    expect(interpolate('刚刚')).toBe('刚刚')
    expect(interpolate('第 {n} 条')).toBe('第 {n} 条')
  })

  it('translateDict resolves known keys against the chosen dictionary, with params', () => {
    expect(translateDict(zh, 'pos.of', { n: 1, m: 2 })).toBe('第 1 / 2 条')
    expect(translateDict(en, 'pos.of', { n: 1, m: 2 })).toBe('Message 1 of 2')
    expect(translateDict(en, 'search.label')).toBe('Search messages')
  })

  it('pos.range renders the collapsed-summary message range', () => {
    expect(translateDict(zh, 'pos.range', { a: 4, b: 6, m: 23 })).toBe('第 4–6 / 23 条')
    expect(translateDict(en, 'pos.range', { a: 4, b: 6, m: 23 })).toBe('Messages 4–6 of 23')
  })

  it('list.loading renders the drain hint in both languages', () => {
    expect(translateDict(zh, 'list.loading')).toBe('正在加载更早消息…')
    expect(translateDict(en, 'list.loading')).toBe('Loading earlier messages…')
  })

  it('translateDict passes unknown keys through unchanged (harness-seat degradation)', () => {
    expect(translateDict(zh, 'no.such.key')).toBe('no.such.key')
    expect(translateDict(en, 'no.such.key', { n: 1 })).toBe('no.such.key')
  })
})
