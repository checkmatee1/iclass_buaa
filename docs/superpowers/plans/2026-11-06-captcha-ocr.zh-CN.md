# 本地验证码自动识别实施计划

目标：默认登录和后台重新认证遇到图片验证码时自动识别并继续。
设计：../specs/2026-11-06-captcha-ocr-design.md
架构：Node 后端调用 Docker 私有 Python ddddocr 服务。每张图最多自动尝试 5 次，最多换图 3 次（最多 4 张图、20 次），失败保留人工输入。

约束：不读取实际凭证；不新增或在实现期间运行单元测试；不改签到时机；不推送远端。
审查重点：验证码与 Cookie/state 对应；每张图最多 5 次，换图最多 3 次；超时人工回退；默认并发认证复用；OCR 无凭证和公开端口。

- [x] 新增 ocr/server.py、ocr/Dockerfile、ocr/requirements.txt，提供 POST /ocr 与 GET /health。
- [x] 新增 server/src/services/captchaOcrService.ts，recognizeCaptcha(image: string): Promise<string | null>，10 秒超时及英数字校验。
- [x] 修改 authService.ts 的 authenticate，沿用同一 client 并使用最新挑战 state，有限重试后调用 challengeFor。
- [x] 先更新 .env.example 再接入 Compose，更新 README。
- [x] 完成后统一验证项目所有已有检查及构建；确认无测试脚本时如实记录。构建镜像、真实登录并核实后台签到认证状态。
- [x] 审查 diff 并本地提交。保留旧后端镜像和停用 OCR 的回滚方法。


## 执行与验证记录

- 2026-11-06：恢复本地 OCR 方案，Hermes 当前模型拒绝识别验证码，未接入 Hermes。
- ddddocr==1.6.1 的实际接口与 PyPI 文档不一致：初始化不接受 max_image_bytes/max_image_side，由服务自身限制 512 KiB 与最长边 2048；set_ranges(int) 限制前 N 个字符，改用显式英数字字符串。
- 取消后端对 OCR 健康状态的启动硬依赖，OCR 不可用时保留人工入口。
- Docker 前后端及 OCR 镜像构建通过；Compose 配置和 git diff --check 通过；前端 lint 通过。
- 项目未提供测试脚本或现有单元测试套件；依用户要求未新增、未在实现期间运行单元测试。
- 额外后端 tsc --noEmit 发现原有 IClassClient.ts 的 6 处 URL 类型错误，该文件本次未修改；不能声称完整类型检查通过。
- 真实学校验证码：首次 OCR 提交登录成功；默认登录返回 OK；后台 enabled/running/authenticated=true，needsHumanVerification=false，lastError=null。
- 回滚：原后端镜像 iclass_buaa-backend:before-ocr-20261106 已保留。Compose 中显式将 ICLASS_CAPTCHA_OCR_URL 设为空并重建后端容器可关闭 OCR；无需改变账号凭证。
- 仅保存在本地功能分支，不推送或合并远端。

用户后续确认：每张图最多 5 次、最多 4 张图；同图仅抓取一次，依次尝试五种预处理。学校返回不同 captchaId 时立即放弃旧图，计入下一张图预算；不超出 20 次总上限。

本次验证：后端与 OCR 构建成功，五种预处理均通过真实 OCR HTTP 调用（合成示例图，结果符合英数字格式）；真实学校验证码在 image=1/attempt=1 登录成功；后台 authenticated=true、needsHumanVerification=false、lastError=null。未刻意向学校提交错误验证码以触发全部重试；5×4 上限经代码审查确认。
