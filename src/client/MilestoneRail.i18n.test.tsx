/**
 * C1 i18n threading tests: MilestoneRail (and its tooltip/search chrome)
 * resolve every UI string through the `t` prop, so an English `t` over the
 * `en` dictionary flips the copy, while the default zh `t` keeps the original
 * Chinese byte-identical (the existing zh-string assertions across the suite
 * prove the byte-match; this file pins the two ends of the seam).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderRail } from '../test/renderRail.tsx'
import type { RailUser } from '../test/renderRail.tsx'
import { en } from './locales.ts'

const USERS: RailUser[] = [
  { key: '13:user<i18n-1>', seq: 1, time: 1_700_000_000_000, text: '第一条消息' },
  { key: '13:user<i18n-2>', seq: 2, time: 1_700_000_060_000, text: '第二条消息' },
]

/** Locale interpreter over a dictionary (mirrors renderRail's makeT). */
function makeT(dict: Record<string, string>) {
  return (key: string, params?: Record<string, string | number>) => {
    const tpl = dict[key] ?? key
    return params ? tpl.replace(/\{(\w+)\}/g, (slot, name) => (name in params ? String(params[name]) : slot)) : tpl
  }
}

/** The dot list's aria-label (`data-rail-list`). */
function railListLabel(): string | null {
  return document.querySelector('[data-rail-list]')?.getAttribute('aria-label') ?? null
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MilestoneRail locale threading (C1)', () => {
  it('with an en `t`: the rail list and dot labels resolve to English', () => {
    renderRail(USERS, { t: makeT(en as Record<string, string>) })

    expect(railListLabel()).toBe('Session milestone list')
    expect(screen.getByRole('button', { name: 'Jump to message 1' })).toBeInTheDocument()
  })

  it('with the default zh `t`: the rail list and dot labels keep the Chinese copy', () => {
    renderRail(USERS)

    expect(railListLabel()).toBe('会话里程碑列表')
    expect(screen.getByRole('button', { name: '跳转到第 1 条消息' })).toBeInTheDocument()
  })

  it('with an en `t`: the search toggle and bookmark filter resolve to English', () => {
    renderRail(USERS, { t: makeT(en as Record<string, string>) })

    expect(screen.getByRole('button', { name: 'Search messages' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bookmarks only' })).toBeInTheDocument()
  })
})
