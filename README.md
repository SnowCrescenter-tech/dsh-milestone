<div align="center">

<img src="https://raw.githubusercontent.com/SnowCrescenter-tech/dsh-milestone/main/assets/logo.svg" alt="dsh-milestone" width="112">

# dsh-milestone

**DeepSeek Harness 的会话里程碑导航条**

像 Git 提交图一样，一眼定位每一次提问，一键跳转到任何位置。

<p>
  <a href="https://www.npmjs.com/package/dsh-milestone"><img src="https://img.shields.io/npm/v/dsh-milestone?color=2563eb" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/dsh-milestone"><img src="https://img.shields.io/npm/dm/dsh-milestone" alt="npm downloads"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/dsh-milestone" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-2563eb" alt="dsh-plugin"></a>
</p>

</div>

> **English:** A Git-style milestone timeline for the DeepSeek Harness web UI — one dot per user message, hover for content and metadata (time, turn, duration, TTFT, tokens), click to jump anywhere, and collapse the whole rail into a draggable floating ball. Full-session list, in-session & cross-session search, `#msg=` deep-link bookmarks, keyboard navigation. Install: `dsh plugin --profile demo add dsh-milestone`.

---

## 为什么需要它？

- 上百轮对话之后，想找回「第 17 轮那个提问」？只能不停往上翻，在代码块和思考过程里大海捞针。
- 右侧挂一条**圆点时间线**：一个提问一个圆点，悬停看内容，点击瞬间跳转——长对话的「导航地图」。
- 官方 slot 机制挂载，不修改 harness 源码，装完即用。

<img src="https://raw.githubusercontent.com/SnowCrescenter-tech/dsh-milestone/main/assets/demo.svg" alt="dsh-milestone 效果示意图" width="100%">

## 快速开始

```sh
# 从 npm 安装（推荐）
dsh plugin --profile demo add dsh-milestone

# 或从 GitHub 源码安装
dsh plugin --profile demo add "github:SnowCrescenter-tech/dsh-milestone#main"

# 启动 Web UI
npx @deepseek-ai/dsh web    # → http://127.0.0.1:3080
```

打开一个**多轮对话**（至少 2 条提问），会话视图右侧就会出现里程碑条。

> 要求 Node.js `>= 24`（harness 官方要求）。

## 功能详解

### 圆点时间线

每个提问一个圆点，点击平滑跳转；悬停即看内容与元信息。圆点等距排列、不随对话长度变形，颜色由浅入深标出先后，同 Git 提交图。滚轮可在里程碑条上直接滑动选点，视口内最近的提问亮起白环。

### 折叠为悬浮球

一键把整条时间线收成一颗半透明悬浮球：**点击**展开，**拖动**可把它放到屏幕任意角落（拖动时不触发展开），松手即记住位置，刷新或下次会话仍在。设置里可选「**固定** / **可拖动**」，也可一键重置位置——右侧被其它面板（如 dsh-better-sidebar、explorer）占用时，把它拖到顺手的地方即可。

### 全部提问列表

一键打开面板，序号 + 轮次 + 预览一次看全，点击任意一条直接跳转。列表直接来自**整个会话的投影**，不用手动翻页——对藏在最早期的消息来说，比在小圆点上逐个找快得多。

### 站内搜索

搜索框过滤圆点，匹配的是**完整消息内容**（不是 80 字摘要）且覆盖**整个会话**（不受对话当前加载窗口限制），实时显示命中数 N/M。`Enter` 跳到下一个匹配，`Esc` 一键清空。

### 跨会话搜索

一键搜索**所有会话**的消息内容（harness 原生索引），点击命中结果直接打开对应会话。

### 收藏书签与深链接

悬停圆点点星收藏，刷新后仍在（按会话持久化），顶部「★」一键只看收藏。跳转时 URL 自动带上 `#msg=` 锚点，刷新或分享后仍回到同一条消息。

### 悬停元信息

时间 · 轮次 · 用时 · 结束原因 · TTFT · tok/s · 模型 · 用途 · token 用量，一张卡片看全。数据来自插件自注册的**会话投影**，零额外依赖：

```
┌──────────────────────────────────────────┐
│ 第 3 / 5 条 · 第 2 轮         ☆ 复制 ✂    │  ← 序号 + 轮次 + 收藏/复制/fork
│ 帮我优化这段代码的性能                     │  ← 消息预览（前 80 字）
│ 5 分钟前 · 用时 1m30s · 首字 1.2s · 12.4 tok/s │  ← 时间 · 耗时 · TTFT · 吞吐
│ v4 · continue · 1280 / 2560 tok           │  ← 模型 · 用途 · token 用量
└──────────────────────────────────────────┘
```

### 更多效率功能

- **键盘导航**：`↑↓` 移动 · `Enter` 跳转 · `Home/End` 首尾，全程不用鼠标。
- **turn 分组折叠**：长轮次折成一条，汇总圆点带可见 ×N 徽标，一眼知道藏着几条。
- **折叠为悬浮球**：整条时间线收成可拖动的小球，位置记忆、可固定可拖动。
- **复制与 fork**：一键复制提问全文 / 从此处分支。
- **聚焦模式**：淡化 / 折叠思考与工具调用，强度可调、自由搭配。
- **折叠工具栏**：功能键默认收起，常用键可钉到折叠外；搜索 / 列表等浮层点击外部自动关闭。
- **个性化**：强调色 / 圆点大小 / 距侧边距离 / 左右位置即调即存；中文 / English 一键切换。

## 工作原理

双半边浏览器插件（空 node half + `shell.overlay` slot 挂载的 client half），零侵入：

```
shell.overlay (root scope)
  └─ milestone.rail (session scope, 自声明子槽)
       └─ useProjection('milestone.messages') → 圆点列表 + 悬停 + 跳转
```

- **注入点**：`shell.overlay` 全框架浮动层，附加式、点击穿透，不碰现有 UI。
- **数据源**：插件自注册的 `milestone.messages` **会话投影**——host 端对完整事件日志做 fold（`turn/start` / `user/message` / `assistant/chunk` / `assistant/message` / `turn/end`），client 端经 `useProjection` 读取整会话的消息与每轮元数据；圆点列表与站内搜索覆盖**整个会话**，与 DOM 当前加载窗口无关。
- **跳转**：以消息锚点做 DOM 定位，`scrollIntoView` 平滑滚动。
- **分页**：顶部「···」按需把更早的对话载入 DOM（跳转 / 深链接定位所需）；提问列表本身来自投影，无需逐页加载。
- **持久化**：书签、工具栏偏好与悬浮球位置经 `store.persist` 写入 localStorage。
- **纯函数分层**：过滤、位置计算、圆点状态、悬浮球几何集中在纯函数层（`rail-logic.ts` / `ball-position.ts`），单测覆盖。

## 版本与兼容

- 当前官方支持线：**`0.1.5-rc.1`**（与 `@deepseek-ai/dsh` 最新 `latest` / `next` 标签一致）。
- peer/dev 范围为收紧的 `>=0.1.5-rc.1 <0.3.0-0`（`dsh-client-locale` / `dsh-client-store` / `dsh-client-ui-slots`）：依赖解析到旧线时会得到明确的 ERESOLVE，而不是静默错配。
- 0.1.5 起流式时序内嵌在 `assistant/message` / `assistant/attempt` 的紧凑 `stream` 中（独立的 `assistant/chunk` 事件已移除），TTFT 由官方 `assistantStreamFirstTokenTime` 读取；`TokenUsage` 字段更名为 `inputTokens`/`outputTokens`/`totalTokens` 并拆分缓存计数，插件的 `input` 显示为三项之和（缓存计入），保持旧的「提示词 token」含义。
- 会话数据自 0.1.2 起改经**会话投影**提供（插件注册 `milestone.messages`，client 端 `useProjection` 读取）；`defineStore` 由 `@deepseek-ai/dsh-client-store` 提供。
- 已知上游打包缺陷：`@deepseek-ai/dsh-client-store@0.1.5-rc.1` 的 `lib/index.js` 运行时引用 `zustand`/`immer`，清单却把它们放在 `devDependencies` 未声明为依赖——导入该模块即报 `Cannot find package 'zustand'`。本仓库用 pnpm `packageExtensions` 兜底补全（见 `pnpm-workspace.yaml`）。
- harness 当前版本在浏览器端没有可信来源（`host.describe().version` 是占位值），因此不做精确探测，以插件声明的支持线为准。

## 已知限制

> ⚠️ 圆点列表与站内搜索现由**会话投影**驱动，覆盖**整个会话**，与 DOM 加载窗口无关；但**跳转**到很早的消息仍需先把该消息载入 DOM，插件会自动触发加载再定位。

<details>
<summary>查看更多已知限制（点击展开）</summary>

- TTFT / tok/s 依赖 turn 位置数据，未完成的 turn 不显示（自动隐藏）。
- 徽章的瞬态状态（运行中 / 等待输入）只点亮最新一条提问。
- 书签按会话隔离，不跨会话共享。
- fork 从选中消息所在轮次开始分支，不会自动打开子会话（需在会话列表手动打开）。
- 深链接目标若早于已加载窗口，会先自动加载更早历史再定位；受加载上限约束，极端深的历史可能定位失败。
- 跨会话搜索仅返回片段（≤240 字符）、最多 20 条结果，命中过多时请细化关键词。

</details>

## 更新日志

<details>
<summary>v0.7.0 / v0.6.6 / v0.6.5 / v0.6.4（点击展开）</summary>

**v0.7.0** · 跟随官方 0.1.5（会话投影数据层）· 折叠为可拖动悬浮球（issue #4）· 447 项测试

- **跟随官方 0.1.5**：会话数据由插件自注册的 `milestone.messages` 投影提供——host 端对完整事件日志 fold，client 端 `useProjection` 读取；圆点列表与站内搜索覆盖**整个会话**，与 DOM 加载窗口解耦。TTFT 改从结算事件内嵌的紧凑 `stream` 读取（独立的 `assistant/chunk` 已移除），`TokenUsage` 字段更名并计入缓存；peer 收紧到 `0.1.5-rc.1` 线，移除 `dsh-client-runtime` 依赖（含 `dsh.client.inject`）。
- **折叠为悬浮球（issue #4）**：里程碑条可一键收成半透明悬浮球，自由拖到屏幕任意位置；点击展开、拖动移动（拖动与点击互斥），位置按 localStorage 记忆；设置里可选「固定 / 可拖动」并一键重置位置。

> [GitHub Release v0.7.0](https://github.com/SnowCrescenter-tech/dsh-milestone/releases/tag/v0.7.0)

**v0.6.6** · 全部提问列表自动加载整个会话 · 折叠圆点 ×N 徽标 · 轮次连续显示 · 397 项测试

- **全部提问列表一次看全**：打开时自动加载整个会话的历史，不再受初始加载窗口限制，点击任意一条直达。
- **折叠轮次不藏消息**：汇总圆点带可见 ×N 计数徽标，悬停气泡显示覆盖的条数区间（第 a–b / m 条）。
- **轮次编号连续化**：显示轮号按圆点顺序重编号（1、2、3…），不再跳空或重复；分组与折叠逻辑不变。
- **列表点击外部自动关闭**：与搜索、跨会话搜索浮层同一套外部点击关闭契约。
- README 重写为产品宣传结构：演示图第一屏，功能介绍分组清晰。

> [GitHub Release v0.6.6](https://github.com/SnowCrescenter-tech/dsh-milestone/releases/tag/v0.6.6)

**v0.6.5** · 新手教程改为锚定真实组件的教练气泡引导，设置模态对比度修复 · 近 400 项测试

> [GitHub Release v0.6.5](https://github.com/SnowCrescenter-tech/dsh-milestone/releases/tag/v0.6.5)

**v0.6.4** · 首次使用引导：4 步双语教学 + 内置演示，印象即写、关页不重弹

> [GitHub Release v0.6.4](https://github.com/SnowCrescenter-tech/dsh-milestone/releases/tag/v0.6.4)

更早版本见 [GitHub Releases](https://github.com/SnowCrescenter-tech/dsh-milestone/releases)。

</details>

## License

[MIT](./LICENSE)

---

<p align="center">
  如果它帮你省下了一次翻找，欢迎给个 Star，或推荐给同样在 DeepSeek Harness 里长聊的开发者。
</p>
