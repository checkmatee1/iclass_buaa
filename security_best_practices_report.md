# 安全检查报告

## 执行摘要

本次检查针对当前项目的 JavaScript/TypeScript、Electron、React/Vite 和 Node HTTP 服务进行只读审查。未发现受保护密钥文件被纳入本次检查范围，也未发现仓库源码中明文私钥或 API key。项目可以继续进行本机运行准备，但建议先处理 Electron 渲染进程权限和本地 API 暴露范围。

依赖审计已完成：根目录依赖树报告 `2 critical / 17 high / 2 moderate / 1 low`。主要来源是 Electron 30、electron-builder 24 及其构建链；这些依赖主要用于本地开发和打包，但当前版本仍应在后续升级窗口处理。

## 高风险

### SEC-001: Electron 渲染进程曾拥有 Node 权限（已修复）

位置：`main.js:36-43`

原配置启用了 `nodeIntegration: true`，同时设置 `contextIsolation: false`。这已改为 `nodeIntegration: false`、`contextIsolation: true`。

影响：本地桌面程序的权限边界基本失效。当前开发页面来自本项目，但该配置仍属于 Electron 不安全默认配置。

当前前端不需要 Node API，因此未增加 preload 桥接层。

## 中风险

### SEC-002: 本地 HTTP API 对所有来源开放 CORS（已修复）

位置：`server/src/routes/api.ts:32-36`

原服务返回 `Access-Control-Allow-Origin: *`，并支持 query string 传 token。现已限制为本项目的 `localhost:4000` / `127.0.0.1:4000` 来源，并停止从 query string 读取 token；客户端现有请求头认证流程不受影响。

影响：本机浏览器环境中的跨站调用边界较弱。该问题不等同于远程互联网暴露，因为服务日志显示目标是 `127.0.0.1`，但仍会影响同一台机器上的浏览器会话。

仍可后续增加请求体大小限制和会话过期时间。

## 未完成检查

- Electron 二进制安装因证书链错误失败；未关闭 TLS 校验绕过该问题。
- 客户端 lint、客户端构建和服务端构建已通过；Electron 桌面窗口尚未启动验证。

## 结论

项目没有发现阻止本机运行的恶意内容或明文凭据。SEC-001 和 SEC-002 已修复；剩余主要风险是依赖审计报告中的已知漏洞，以及本机 Electron 二进制下载的证书链问题。
