# 小九中枢前端项目边界

- 本项目是小九专属中枢前端：`~/Desktop/小九ui前端`
- 前端端口：`9599`
- BFF 后端端口：`9601`
- 原版 Hermes Web UI 目录：`~/Desktop/hermes-web-ui-main`
- 原版目录只允许作为参考/上游对照，不允许直接混改。
- 修改 UI、资源、路由、布局前，先确认当前工作目录和运行进程属于 `~/Desktop/小九ui前端`。

检查命令：

```bash
lsof -nP -iTCP:9599 -sTCP:LISTEN
lsof -nP -iTCP:9601 -sTCP:LISTEN
```
