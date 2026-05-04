# 小九中枢 UI 重做策略

> 原则：不再在原版 UI 上继续贴皮。先重建 Shell，再把原功能模块接进去。

## 目标

把真实 app 从“原版 Hermes 改色”改成“小九中枢 Command Room”。

## 不再继续的方向

停止这些做法：

1. 继续 patch AppSidebar 的颜色。
2. 继续给 ChatPanel 外面套一层小区域。
3. 继续新增单独 Monitor 页面来假装中枢完成。
4. 继续保留原版按钮/菜单的视觉语言。
5. 继续边想边乱补。

## 正确实施路径

### Step 1：新增真正的 CommandRoomShell

新增目录：

`packages/client/src/components/command-room/`

组件：

- `CommandRoomShell.vue`
- `CommandModuleRail.vue`
- `CommandStageFrame.vue`
- `XiaojiuPresenceDock.vue`
- `CommandDock.vue`（可选）
- `command-room.tokens.scss` 或在组件内先定义 CSS variables

CommandRoomShell 替代 App.vue 里原先的：

- AppSidebar
- app-main 原生容器
- SystemRail

### Step 2：先实现壳，不碰业务逻辑

Shell 内仍使用 `<router-view />` 渲染原路由组件。

但 router-view 外面必须包进新的 stage frame。

### Step 3：左侧重做模块启动器

左侧不再使用原 AppSidebar。

它应该是：

- 顶部小九中枢身份
- 模块分组：交互核心 / 能力模块 / 系统接口
- 每个入口是 command module chip/card
- active 状态是 cyan glow，不是原版 selected button
- 入口点击仍跳转原路由

必须覆盖全部原功能：

Chat, History, Group Chat, Jobs, Monitor, Models, Profiles, Skills, Memory, Terminal, Files, Logs, Usage, Gateways, Channels, Settings。

### Step 4：右侧重做 Presence 舱

右侧不是普通快捷栏。

它应该包含：

- 小九 Presence 状态
- 可替换人物/头像区域
- 当前模型/Provider
- 当前模块状态
- 子系统简短状态

先用 CSS + 头像/PRESENCE 形态也可以，但整体要像预览图右侧角色舱。

### Step 5：Chat 页面重做为主舞台

Chat route 的内容必须接近 `/tmp/xiaojiu-layout-v3.html`：

- 上方/左侧大 Presence 区
- 下方/右侧正常消息列表和输入框
- 输入框仍能发送
- 消息列表仍能滚动
- 会话历史入口不能变成原版左侧列表突兀出现；需要后续做抽屉或模块化

### Step 6：颜色统一为预览图色系

全局 Command Room token：

- --xr-bg: #030712
- --xr-bg-deep: #02040B
- --xr-bg-soft: #07101F
- --xr-panel: rgba(8, 15, 29, .72)
- --xr-panel-strong: rgba(12, 22, 42, .86)
- --xr-line: rgba(99, 231, 255, .24)
- --xr-line-soft: rgba(255, 255, 255, .08)
- --xr-cyan: #63E7FF
- --xr-blue: #4D8DFF
- --xr-violet: #A98CFF
- --xr-amber: #FFD37A
- --xr-text: #EDF7FF
- --xr-soft: #B9C9DE
- --xr-muted: #7F90AA

禁止再用大面积 green。

## 第一轮可交付范围

为了避免再次失控，第一轮只做这些：

1. 新增 CommandRoomShell。
2. App.vue 改为登录后使用 CommandRoomShell。
3. 新增 CommandModuleRail 替代 AppSidebar。
4. 新增 XiaojiuPresenceDock 替代当前 SystemRail。
5. 用新色系统一全局壳。
6. 暂时把原 router-view 包在 CommandStageFrame 中，保证所有功能还可达。
7. 构建通过。

第一轮先不要深改每个业务页面内部。

## 第二轮再做

1. Chat 页面内部彻底重做。
2. 监控页按新 stage 视觉重写。
3. Jobs/Models/Memory/Terminal 逐个做“模块舱”外观。
4. 加 OpenRoom 人物资源替换 CSS 占位。
5. 做截图验收。

## 验收方式

每轮结束必须：

1. `npm run build`
2. 检查 `git diff --stat`
3. 启动/重启 fork 服务
4. 打开真实页面截图
5. 对照 `/tmp/xiaojiu-layout-v3.html`

如果登录 token 阻挡真实页面，必须明确说看不到内部页面，不能声称视觉已验收。
