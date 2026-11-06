# iClass 与 Hermes 访问隔离

用户要求：iClass 网页及阿里云公网链路不能成为 Hermes 的访问入口。

## 应用内限制

- OCR 仅接受固定 Docker 内部地址 `http://captcha-ocr:8000/ocr`，其他地址直接拒绝，HTTP 重定向也拒绝。
- 网页 CSP 限制脚本与网络连接为本站，禁止 frame/object，限制表单、图片和字体来源。
- iClass 前端、后端、OCR 容器均无主机目录挂载；不接入 Hermes、用户主目录或 Docker socket。

## Mac mini 宿主防护

维护源：`/Users/checkmate/Library/Application Support/CheckmateContainerSecurity/refresh-host-guard.py` 和同目录 `host-guard-image/guard.sh`。

保留原管理端口防护；增加 `CM-HERMES-ISOLATE` 链，阻断 iClass 网段访问 Mac mini 宿主地址的所有协议。此规则不依赖 Hermes 端口号，覆盖 Hermes 重启后的端口变化。防护容器启动即安装当前网段基线规则，原有本机刷新任务每 30 秒跟踪网段、宿主地址及 Hermes gateway_state.json 指定进程的监听端口。

其他容器对 Hermes 动态 TCP 端口的拦截随 30 秒刷新更新，不能将其描述为所有容器在所有重启场景下均无刷新窗口。iClass 当前网段的全宿主阻断不依赖此动态端口刷新。

新防护镜像：`checkmate-mac-host-guard:hermes-isolation-20261106`；运行容器名保持 `checkmate-mac-host-guard`，host 网络、NET_ADMIN、只读根文件系统、no-new-privileges，自动重启。旧容器已停止并保留为 `checkmate-mac-host-guard-before-hermes-20261106`。维护源旧文件以 `.before-hermes-isolation-20261106` 后缀备份。

旧 Hermes dashboard 启动项 `gui/502/local.hermes.dashboard` 已禁用。Hermes 本机 HTTP 接口保留回环监听，私有 Unix socket 权限保持 0600；不改本机 Hermes 交互能力。

## 阿里云链路

只读核查实际 Nginx include 链和 Mac mini 正在运行的 SSH 转发，未发现 Hermes 代理或转发。iClass 实际反向隧道为阿里云 `127.0.0.1:23001` 到 Mac mini `127.0.0.1:4000`。本次未修改阿里云站点、DNS 或 SSH 管理入口。

## 2026-11-06 验证

- iClass 后端连接 `host.docker.internal`、`host.orb.internal`、Mac mini 局域网地址的 Hermes 端口均被阻断。
- Docker 内部 OCR 健康接口 200；后台自动签到 running/authenticated=true，needsHumanVerification=false，lastError=null。
- 首页、index.html、API 健康响应均带同源 CSP；Nginx 配置检查和前后端镜像构建通过。
- Hermes 本机健康接口 200；socket 权限 0600。
- 阿里云本机 Hermes 对应端口 49944、9119、43817 无监听；iClass 上游 23001 的健康接口和 CSP 正常。
- 候选域名 bh.xjcpp.love 公网请求返回 404，未用它作为隔离验证依据，未更改其配置。

## 回滚

应用侧可在功能分支上回退本次安全提交后重建前后端。宿主侧恢复上述两个维护源备份，停止新防护容器并恢复保留的旧容器。新增隔离链不会因容器停止自动消失，回滚时须明确移除其 DOCKER-USER 跳转及专用链；不要清空全部防火墙规则。旧 dashboard 保持禁用，除非用户明确要求重新开放。
