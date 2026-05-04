# 小九中枢 UI 真实落地设计契约

> 目的：防止再出现“预览图是一套，真实页面是另一套”的货不对板。
> 这份契约优先级高于临时补丁。后续代码必须按它验收。

## 0. 这次失败的根因

我之前做错的不是“颜色没调好”，而是：

1. 把原版 Hermes UI 当成主体，只在外面换色、加面板。
2. 没有把预览图的信息架构迁进真实 app。
3. 原版 sidebar / 原版按钮 / 原版面板语言还大量保留，导致真实页面仍像 Hermes 原版。
4. 监控模块被做成了新增页面，但没有重建“小九中枢”的统一 Shell。
5. 虚拟人物 Presence 只是补进 ChatPanel 的一块区域，没有成为界面主结构。

所以用户说“乱七八糟”“货不对板”是准确的。

## 1. 预览图的真实设计承诺

以 `/tmp/xiaojiu-layout-v3.html` 和 `/tmp/xiaojiu-openroom-inspired-preview.html` 为准，真实 app 必须满足这些承诺：

### 1.1 整体不是原版后台，而是 Command Room

真实页面第一眼应该像：

- 私人 AI 中枢
- 硅基生命房间
- Agent Command Room
- 有小九在场的操作空间

不能像：

- Hermes 原版 sidebar + 普通内容页
- SaaS admin dashboard
- 简单 dark mode
- 普通监控面板

### 1.2 原版功能保留，但原版 UI 语言不保留

保留的是功能能力和路由，不是原版按钮样式。

必须保留能力：

- Chat
- History
- Group Chat
- Jobs
- Models
- Profiles
- Logs
- Usage
- Skills
- Memory
- Settings
- Gateways
- Channels
- Terminal
- Files

但它们在新 UI 里应该变成“小九中枢模块入口”，不是原版菜单按钮。

## 2. 必须替换 / 隐藏的原版 UI

### 2.1 必须替换

1. 原版 AppSidebar 的视觉语言
   - 不能只是改色。
   - 需要改成模块启动器 / command rail。
   - 原版按钮圆角、间距、hover、active 样式都不能直接保留。

2. 原版 ChatPanel 的页面结构
   - 不能再是左会话列表 + 中间普通聊天窗口的原版布局。
   - Chat 必须是“小九 Presence + 对话”的主舞台。

3. 原版内容容器
   - 不能保留普通灰黑卡片感。
   - 中间区域必须是 stage / cockpit / room，而不是普通 page container。

4. 原版按钮样式
   - 所有主导航、模块入口、发送按钮、快捷操作按钮，必须统一成中枢视觉系统。
   - 不允许出现一眼能看出是原版 Hermes 的按钮风格。

5. 原版默认空状态 / 标题语言
   - 文案要从“系统功能页面”转成“小九中枢模块”。

### 2.2 可以保留但必须包进新壳

这些逻辑可以保留，但外观和容器必须重做：

- 消息列表渲染逻辑
- 聊天输入发送逻辑
- 路由与 API store
- Jobs / Models / Memory / Terminal 等页面的业务逻辑
- 登录验证逻辑

### 2.3 暂时可以保留的东西

为了避免一次性重写导致功能坏掉，以下可短期保留：

- 业务组件内部复杂表单
- 表格数据结构
- 代码编辑器 / 日志列表 / terminal 的核心组件

但它们外层必须进入 CommandRoomShell，不能裸露成原版页面。

## 3. 正确的新架构

### 3.1 不再围绕 AppSidebar 打补丁

下一轮应该新增独立壳：

`CommandRoomShell.vue`

它负责：

- 全局背景
- 左侧模块启动器
- 中央舞台
- 右侧 Presence / 状态舱
- 底部快捷 Dock（可选）
- 当前模块状态

### 3.2 原 App.vue 只负责选择壳

登录页仍走 LoginView。
登录后所有 Hermes 功能进入 CommandRoomShell。

推荐结构：

```text
App.vue
└── AuthenticatedLayout / CommandRoomShell
    ├── CommandModuleRail.vue      左侧模块入口
    ├── CommandStage.vue           中央当前模块展开
    ├── XiaojiuPresenceDock.vue    右侧小九在场/状态
    └── CommandDock.vue            底部快捷入口，可选
```

### 3.3 中央舞台按模块切换

- Chat：虚拟人物 Presence + 正常聊天消息 + 输入框
- Monitor：高科技监控面板
- Jobs：任务队列舱
- Memory：记忆舱
- Models：模型核心舱
- Terminal：执行终端舱
- Settings：系统设置舱

不是把原版页面原样塞进去。

## 4. 视觉方向锁定

### 4.1 色彩

当前绿色/暗黑方向不对。预览图实际是冷蓝、青蓝、紫蓝、琥珀小点缀。

主色：

- 背景深空：`#030712`, `#02040B`, `#07101F`
- 面板玻璃：`rgba(8,15,29,.72)`, `rgba(12,22,42,.84)`
- 主发光青：`#63E7FF`
- 电蓝：`#4D8DFF`
- 柔紫：`#A98CFF`
- 少量琥珀：`#FFD37A`
- 正文：`#EDF7FF`
- 次级文字：`#B9C9DE`, `#7F90AA`

避免：

- 大面积绿色
- 普通 slate admin 色
- 默认 Hermes 灰色
- 低对比脏黑
- 随机 neon

### 4.2 材质

必须有：

- 深色空间背景
- 细网格/扫描线
- 玻璃面板
- 发光边框
- 小九 Presence 光环/轨道
- 模块卡片的层次阴影

不能只有：

- 普通 background-color
- 普通 border
- 普通 button hover

### 4.3 字体和密度

方向：

- 标题可以偏中枢感、字距拉开
- 数据/模块标签可用 monospace 风格
- 中文正文保持清晰，不要为了科技感牺牲可读性

## 5. 验收标准

每次实现后必须对照以下问题：

1. 截图第一眼还像不像 Hermes 原版？像就失败。
2. 是否能看到“小九在场”的明确视觉区域？没有就失败。
3. 左侧是不是模块启动器，而不是原版菜单按钮？不是就失败。
4. 中间是不是主舞台，而不是普通页面容器？不是就失败。
5. 右侧是不是状态 / Presence 舱，而不是随便加的侧栏？不是就失败。
6. 颜色是否接近预览图的冷蓝青紫科技感？不是就失败。
7. 原功能入口是否仍能到达？不能就失败。
8. 构建是否通过？不通过就失败。

## 6. 下一步重做原则

不要继续在当前 AppSidebar / ChatPanel 上乱补。

正确顺序：

1. 新建 CommandRoomShell 和设计 token。
2. 让登录后页面进入这个 shell。
3. 左侧做真正模块启动器，替代原版 sidebar 视觉。
4. 中间先只落地 Chat 主舞台，必须和 v3 预览接近。
5. 右侧做真正小九 Presence 舱，先用可替换人物资源。
6. 监控只是第二个模块，不再拿它冒充整体框架。
7. 每一步截图对照预览，不像就不继续堆功能。
