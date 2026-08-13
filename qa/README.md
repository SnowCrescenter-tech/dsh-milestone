# Surface QA (Playwright)

Playwright specs under `qa/` drive the **real harness web shell** in a real
browser, verifying the milestone rail against the actual running app — not
stubs. Use this when a change touches how the plugin behaves inside the
harness (slot mounting, layout, clicks, scroll jumps).

## Prerequisites

- Node.js >= 24 (harness official requirement)
- The plugin built and installed into a harness profile:

```sh
# 1. Build the plugin (emits lib/index.js + lib/client.js)
pnpm build

# 2. Install into a profile (uses the current profile by default)
dsh plugin --profile demo add dsh-milestone

# 3. Start the web UI
npx @deepseek-ai/dsh web   # → http://127.0.0.1:3080
```

## Run

```sh
pnpm test:surface          # = playwright test (testDir: qa/, baseURL http://127.0.0.1:3080)
```

Point your own browser at http://127.0.0.1:3080, open a conversation with at
least 2 user messages, and the milestone rail should appear on the right edge.

## Notes

- The harness must be running before `pnpm test:surface` — the config does not
  spawn a web server (the plugin cannot be exercised without the host app).
- `qa/` is deliberately outside `tsconfig.json`'s `include` (only `src`) and
  outside tsdown's explicit entries, so surface specs never leak into
  `pnpm typecheck` or `pnpm build`.
- Browser binaries: `npx playwright install chromium` if the first run
  complains about a missing browser.
