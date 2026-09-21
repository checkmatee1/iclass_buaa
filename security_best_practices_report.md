# 安全检查报告

## 执行摘要

本次检查针对当前项目的 JavaScript/TypeScript、Electron、React/Vite 和 Node HTTP 服务进行只读审查。未发现受保护密钥文件被纳入本次检查范围，也未发现仓库源码中明文私钥或 API key。项目可以继续进行本机运行准备，但建议先处理 Electron 渲染进程权限和本地 API 暴露范围。

依赖在线审计未完成：`npm audit --package-lock-only --audit-level=high` 因当前环境无法连接配置的代理 `127.0.0.1:7891` 失败，因此不能据此声称依赖没有已知漏洞。

## 高风险

### SEC-001: Electron 渲染进程拥有 Node 权限

位置：`main.js:36-43`

当前配置启用了 `nodeIntegration: true`，同时设置 `contextIsolation: false`。如果加载的前端页面、远程响应或第三方依赖出现可利用的脚本注入，攻击者可能从渲染进程直接调用 Node API，读取本机文件或执行系统命令。

影响：本地桌面程序的权限边界基本失效。当前开发页面来自本项目，但该配置仍属于 Electron 不安全默认配置。

建议：改为 `nodeIntegration: false`、`contextIsolation: true`，并通过最小化的 preload API 暴露必要能力。若当前前端不需要 Node API，可以直接移除 Node 集成。

## 中风险

### SEC-002: 本地 HTTP API 对所有来源开放 CORS

位置：`server/src/routes/api.ts:32-36`

服务返回 `Access-Control-Allow-Origin: *`，且绑定到端口后可被本机其他网页访问。会话 token 存储在浏览器 `localStorage`，并且部分接口支持 query string 传 token（`server/src/routes/api.ts:82-94`）。恶意网页若诱导用户访问，可能尝试读取或调用本地服务；query token 还可能进入浏览器历史、日志或其他泄露渠道。

影响：本机浏览器环境中的跨站调用边界较弱。该问题不等同于远程互联网暴露，因为服务日志显示目标是 `127.0.0.1`，但仍会影响同一台机器上的浏览器会话。

建议：开发环境仅允许 `http://localhost:4000` 和 `http://127.0.0.1:4000`；移除 query string token 支持，仅接受请求头；为请求体增加大小限制，并考虑为会话设置过期时间。

## 未完成检查

- NPM 在线漏洞审计因网络代理不可达而失败，需在网络可用后重新运行 `npm audit`。
- 未执行依赖安装、构建或应用启动，因此本报告不代表运行时行为已经验证。

## 结论

项目没有发现阻止本机运行的恶意内容或明文凭据，但当前 Electron 安全配置不适合作为长期默认配置。若仅在本机运行，建议至少先修复 `SEC-001`；本地 API 的 CORS 和 token 传递方式可作为第二步修复。
