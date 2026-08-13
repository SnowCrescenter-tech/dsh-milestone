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
import { en, zh } from './locales'

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
