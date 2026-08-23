# Release Checklist (dsh-milestone)

发布流程清单。**每一步都在发布前核对**，历史事故已固化进对应条目，不得再犯。

## 0. 预备（每次发布前）

- [ ] 工作区干净：`git status` 无未提交/未跟踪杂物（`test-results/`、`.dsh-qa/`、`.pnpm-store/` 均在 .gitignore）。
- [ ] 全部门禁：`pnpm typecheck` 0 错误；`pnpm test` 全量绿；`pnpm build` 成功。
- [ ] `npm publish --dry-run` 检查 **Tarball Contents**：
  - **必须有 `README.md`、`LICENSE`、`lib/client.js`、`lib/index.js`、`cordis.patch.yml`、`assets/*.svg`**。
  - ⚠️ 事故记录（2026-08）：`files` 白名单漏了 `assets/`，导致 npm 页面上 README 的 logo/demo 图片 404。凡是 README 引用的相对路径资源，必须出现在 Tarball Contents 里。

## 1. 版本号

- [ ] `package.json` `version` 依语义化版本递增（patch 修 bug / minor 加功能；`0.x` 阶段同理）。
- [ ] `pnpm install --no-frozen-lockfile`（CI 模式需 `$env:CI='true'` + `--no-frozen-lockfile`）同步 lockfile 的根版本字段。
- [ ] `pnpm build` 后 `Select-String lib\client.js -Pattern '<新版本号>'` 确认构建期注入版本生效（tsdown define `__DSH_MILESTONE_VERSION__`）。

## 2. npm 发布

- [ ] `npm publish`（prepublishOnly 自动重新构建）。
- [ ] 发布后反向验证：`node -e "fetch('https://registry.npmjs.org/dsh-milestone').then(r=>r.json()).then(j=>console.log(j['dist-tags']))"` 确认 `latest` 已更新。
- [ ] ⚠️ 同一版本号**不可覆盖重发**（npm 规则）——发错了只能升号再发。

## 3. GitHub 推送

- [ ] `git push origin dev`；`git push origin dev:main`（main 与 dev 在发布点保持一致，仓库惯例）。
- [ ] `git tag -a vX.Y.Z -m "X.Y.Z"`（沿用 annotated tag 惯例）+ `git push origin vX.Y.Z`。

## 4. GitHub Release（⚠️ 编码事故高发区，必须按本流程）

⚠️ 事故记录（2026-08）：Release 正文中文经 PowerShell 命令行内联字符串传递时被系统代码页（GBK）解读，发布出去全是乱码。**铁律：非 ASCII 正文绝不放进 `pwsh -Command` 的字符串字面量里。**

- [ ] 用 write 工具（UTF-8）写正文到 `release-body-vX.Y.Z.md`。
- [ ] PowerShell 读取必须**纯字符串化**：`$body = [string](Get-Content 'release-body-vX.Y.Z.md' -Raw -Encoding UTF8)`
  - ⚠️ 事故记录：不带 `[string]` 强转时 `Get-Content -Raw` 携带 `PSPath/PSParentPath/...` 注记属性，`ConvertTo-Json` 会把它们序列化进 body 导致 GitHub 422。
- [ ] 提交用**显式 UTF-8 字节**：`$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)`，Header 带 `'Content-Type' = 'application/json; charset=utf-8'`。
- [ ] 创建后**必须回读验证**：取返回的 `body`，断言「替换符 `0xFFFF` 数量 = 0」且正文头部含预期中文片段；不通过立即 DELETE 重来（DELETE `/repos/.../releases/{id}` 不删 tag）。

## 5. 收尾

- [ ] 删除临时 `release-body-vX.Y.Z.md`（或视为已提交产物，二选一，别留垃圾在树上）。
- [ ] 告知使用者：3080 GUI 若为 link 安装，重新 `pnpm build` 即生效；npm 安装者 `dsh plugin --profile web update dsh-milestone`。