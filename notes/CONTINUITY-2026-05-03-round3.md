# 小九中枢前端 - 第三轮完成状态（2026-05-03）

## 当前进度
第三轮（round3）全部完成，共 4 项，全部构建通过。

## 项目概况

| 项目 | 路径 |
|------|------|
| 真实目录 | `~/Desktop/小九ui前端/` |
| 工作 symlink | `/tmp/xiaojiu-ui` → ~/Desktop/小九ui前端/ |
| Dev 端口 | vite :9599 / server :9601 |
| 原版 Hermes | `~/Desktop/hermes-webui-main/`（不动） |
| 访问 URL | http://localhost:9599/hermes/chat |

## 构建命令
```bash
cd /tmp/xiaojiu-ui
npx vue-tsc -b    # 类型检查
npm run build     # 构建
```

---

## 已完成项

### 1. ⌘K 指令面板（round3-cmdk）✅
- **新建文件**：
  - `src/composables/useCommandPalette.ts` — 全局单例 isOpen/open/close/toggle
  - `src/components/command-room/CommandPalette.vue` — 完整玻璃面板组件
- **修改文件**：
  - `composables/useKeyboard.ts` — ⌘K 改挂 CommandPalette，原会话搜索迁到 ⌘P
  - `App.vue` — NNotificationProvider 内渲染 \<CommandPalette />
  - `CommandStageFrame.vue` — 顶栏新增 ⌘K 触发按钮
- **功能**：四组（导航/会话/模型/系统），↑↓ Enter Esc 全键盘流
- **交互入口**：快捷键 ⌘K/Ctrl+K + 顶栏按钮

### 2. Monitor hero 去重复（round3-cockpit）✅
- **修改文件**：`src/views/hermes/MonitorView.vue`
- **改动**：
  - 删了 hero 区的 eyebrow/h1/subtitle（Stage 顶栏已有）
  - 删了 mission-strip 的 Core Link/Active Model（重复）
  - 替换成 Monitor 独有的 Tasks/Memory/Uptime
  - 删了 modelLabel/providerLabel computed（unused）
  - hero 颜色从绿色 rgba(34,197,94) 统一到青蓝 #63e7ff

### 3. Rail 分组折叠（round3-rail）✅
- **修改文件**：`src/components/command-room/CommandModuleRail.vue`
- **改动**：
  - group-tag 从 span 改成可点 button
  - 新增 collapsed ref（Set），持久化到 localStorage `xiaojiu.rail.collapsed.v1`
  - 新增 activeGroupKey computed，当前所在组永不折叠
  - caret ▾/▸ 切换动画
  - 添加完整 .group-body / .module-group.collapsed / .group-caret 等样式

### 4. Presence 舱精修（round3-presence）✅
- **修改文件**：`src/components/command-room/XiaojiuPresenceDock.vue`
- **新增**：
  - bubbleCopy computed：根据 presenceState 生成人话气泡文案
    - thinking：「让我想想…」/「让我查一下 xxx…」
    - loading：「同步一下会话哈」
    - offline：「链路断了，我先离线」
    - error：「刚才那步出错了，看一眼」
    - 默认 chat 页：「我在，说吧」
  - 角色气泡浮层（.character-bubble），带 <transition> 渐入渐出
- **样式**：
  - 对话气泡：深蓝玻璃面板 + 左下角小三角
  - thinking → 紫色边（#c4b5fd）+ 紫点快闪
  - error → 琥珀边（#fde68a）+ 黄点
  - offline → 灰边 + 灰点不动
  - 默认 → 青蓝边
- video object-position → center 8%（脸不被裁）
- 折叠状态自动隐藏气泡

---

## 本轮新建文件汇总
| 文件 | 大小 |
|------|------|
| `src/composables/useCommandPalette.ts` | 510 字节 |
| `src/components/command-room/CommandPalette.vue` | ~14KB |

## 本轮修改文件汇总
| 文件 | 改动 |
|------|------|
| `views/hermes/MonitorView.vue` | hero 去重 + 绿色→青蓝 + 删 unused computed |
| `components/command-room/CommandModuleRail.vue` | 分组折叠交互 + localStorage 持久化 |
| `components/command-room/XiaojiuPresenceDock.vue` | 角色气泡 + video 位置微调 |
| `composables/useKeyboard.ts` | ⌘K→CommandPalette，⌘P→SessionSearch |
| `App.vue` | 渲染 CommandPalette |
| `components/command-room/CommandStageFrame.vue` | 顶栏 ⌘K 触发按钮 |

---

## 验收清单（浏览器 http://localhost:9599）
- [ ] ⌘K 是否弹出四组面板，键盘流是否顺
- [ ] Monitor 顶栏标题是否只剩一份（没有重复 hero 标题）
- [ ] 左侧 Rail 分组标题点一下能否折叠/展开
- [ ] 折叠的组是否在刷新后保持（localStorage）
- [ ] 当前所在组是否不可折叠
- [ ] Chat 页人物旁边是否浮出对话气泡
- [ ] 气泡是否随状态变化（thinking/error/offline 对应不同颜色）
- [ ] 折叠 Presence 舱后气泡是否隐藏

---

## 下一步方向（待林燚决定）
- 第四轮可选方向：
  - 登录页 / 欢迎页设计
  - Memory 页视觉强化
  - Jobs / Logs 页深度改造
  - 移动端响应式
  - 主题系统（深色/浅色）
  - Settings 页整合
