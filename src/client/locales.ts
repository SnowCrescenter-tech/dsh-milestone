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
  'settings.reset': 'Restore defaults',
  'settings.support': 'Support us',
  'settings.repo': 'GitHub repo',
  'settings.star': 'Give us a Star ★',
  'settings.issues': 'Report an Issue',
  'settings.npm': 'Install via npm',
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
}
