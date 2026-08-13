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
- **固定间距** —— 圆点**等距排列**，不随对话长度挤压变形，永远点得准。
- **蓝色渐变** —— 最新最深、最早最浅，一眼看清提问的先后顺序，像 Git 提交图。
- **滚轮滑动** —— 长会话圆点超出可视区时，鼠标在里程碑条上滚轮即可滑动选点。
- **丰富悬停** —— 悬停展示消息预览、相对时间、第 N 轮、用时、结束原因、首字延迟(TTFT)、tokens/秒。
- **零侵入** —— 官方 slot 机制挂载，不修改 harness 源码，装完即用。

## 悬停能看到什么

```
┌─────────────────────────────────────────┐
│ 第 3 / 5 条 · 第 2 轮                     │  ← 序号 + 轮次
│ 帮我优化这段代码的性能                    │  ← 消息预览（前 80 字）
│ 5 分钟前 · 用时 1m30s · 首字 1.2s · 12.4 tok/s │  ← 时间 · 耗时 · TTFT · 吞吐
└─────────────────────────────────────────┘
```

元信息全部来自 harness 原生的 session 快照（`turnTimings` / `timeline.turns` / `turn-tail`），无额外依赖。

## 快速开始

```sh
# 安装插件到某个 profile
dsh plugin --profile demo add dsh-milestone

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
- **数据源**：`chat.order` + `chat.nodes`（user 消息）+ `chat.timeline`（turn 元数据）。
- **跳转**：DOM 锚点 `data-chat-anchor-key`，`scrollIntoView` 平滑定位。

## 已知限制

- 仅覆盖当前已加载的消息窗口（初始 50 条，向上滚动分页会自动补圆点）。
- TTFT / tokens/秒 依赖 turn 位置数据，窗口外或未完成的 turn 不显示（自动隐藏）。

## License

[MIT](./LICENSE)

---

<p align="center">
  觉得好用？给个 star 支持一下，或把它推荐给正在 DeepSeek Harness 里挣扎的开发者吧。
</p>
