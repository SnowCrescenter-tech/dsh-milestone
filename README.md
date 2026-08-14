<div align="center">

<img src="./assets/logo.svg" alt="dsh-milestone" width="112">

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

---

## 为什么需要它？

和 AI 聊了上百轮之后，想找回**第 17 轮那个提问**？你只能不停滚轮往上翻，眼睛在一堆代码块、工具调用和思考过程里大海捞针。

**dsh-milestone** 在会话右侧挂一条**圆点时间线**——每一条提问对应一个圆点，鼠标悬停看内容，点击瞬间跳转。长对话的"导航地图"。

<img src="./assets/demo.svg" alt="dsh-milestone 效果示意图" width="100%">

## 好用在哪？

- **一键定位** —— 点击任意圆点，平滑滚动到那条消息，不用再手动翻几百行。
- **站内搜索** —— 搜索框过滤圆点，匹配的是**完整消息内容**（不是 80 字摘要），实时显示命中数 N/M，回车跳到下一个匹配，Esc 一键清空。
- **当前位置高亮** —— 滚动会话时，离你视口最近的那条提问会亮起白环，永远知道「读到哪了」。
- **加载更早** —— 历史没加载完时，顶部出现「···」按钮，点一下继续加载，并提示当前已显示多少条。
- **收藏书签** —— 悬停任意圆点可点星收藏，刷新后仍保留；顶部「★」一键只看收藏，把一次性跳转变反复回访。
- **键盘导航** —— 里程碑条是一个焦点组件：↑↓ 移动、回车跳转、Home/End 首尾，全程不用鼠标。
- **状态徽章** —— 圆点自动标出轮次健康状态：出错红环、达到上限黄环、重试橙环、运行中/等待输入蓝/黄脉冲。
- **固定间距** —— 圆点**等距排列**，不随对话长度挤压变形，永远点得准。
- **蓝色渐变** —— 最新最深、最早最浅，一眼看清提问的先后顺序，像 Git 提交图。
- **滚轮滑动** —— 长会话圆点超出可视区时，鼠标在里程碑条上滚轮即可滑动选点。
- **丰富悬停** —— 悬停展示消息预览、相对时间、第 N 轮、用时、结束原因、首字延迟(TTFT)、tokens/秒。
- **模型与用量** —— 悬停直接看这一轮用的哪个模型、输入/输出 token 数，调试成本一目了然。
- **turn 分组折叠** —— 圆点按轮次分组，一眼看清对话章节；长轮次可折叠成一条，减少干扰。
- **复制与 fork** —— 悬停一键复制该条提问全文，或「从此处 fork」开一个分支会话。
- **中英双语** —— 跟随 harness 界面语言自动切换中英文。
- **聚焦模式** —— 一键淡化 AI 的思考(thinking)区块，对话正文更清爽；悬停或展开时自动恢复。
- **全部提问列表** —— 顶部展开面板，一次看全所有提问（序号 + 轮次 + 预览），点击即跳，长对话不再靠圆点一个个数。
- **深链接** —— 跳转时 URL 带上 `#msg=` 锚点，刷新或分享链接后直接回到同一条消息。
- **跨会话搜索** —— 一键搜索**所有会话**的消息内容（harness 原生索引），点击结果直接打开对应会话。
- **零侵入** —— 官方 slot 机制挂载，不修改 harness 源码，装完即用。

## 悬停能看到什么

```
┌─────────────────────────────────────────┐
│ 第 3 / 5 条 · 第 2 轮          ☆ 复制 ✂   │  ← 序号 + 轮次 + 收藏/复制/fork 动作
│ 帮我优化这段代码的性能                    │  ← 消息预览（前 80 字）
│ 5 分钟前 · 用时 1m30s · 首字 1.2s · 12.4 tok/s │  ← 时间 · 耗时 · TTFT · 吞吐
│ v4 · continue · 1280 / 2560 tok          │  ← 模型 · 用途 · token 用量
└─────────────────────────────────────────┘
```

元信息全部来自 harness 原生的 session 快照（`turnTimings` / `timeline.turns` / `turn-tail`），无额外依赖。

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

## 它是什么做的？

双半边浏览器插件（空 node half + `shell.overlay` slot 挂载的 client half）：

```
shell.overlay (root scope)
  └─ milestone.rail (session scope, 自声明子槽)
       └─ useSession 读取会话快照 → 圆点列表 + 悬停 + 跳转
```

- **注入点**：`shell.overlay` —— 全框架浮动层，附加式、点击穿透，不影响任何现有 UI。
- **数据源**：`chat.order` + `chat.nodes`（user 消息 + `turn-error`/`turn-max-tokens`/`model-retry` 节点）+ `chat.timeline`（turn 元数据）+ `hasMore`/`loadingOlder`（分页）+ `running`/`pending`（徽章）+ `loadOlder`（inject face）。
- **书签持久化**：harness `store.persist`（每会话 localStorage，key `dsh-milestone.bookmarks.<sessionId>`），经 `defineStore` 引擎读写。
- **跳转**：DOM 锚点 `data-chat-anchor-key`，`scrollIntoView` 平滑定位。
- **纯函数**：搜索过滤 / 位置计算 / 圆点状态都在 `rail-logic.ts` 纯函数里，单测覆盖。

## 已知限制

- 搜索范围 = 当前已加载的消息窗口（初始 50 条；点顶部「···」加载更早，更早的历史需先加载进来才能被搜到）。
- TTFT / tokens/秒 依赖 turn 位置数据，窗口外或未完成的 turn 不显示（自动隐藏）。
- 徽章的瞬态状态（运行中/等待输入）只点亮**最新一条可见提问**——若运行中/等待输入的轮次其提问在窗口外，则无脉冲。
- 书签按**会话**隔离（不跨会话共享）。
- 模型 / token 用量依赖该轮 assistant 节点的元数据，部分场景下缺失则自动隐藏该行。
- fork 从选中消息所在轮次开始分支，不会自动打开子会话（需在会话列表手动打开）。
- 深链接的目标消息若早于已加载窗口，会先自动加载更早历史再定位（受加载上限约束，极端深的历史可能定位失败）。
- 跨会话搜索依赖 harness 的消息内容索引（`session.search`），仅返回片段（≤240 字符）、最多 20 条结果；命中过多时请细化关键词。
- 聚焦模式作用于当前会话视图的思考区块，不会影响其他插件或工具的展示。
- 尚无全局快捷键聚焦里程碑条（需 Tab 键切换到）。

## License

[MIT](./LICENSE)

---

<p align="center">
  觉得好用？给个 star 支持一下，或把它推荐给正在 DeepSeek Harness 里挣扎的开发者吧。
</p>
