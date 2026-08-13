# dsh-milestone

会话里程碑导航条（DeepSeek Harness 插件）。在会话视图右侧渲染一条 **固定间距的圆点时间线**（类似 git 提交图），每个 **user 发言** 对应一个蓝色渐变圆点：悬停显示时间/轮次/耗时/原因/首字延迟等元信息，点击平滑跳转，长会话可滚轮滑动选点。

> **dsh-plugin** · 适配 DeepSeek Harness (`deepseek-ai/deepseek-harness`) Web UI。

## 功能

- **固定间距圆点**：每条真实 user 消息 = 一个圆点，**等距排列**（不随对话长度等比缩放），方便点击。
- **蓝色渐变**：圆点按先后渐变（最新最深 → 最早最浅），一眼区分新旧，类似 git 提交图。
- **滚轮滑动**：长会话圆点超出可视区时，鼠标在里程碑条上滚轮即可滑动选点。
- **丰富悬停**：hover 显示消息预览 + 相对时间 + 第 N/M 条 + 第 N 轮 + 用时 + 结束原因 + 首字延迟(TTFT) + tokens/秒。
- **点击跳转**：点击圆点平滑滚动到对应消息（`scrollIntoView`）。
- 少于 2 条 user 消息时不渲染（无导航价值）。

## 安装

```sh
# 本地目录（开发）
dsh plugin --profile demo add ./dsh-milestone

# npm 包（发布后）
dsh plugin --profile demo add dsh-milestone

# GitHub 仓库（需 prepare 脚本 + allowBuilds 许可）
dsh plugin --profile demo add github:you/dsh-milestone
```

然后 `npx @deepseek-ai/dsh web` 启动 Web UI 即可看到右侧里程碑条。

## 开发

要求 **Node.js `>= 24`**（官方 harness 要求 `^22.19 || >=24`，本仓库已验证 `24.19.0`）。依赖从 npm 安装（`0.1.0-rc.6` 系列，完整可用）。

```sh
pnpm install
pnpm run build       # 产出 lib/index.js (node half) + lib/client.js (browser half)
pnpm exec tsc --noEmit   # 类型检查
pnpm run watch       # 监听构建
```

构建产物：`lib/index.js`（node half，空 apply）+ `lib/client.js`（browser half，CJS closure，`window.__ModuleLoader__.load` banner）。

### 架构

双半边插件（Host = Node 进程，Client = 浏览器）：

```
src/index.ts            node half —— 空 apply，让插件进入 host cordis 配置树
src/client/index.ts     browser half —— 两个 slot 注册
src/client/MilestoneOverlay.tsx  shell.overlay entry（root scope）
                                   └─ 声明 session 子槽 milestone.rail
                                   └─ 通过 SessionProvider 桥接到会话区
src/client/MilestoneRail.tsx      milestone.rail entry（session scope）
                                   └─ useSession 读取会话快照
                                   └─ DOM 锚点定位 + tick 渲染 + 跳转
```

关键机制：

- **注入点**：`shell.overlay`（`kind: 'list'`，`scope: 'root'`）——全框架浮动层，附加式、点击穿透，是"悬浮 rail"的唯一正确位置。
- **会话数据**：通过声明 session-scope 子槽 `milestone.rail`，框架自动注入 `SessionProvider`（`PropsRenderSlots` 从子槽 scope 推导），rail 组件因此拿到 `useSession` / `sessionId`。
- **圆点列表**：`useSession(s => s.chat.order)` + `s.chat.nodes.get(key)` 过滤 `kind === 'user'`，取节点 `key`（DOM 锚点）与 `location.turn`。
- **悬停元数据**：`s.chat.timeline.turns.get(turn)` 提供 turn 起止时间/状态/结束原因；`turn.data.get('turn-tail')` 提供 TTFT 与 tokens/秒（ui-conversation 发布的 location data）。
- **跳转**：DOM 锚点 `data-chat-anchor-key`（节点 key = `13:input-message<messageId>`），scrollport 为 `[data-conversation-scroll]`。

## 已知限制

- 仅覆盖当前已加载的消息窗口（harness 初始加载最近 50 条事件，向上滚动触发 `loadOlder` 分页）；rail 会随分页自动更新，但更早的消息需要先滚动加载。
- preview 从消息 `content` 文本块提取，长消息截断为 80 字。
- TTFT / tokens/秒 依赖 turn-tail 位置数据，窗口外或未完成的 turn 不会显示（自动隐藏）。
- 尚未实现"当前定位"高亮（P1，已有蓝色渐变区分先后）。

## License

MIT
