/**
 * UI strings for the milestone rail, keyed flat (single-language-per-key,
 * no nesting) so the later i18n threading stays a mechanical
 * `value.replace('{name}', n)` substitution.
 *
 * `zh` is the source of truth and the key registry: it byte-matches the
 * current hardcoded output of MilestoneRail / MilestoneRailTooltip /
 * MilestoneRailSearch exactly (each `{n}`/`{m}`/`{name}` slot stands in for
 * the interpolated number or label), so swapping in these templates is
 * behavior-preserving. `en` is typed `Record<MilestoneKey, string>` so a
 * missing English translation is a compile error, not a runtime miss.
 */
export const zh = {
  /** aria-label on each dot: `跳转到第 ${i + 1} 条消息`. */
  'jump.to': '跳转到第 {n} 条消息',
  /** Load-older coverage hint: `已显示 {marks.length} 条 · 还有更早`. */
  'window.hint': '已显示 {n} 条 · 还有更早',
  /** Hover turn badge: `第 ${mark.turn} 轮`. */
  'turn.label': '第 {n} 轮',
  /** Hover position: `第 {hover.index + 1} / {hover.total} 条`. */
  'pos.of': '第 {n} / {m} 条',
  /** Search input placeholder. */
  'search.placeholder': '搜索消息内容',
  /** aria-label on the search toggle button and the search input. */
  'search.label': '搜索消息',
  /** aria-label on the bookmarks-only filter toggle. */
  'bookmark.filter': '只看收藏',
  /** aria-label + title on the focus-mode toggle when focus is OFF (arm it). */
  'focus.on': '聚焦模式',
  /** aria-label + title on the focus-mode toggle when focus is ON (disarm it). */
  'focus.off': '退出聚焦',
  /** aria-label on the hover tooltip star toggle. */
  'bookmark.star': '收藏此消息',
  /** aria-label on the search clear button. */
  'search.clear': '清空搜索',
  /** title + aria-label on the load-older `···` button. */
  'load.older': '加载更早消息',
  /** aria-label on the rail root. */
  'rail.label': '会话里程碑',
  /** aria-label on the dot list. */
  'rail.list': '会话里程碑列表',
  /** Hover preview fallback for empty message text. */
  'no.text': '（无文本）',
  /** Relative time: `< 60s`. */
  'time.justNow': '刚刚',
  /** Relative time: `< 1h`. */
  'time.minutes': '{n} 分钟前',
  /** Relative time: `< 1d`. */
  'time.hours': '{n} 小时前',
  /** Relative time: `>= 1d`. */
  'time.days': '{n} 天前',
  /** Hover duration: `用时 {durationLabel}`. */
  'duration.label': '用时 {name}',
  /** Hover TTFT: `首字 {ttftLabel}`. */
  'ttft.label': '首字 {name}',
  /** TurnEndReason `completed`. */
  'reason.completed': '已完成',
  /** TurnEndReason `aborted`. */
  'reason.aborted': '已中止',
  /** TurnEndReason `error`. */
  'reason.error': '出错',
  /** TurnEndReason `max-tokens`. */
  'reason.maxTokens': '达到上限',
  /** TurnEndReason `interrupted`. */
  'reason.interrupted': '已中断',
  /** TurnEndReason `blocked`. */
  'reason.blocked': '已阻塞',
  /** Copy-message tooltip action. */
  'copy.message': '复制消息',
  /** Fork-from-here tooltip action. */
  'fork.here': '从此处 fork',
  /** Collapse-turn tooltip action. */
  'collapse.turn': '折叠此轮',
  /** Expand-turn tooltip action. */
  'expand.turn': '展开此轮',
  /** aria-label + title on the milestone-list toggle when the panel is CLOSED. */
  'list.open': '打开列表',
  /** aria-label + title on the milestone-list toggle when the panel is OPEN. */
  'list.close': '收起列表',
  /** Header title of the all-prompts list panel. */
  'list.label': '全部提问',
  /** Header title + input placeholder of the cross-session search panel. */
  'search.cross': '跨会话搜索',
  /** aria-label + title on the cross-session search toggle when the panel is CLOSED. */
  'search.cross.open': '打开跨会话搜索',
  /** aria-label + title on the cross-session search toggle when the panel is OPEN. */
  'search.cross.close': '收起跨会话搜索',
  /** Cross-session result row title fallback for sessions with no display title. */
  'search.untitled': '（无标题）',
  /** Cross-session search failure notice. */
  'search.error': '搜索失败，请重试',
  /** Cross-session search footer hint when the harness capped the result list. */
  'search.more': '结果已截断，请细化关键词',
  /** aria-label on the toolbar expand arrow while the toolbar is COLLAPSED (expand it). */
  'toolbar.expand': '展开工具栏',
  /** aria-label on the toolbar expand arrow while the toolbar is EXPANDED (collapse it). */
  'toolbar.collapse': '收起工具栏',
  /** aria-label on the toolbar settings gear while the settings menu is CLOSED. */
  'toolbar.settings.open': '打开设置',
  /** aria-label on the toolbar settings gear while the settings menu is OPEN. */
  'toolbar.settings.close': '关闭设置',
  /** Header title of the toolbar settings menu. */
  'settings.title': '设置',
  /** Per-feature toggle label inside the settings menu: keep visible while collapsed. */
  'settings.pin': '在折叠外显示',
  /** Settings: feature-section hint explaining what the pin switch does. */
  'settings.pin.hint': '开启后，工具栏折叠时该功能仍显示在箭头旁',
  /** Settings action that clears every pinned feature. */
  'settings.reset': '恢复默认',
  /** Settings footer heading above the project links. */
  'settings.support': '支持我们',
  /** Settings footer link: the GitHub repository. */
  'settings.repo': 'GitHub 仓库',
  /** Settings footer link: star the repository. */
  'settings.star': '欢迎 Star ★',
  /** Settings footer link: file an issue. */
  'settings.issues': '提交 Issue',
  /** Settings footer link: the npm install channel. */
  'settings.npm': 'npm 安装渠道',
  /** Settings: feature-row name of the settings key itself (registry row). */
  'settings.label': '设置',
  /** aria-label on the settings modal close button. */
  'settings.close': '关闭',
  /** Settings modal: section heading for the feature pin rows. */
  'settings.section.features': '功能与快捷区',
  /** Settings modal: section heading for the personalization controls. */
  'settings.section.personal': '个性化',
  /** Settings modal: section heading for the focus-mode controls (0.6.3). */
  'settings.section.focus': '聚焦',
  /** Settings: personalization-section hint shown inside the expanded block. */
  'settings.personal.hint': '圆点、强调色与位置，即调即存',
  /** Settings: aria-label on the personalization block toggle while COLLAPSED. */
  'settings.personal.expand': '展开个性化设置',
  /** Settings: aria-label on the personalization block toggle while EXPANDED. */
  'settings.personal.collapse': '收起个性化设置',
  /** Settings: live value summary on the collapsed personalization header. */
  'settings.personal.summary': '{accent} · 图标 {icon}px · {side}',
  /** Settings: hover description — in-rail search. */
  'settings.desc.search': '按完整消息内容过滤并跳转到对应消息',
  /** Settings: hover description — all-prompts list. */
  'settings.desc.list': '本会话全部提问一览',
  /** Settings: hover description — cross-session search. */
  'settings.desc.sessionSearch': '跨会话搜索所有会话',
  /** Settings: hover description — bookmarks filter. */
  'settings.desc.bookmarks': '只显示已收藏的消息',
  /** Settings: hover description — focus mode. */
  'settings.desc.focus': '淡化 AI 思考块，阅读更清爽',
  /** Settings: hover description — update check. */
  'settings.desc.updateCheck': '检查 npm 是否有新版本',
  /** Settings: hover description — the settings key itself. */
  'settings.desc.settings': '自定义工具栏与外观',
  /** Settings personalization: accent color row label. */
  'settings.accent': '强调色',
  /** Settings personalization: custom color swatch label. */
  'settings.custom': '自定义',
  /** Settings personalization: icon/dot size slider label. */
  'settings.iconSize': '图标 / 圆点大小',
  /** Settings personalization: edge-distance slider label. */
  'settings.inset': '距侧边距离',
  /** Settings personalization: rail side row label. */
  'settings.side': '位置',
  /** Settings personalization: side radio — hug the left edge. */
  'settings.side.left': '左侧',
  /** Settings personalization: side radio — hug the right edge. */
  'settings.side.right': '右侧',
  /** Settings: focus block — hint shown inside the expanded block. */
  'settings.focus.hint': '这些选项自由组合成你的「聚焦搭配」；总开关仍是工具栏的眼睛按钮',
  /** Settings: aria-label on the focus block toggle while COLLAPSED. */
  'settings.focus.expand': '展开聚焦设置',
  /** Settings: aria-label on the focus block toggle while EXPANDED. */
  'settings.focus.collapse': '收起聚焦设置',
  /** Settings: focus option — dim the think reasoning disclosures. */
  'settings.focus.dimThink': '淡化 think 推理区',
  /** Settings: focus option — dim the tool-call cards. */
  'settings.focus.dimTools': '淡化工具调用卡片',
  /** Settings: focus option — compress think disclosures to a hover strip. */
  'settings.focus.collapseThink': '折叠 think',
  /** Settings: focus option — dim strength slider label. */
  'settings.focus.opacity': '淡化强度',
  /** Settings: live value summary on the collapsed focus header. */
  'settings.focus.summary': '{opts} · 强度 {opacity}%',
  /** Settings: focus summary — short label for the think-dim option. */
  'settings.focus.summary.think': 'think 淡化',
  /** Settings: focus summary — short label for the tool-dim option. */
  'settings.focus.summary.tools': '工具淡化',
  /** Settings: focus summary — short label for the think-collapse option. */
  'settings.focus.summary.collapse': '折叠 think',
  /** Settings: focus summary — placeholder when every option is off. */
  'settings.focus.summary.none': '未启用',
  /** B4 update-check: toolbar button label + title/aria-label. */
  'update.check': '检查更新',
  /** B4 update-check: popover title. */
  'update.title': '更新检测',
  /** B4 update-check: installed-version row label. */
  'update.current': '当前版本',
  /** B4 update-check: newest-published-version row label. */
  'update.latest': '最新版本',
  /** B4 update-check: conclusion when the installed version is current. */
  'update.upToDate': '已是最新版本',
  /** B4 update-check: conclusion when a newer version exists. */
  'update.available': '发现新版本',
  /** B4 update-check: link text for the npm upgrade channel. */
  'update.goNpm': '去 npm 升级',
  /** B4 update-check: supported-host-lines metadata row label. */
  'update.hostLines': '已适配官方版本线',
  /** B4 update-check: in-flight state of the manual check button. */
  'update.checking': '检查中…',
  /** B4 update-check: failed state heading. */
  'update.failed': '检查失败',
  /** B4 update-check: retry action inside the failed state. */
  'update.retry': '重试',
  /** Settings modal section title: language. */
  'settings.language': '语言',
  /** Language option: follow the harness UI language. */
  'settings.lang.system': '跟随系统',
  /** Language option: force Chinese copy. */
  'settings.lang.zh': '中文',
  /** Language option: force English copy. */
  'settings.lang.en': 'English',
  /** 0.6.4 onboarding: welcome title (also the tutorial dialog's aria-label). */
  'onboarding.welcome.title': '欢迎使用 dsh-milestone',
  /** 0.6.4 onboarding: one-line positioning statement on the welcome page. */
  'onboarding.welcome.subtitle': '一条附着在会话侧边的里程碑导航：悬停圆点看元信息，点击跳到任意提问。',
  /** 0.6.4 onboarding: primary action on the welcome page → step 1. */
  'onboarding.start': '开始引导',
  /** 0.6.4 onboarding: skip action — persists the flag and closes, on EVERY page. */
  'onboarding.skip': '跳过',
  /** 0.6.4 onboarding: step-page progress text `第 n / 4 步`. */
  'onboarding.step.label': '第 {n} / 4 步',
  /** 0.6.4 onboarding: aria-label on one progress dot. */
  'onboarding.step.short': '第 {n} 步',
  /** 0.6.4 onboarding: step-page back navigation. */
  'onboarding.prev': '上一步',
  /** 0.6.4 onboarding: step-page forward navigation (steps 1–3). */
  'onboarding.next': '下一步',
  /** 0.6.4 onboarding: step-4 primary action — persists the flag and closes. */
  'onboarding.finish': '开始使用',
  /** 0.6.4 onboarding: step 1 title — the dot timeline. */
  'onboarding.step1.title': '圆点时间线',
  /** 0.6.4 onboarding: step 1 line 1. */
  'onboarding.step1.desc1': '每条提问在侧边对应一个圆点，自上而下按时间排列。',
  /** 0.6.4 onboarding: step 1 line 2. */
  'onboarding.step1.desc2': '悬停圆点，查看该轮元信息（用时、首字、模型与 Token）。',
  /** 0.6.4 onboarding: step 1 line 3. */
  'onboarding.step1.desc3': '点击任意圆点，会话立即跳到那条提问。',
  /** 0.6.4 onboarding: step 2 title — in-rail search & bookmarks. */
  'onboarding.step2.title': '搜索与收藏',
  /** 0.6.4 onboarding: step 2 line 1. */
  'onboarding.step2.desc1': '输入关键词过滤圆点，只点亮匹配项并显示 N / M 计数；Enter 逐个跳转，Esc 关闭。',
  /** 0.6.4 onboarding: step 2 line 2. */
  'onboarding.step2.desc2': '星标收藏重要消息，再用「只看收藏」一键过滤。',
  /** 0.6.4 onboarding: step 3 title — personalization & settings. */
  'onboarding.step3.title': '个性化与设置',
  /** 0.6.4 onboarding: step 3 line 1. */
  'onboarding.step3.desc1': '调整强调色、圆点大小、距边距离与左右位置，即调即存。',
  /** 0.6.4 onboarding: step 3 line 2. */
  'onboarding.step3.desc2': '切换界面语言、搭配「聚焦」效果，或把常用功能 pin 在折叠外。',
  /** 0.6.4 onboarding: step 4 title — update detection & support. */
  'onboarding.step4.title': '更新检测与支持',
  /** 0.6.4 onboarding: step 4 line 1. */
  'onboarding.step4.desc1': '挂载后自动检查 npm 新版本；有新版本时工具栏会亮起提示。',
  /** 0.6.4 onboarding: step 4 line 2. */
  'onboarding.step4.desc2': '喜欢这个插件？欢迎 Star、提交 Issue，或通过 npm 安装升级。',
  /** 0.6.4 onboarding demo: fake message 1 (step 1 dots / step 2 corpus). */
  'onboarding.demo.m1': '帮我优化这段代码',
  /** 0.6.4 onboarding demo: fake message 2. */
  'onboarding.demo.m2': '解释这个报错',
  /** 0.6.4 onboarding demo: fake message 3. */
  'onboarding.demo.m3': '再检查边界条件',
  /** 0.6.4 onboarding demo: fake message 4. */
  'onboarding.demo.m4': '写个单元测试',
  /** 0.6.4 onboarding demo: fake message 5. */
  'onboarding.demo.m5': '总结一下方案',
  /** 0.6.4 onboarding demo (step 1): hint under the toy dot rail. */
  'onboarding.demo.hoverHint': '试试悬停与点击圆点',
  /** 0.6.4 onboarding demo (step 2): hint under the toy search/favorite. */
  'onboarding.demo.searchHint': '试试输入「报错」，或点星标切换只看收藏',
  /** 0.6.4 onboarding demo (step 3): the 展开箭头 → 齿轮 → 设置 path hint. */
  'onboarding.demo.settingsPath': '展开箭头 → 齿轮 → 设置',
  /** 0.6.4 onboarding demo (step 3): legend label for the focus mix. */
  'onboarding.demo.focusMix': '聚焦搭配',
  /** 0.6.4 onboarding demo (step 3): legend label for pinning features. */
  'onboarding.demo.pin': 'pin 固定',
  /** 0.6.4 settings footer action: replay the tutorial. */
  'onboarding.reopen': '重新查看教程',
} as const

export type MilestoneKey = keyof typeof zh

export const en: Record<MilestoneKey, string> = {
  'jump.to': 'Jump to message {n}',
  'window.hint': 'Showing {n} messages · more below',
  'turn.label': 'Turn {n}',
  'pos.of': 'Message {n} of {m}',
  'search.placeholder': 'Search message content',
  'search.label': 'Search messages',
  'bookmark.filter': 'Bookmarks only',
  'focus.on': 'Focus mode',
  'focus.off': 'Exit focus',
  'bookmark.star': 'Bookmark this message',
  'search.clear': 'Clear search',
  'load.older': 'Load older messages',
  'rail.label': 'Session milestones',
  'rail.list': 'Session milestone list',
  'no.text': '(no text)',
  'time.justNow': 'Just now',
  'time.minutes': '{n} minutes ago',
  'time.hours': '{n} hours ago',
  'time.days': '{n} days ago',
  'duration.label': 'Duration {name}',
  'ttft.label': 'First token {name}',
  'reason.completed': 'Completed',
  'reason.aborted': 'Aborted',
  'reason.error': 'Error',
  'reason.maxTokens': 'Max tokens reached',
  'reason.interrupted': 'Interrupted',
  'reason.blocked': 'Blocked',
  'copy.message': 'Copy message',
  'fork.here': 'Fork from here',
  'collapse.turn': 'Collapse turn',
  'expand.turn': 'Expand turn',
  'list.open': 'Open list',
  'list.close': 'Close list',
  'list.label': 'All prompts',
  'search.cross': 'Cross-session search',
  'search.cross.open': 'Open cross-session search',
  'search.cross.close': 'Close cross-session search',
  'search.untitled': '(untitled)',
  'search.error': 'Search failed, retry',
  'search.more': 'Results truncated — refine your query',
  'toolbar.expand': 'Expand toolbar',
  'toolbar.collapse': 'Collapse toolbar',
  'toolbar.settings.open': 'Open settings',
  'toolbar.settings.close': 'Close settings',
  'settings.title': 'Settings',
  'settings.pin': 'Show outside collapse',
  'settings.pin.hint': 'When on, the feature stays beside the arrow while the toolbar is folded',
  'settings.reset': 'Restore defaults',
  'settings.support': 'Support us',
  'settings.repo': 'GitHub repo',
  'settings.star': 'Give us a Star ★',
  'settings.issues': 'Report an Issue',
  'settings.npm': 'Install via npm',
  'settings.label': 'Settings',
  'settings.close': 'Close',
  'settings.section.features': 'Features & Shortcuts',
  'settings.section.personal': 'Personalization',
  'settings.section.focus': 'Focus',
  'settings.personal.hint': 'Dot size, accent color, and position — saved as you adjust',
  'settings.personal.expand': 'Expand personalization',
  'settings.personal.collapse': 'Collapse personalization',
  'settings.personal.summary': '{accent} · Icon {icon}px · {side}',
  'settings.desc.search': 'Filter by full message text and jump to the match',
  'settings.desc.list': 'Overview of every prompt in this session',
  'settings.desc.sessionSearch': 'Search across all sessions',
  'settings.desc.bookmarks': 'Show bookmarked messages only',
  'settings.desc.focus': 'Dim AI thinking blocks for a cleaner read',
  'settings.desc.updateCheck': 'Check npm for a newer release',
  'settings.desc.settings': 'Customize the toolbar and appearance',
  'settings.accent': 'Accent color',
  'settings.custom': 'Custom',
  'settings.iconSize': 'Icon / dot size',
  'settings.inset': 'Distance from the edge',
  'settings.side': 'Position',
  'settings.side.left': 'Left',
  'settings.side.right': 'Right',
  'settings.focus.hint': 'Combine these options into your own focus recipe; the eye button on the toolbar stays the master switch',
  'settings.focus.expand': 'Expand focus settings',
  'settings.focus.collapse': 'Collapse focus settings',
  'settings.focus.dimThink': 'Dim think reasoning',
  'settings.focus.dimTools': 'Dim tool call cards',
  'settings.focus.collapseThink': 'Collapse think',
  'settings.focus.opacity': 'Dim strength',
  'settings.focus.summary': '{opts} · Strength {opacity}%',
  'settings.focus.summary.think': 'Think dim',
  'settings.focus.summary.tools': 'Tools dim',
  'settings.focus.summary.collapse': 'Think collapse',
  'settings.focus.summary.none': 'Off',
  'update.check': 'Check updates',
  'update.title': 'Update check',
  'update.current': 'Current version',
  'update.latest': 'Latest version',
  'update.upToDate': 'You are up to date',
  'update.available': 'Update available',
  'update.goNpm': 'Upgrade on npm',
  'update.hostLines': 'Supported official version lines',
  'update.checking': 'Checking…',
  'update.failed': 'Check failed',
  'update.retry': 'Retry',
  'settings.language': 'Language',
  'settings.lang.system': 'Follow system',
  'settings.lang.zh': 'Chinese',
  'settings.lang.en': 'English',
  'onboarding.welcome.title': 'Welcome to dsh-milestone',
  'onboarding.welcome.subtitle': 'A milestone rail beside your conversation: hover a dot for metadata, click any dot to jump.',
  'onboarding.start': 'Start the tour',
  'onboarding.skip': 'Skip',
  'onboarding.step.label': 'Step {n} of 4',
  'onboarding.step.short': 'Step {n}',
  'onboarding.prev': 'Back',
  'onboarding.next': 'Next',
  'onboarding.finish': 'Get started',
  'onboarding.step1.title': 'The dot timeline',
  'onboarding.step1.desc1': 'Every prompt is a dot on the side rail, listed top to bottom in time order.',
  'onboarding.step1.desc2': 'Hover a dot to see that turn’s metadata (duration, first token, model, tokens).',
  'onboarding.step1.desc3': 'Click any dot to jump the conversation straight to that prompt.',
  'onboarding.step2.title': 'Search & bookmarks',
  'onboarding.step2.desc1': 'Type to filter the dots — matches light up with an N / M counter; Enter jumps, Esc closes.',
  'onboarding.step2.desc2': 'Star a message to bookmark it, then use “Bookmarks only” to filter.',
  'onboarding.step3.title': 'Personalize & settings',
  'onboarding.step3.desc1': 'Tune the accent color, dot size, edge distance, and left/right side — saved as you adjust.',
  'onboarding.step3.desc2': 'Switch the UI language, compose your focus effect, or pin features outside the collapse.',
  'onboarding.step4.title': 'Updates & support',
  'onboarding.step4.desc1': 'A silent check runs after mount; when a new version exists, the toolbar shows a hint.',
  'onboarding.step4.desc2': 'Enjoying the plugin? Star us, file an issue, or upgrade via npm.',
  'onboarding.demo.m1': 'Help me optimize this code',
  'onboarding.demo.m2': 'Explain this error',
  'onboarding.demo.m3': 'Check the edge cases again',
  'onboarding.demo.m4': 'Write a unit test',
  'onboarding.demo.m5': 'Summarize the plan',
  'onboarding.demo.hoverHint': 'Try hovering and clicking the dots',
  'onboarding.demo.searchHint': 'Try typing “error”, or tap the star for bookmarks-only',
  'onboarding.demo.settingsPath': 'Expand arrow → gear → Settings',
  'onboarding.demo.focusMix': 'Focus mix',
  'onboarding.demo.pin': 'Pin keys',
  'onboarding.reopen': 'Replay the tour',
}

/**
 * Interpolate `{name}` placeholders with params, matching the harness t seat's
 * substitution shape; an unknown parameter leaves the placeholder verbatim.
 */
export function interpolate(
  template: string,
  params?: Record<string, unknown>,
): string {
  if (params === undefined) return template
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (slot, name: string) =>
    name in params ? String(params[name]) : slot,
  )
}

/**
 * Dictionary-backed translate for the forced-language override (locale prefs
 * 'zh' / 'en'): resolves a key against the plugin's own dictionaries with
 * placeholder interpolation; unknown keys pass through unchanged (same
 * degradation as the harness seat).
 */
export function translateDict(
  dict: Readonly<Record<MilestoneKey, string>>,
  key: string,
  params?: Record<string, unknown>,
): string {
  const template = dict[key as MilestoneKey]
  return template === undefined ? key : interpolate(template, params)
}
