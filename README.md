# 🎓 北航 iClass 签到系统 

## 📢 本次更新说明(2026.06.01) - v1.0.4

- 修复了 Windows 端在 WebVPN 模式下导致 iClass 登录失败的问题（见 PR #20），提高了 VPN 打卡的稳定性与兼容性。
- 登录流程继续读取服务器 `Date` 响应头以同步签到时间，并改进了针对 VPN 链路的时间修正策略，尽量避免时间戳落到服务端未来时间导致的“参数错误”。
- 直连打卡逻辑保持不变，主要在 VPN 模式下优化时间偏移处理以减少异常失败率。
- 重要提醒：学校服务器目前仍不支持补签打卡，请务必在上课时间内完成打卡。

PR 链接： https://github.com/zeroduhyy/iclass_buaa/pull/20

特别感谢本次修复的 PR 提交者：[@Yiki21](https://github.com/Yiki21)

> **支持 校园网直连 / WebVPN 登录**
>
> ⚠️ **免责声明**
> 本项目为开源代码，使用者需自行选择是否使用，并应遵守北京航空航天大学的相关规定。因使用本项目产生的一切后果均由使用者本人承担。


## 🛠️ 部署与打包指南

*注：原先的 Python 版本代码已迁移至 `python` 分支，全新版本请参考当前分支。*

### 1. macOS 本地运行

在项目根目录下运行以下脚本命令，会自动安装相关依赖：

在 macOS 终端中执行：

```cmd
chmod +x scripts/setup.sh
./scripts/setup.sh
```

脚本会安装根目录、客户端和服务端依赖，并可直接启动浏览器开发页面。

也可以手动执行：

```bash
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..
npm run dev
```

`npm run dev` 会同时启动本地后端和 Vite 前端。启动后在浏览器访问 `http://127.0.0.1:4000`。

如需配置默认 VPN 用户，复制 `.env.example` 为 `.env`，填写以下变量：

```env
ICLASS_DEFAULT_STUDENT_ID=
ICLASS_DEFAULT_VPN_USERNAME=
ICLASS_DEFAULT_VPN_PASSWORD=
```

配置完成后，打开登录页会优先尝试默认 VPN 登录；未配置或登录失败时仍可手动登录。

配置了上述默认 VPN 用户后，Docker 后端会自动启用后台签到，无需保持浏览器打开：

- 每分钟刷新当天课程；
- 每门课程上课前 20 分钟开始尝试签到；
- 每 10 秒尝试一次，签到成功后立即停止；
- 网络或登录会话失效后自动重新登录；
- 到课程结束时间仍未成功时停止，并在 Docker 日志中记录失败；
- Docker 服务重启后会重新读取 `.env` 并恢复调度。

可在 `.env` 中设置 `AUTO_SIGN_ENABLED=false` 临时关闭自动签到。运行状态可通过后端 `/api/health` 的 `data.autoSign` 字段查看。

### 2. Windows 本地运行

```cmd
./scripts/setup.bat
```

### 3. 构建检查

当前项目只通过浏览器运行，不提供桌面窗口或安装包。需要检查前端和服务端构建时运行：

```bash
npm run build
```

---

## ⚠️ 注意事项

- 本项目仅用于个人学习和研究交流，**请勿用于违反学校规定的用途**。
- 系统会话 (Session) 仅在本地存储登录状态，**绝不会**收集或上传个人的账号与密码。
- 若 iClass 系统接口更新，可能需要调整代码后才能继续使用，本项目无法保证长期及时更新。

---

💡 *希望本工具能为你的学习和签到管理带来便利！🚀*

## ✨ 致谢

感谢以下 PR 贡献者对本项目的支持与改进：

- [@Yiki21](https://github.com/Yiki21)
- [@el-ev](https://github.com/el-ev)
