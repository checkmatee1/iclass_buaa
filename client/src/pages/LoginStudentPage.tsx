import { useState } from "react";
import type { SubmitEventHandler } from "react";
import { useNavigate } from "react-router-dom";
import { defaultLogin, isConnectionFailure, login, submitCaptcha } from "../api/auth";
import type { ApiResponse, LoginOutcome, CaptchaChallenge } from "../types/api";
import { setSession } from "../utils/session";

const LoginStudentPage = () => {
    const navigate = useNavigate();
    const [studentId, setStudentId] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loginMode, setLoginMode] = useState<"direct" | "vpn" | "default" | "captcha" | null>(null);
    const [error, setError] = useState("");

    const [challenge, setChallenge] = useState<CaptchaChallenge | null>(null);
    const [captcha, setCaptcha] = useState("");

    const acceptResult = (res: ApiResponse<LoginOutcome>, useVpn: boolean) => {
        if (res.code === "CAPTCHA_REQUIRED" && res.data && "challengeId" in res.data) {
            setChallenge(res.data);
            setPassword("");
            setCaptcha("");
            setError(res.message);
            return;
        }
        if (!res.ok || !res.data || !("token" in res.data)) {
            setError(res.message || "登录失败，请重试");
            // A submission consumes its challenge. Restart on all terminal failures.
            if (!isConnectionFailure(res.code) && res.code !== "INVALID_PARAM") setChallenge(null);
            return;
        }
        setPassword("");
        setChallenge(null);
        setSession(res.data.token, res.data.userId, res.data.userName, useVpn);
        navigate("/calendar", { replace: true });
    };
    const handleDefaultLogin = async () => {
        setLoginMode("default");
        setError("");
        try { acceptResult(await defaultLogin(), true); }
        finally { setLoginMode(null); }
    };
    const performLogin = async (useVpn: boolean) => {
        if (!studentId.trim() || !password) {
            setError("请输入学号和统一认证密码");
            return;
        }
        setLoginMode(useVpn ? "vpn" : "direct");
        setError("");
        try { acceptResult(await login({studentId: studentId.trim(), password, useVpn}), useVpn); }
        finally { setLoginMode(null); }
    };
    const handleCaptcha = async (refresh = false) => {
        if (!challenge) return;
        if (!refresh && !captcha.trim()) { setError("请输入图片验证码"); return; }
        setLoginMode("captcha");
        setError("");
        try {
            let result = await submitCaptcha(challenge.challengeId, captcha, refresh);
            if (challenge.isDefault && (isConnectionFailure(result.code) || result.code === "CAPTCHA_EXPIRED")) {
                // Recover the server's current state without resubmitting an answer.
                result = await defaultLogin();
            } else if (isConnectionFailure(result.code)) {
                result = {...result, message: "连接中断，当前验证码可能已失效，请返回登录重试"};
            }
            acceptResult(result, challenge.useVpn);
        }
        finally { setLoginMode(null); }
    };

    const handleDirectLogin: SubmitEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        void performLogin(false);
    };

    return (
        <main className="page login-page">
            <section className="card auth-card">
                <div className="auth-title-wrap">
                    <small className="auth-kicker">BUAA ICLASS</small>
                    <h1 className="auth-title">签到系统登录</h1>
                    <p className="hint auth-subtitle">直连和 WebVPN 使用同一组统一认证账号密码</p>
                </div>

                {!challenge && <>
                <button type="button" className="secondary" onClick={() => void handleDefaultLogin()} disabled={loginMode !== null}>
                    {loginMode === "default" ? "登录中..." : "登录我的账号"}
                </button>

                <form onSubmit={handleDirectLogin} className="stack auth-form" autoComplete="off">
                    <label htmlFor="studentId">学号</label>
                    <input
                        id="studentId"
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value)}
                        placeholder="例如：12345678"
                        autoComplete="off"
                        spellCheck={false}
                    />

                    <label htmlFor="password">统一认证密码</label>
                    <div className="password-wrap">
                        <input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            spellCheck={false}
                        />
                        <button
                            type="button"
                            className="password-eye"
                            onClick={() => setShowPassword((value) => !value)}
                            aria-label={showPassword ? "隐藏密码" : "显示密码"}
                            title={showPassword ? "隐藏密码" : "显示密码"}
                        >
                            {showPassword ? (
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M3 3L21 21" />
                                    <path d="M10.58 10.58A2 2 0 0013.42 13.42" />
                                    <path d="M9.88 5.09A9.77 9.77 0 0112 4c5 0 9 4 10 8a11.26 11.26 0 01-2.17 3.38" />
                                    <path d="M6.6 6.6A11.18 11.18 0 002 12c1 4 5 8 10 8a9.77 9.77 0 004.91-1.3" />
                                </svg>
                            ) : (
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M2 12C3 8 7 4 12 4s9 4 10 8c-1 4-5 8-10 8S3 16 2 12z" />
                                    <circle cx="12" cy="12" r="3" />
                                </svg>
                            )}
                        </button>
                    </div>
                    <div className="actions auth-actions auth-actions-lg">
                        <button type="button" className="secondary" onClick={() => void performLogin(true)} disabled={loginMode !== null}>
                            {loginMode === "vpn" ? "登录中..." : "VPN 登录"}
                        </button>
                        <button type="submit" disabled={loginMode !== null}>
                            {loginMode === "direct" ? "登录中..." : "直连登录"}
                        </button>
                    </div>
                </form>
                </>}
                {challenge && (
                    <form className="stack auth-form" onSubmit={(event) => { event.preventDefault(); void handleCaptcha(); }}>
                        <p className="hint">学校要求图片验证。完成后{challenge.isDefault ? "后台自动签到将复用本次登录" : "继续登录"}。</p>
                        <img className="captcha-image" src={challenge.image} alt="学校登录图片验证码" />
                        <label htmlFor="captcha">图片验证码</label>
                        <input id="captcha" value={captcha} onChange={(event) => setCaptcha(event.target.value)}
                            autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={32} autoFocus />
                        <p className="hint">验证码约 5 分钟内有效，过期后请重新登录。</p>
                        <div className="actions auth-actions">
                            <button type="button" className="secondary" onClick={() => void handleCaptcha(true)} disabled={loginMode !== null}>换一张</button>
                            <button type="submit" disabled={loginMode !== null}>{loginMode === "captcha" ? "处理中..." : "验证并登录"}</button>
                        </div>
                        <button type="button" className="secondary" disabled={loginMode !== null}
                            onClick={() => { setChallenge(null); setCaptcha(""); setError(""); }}>返回登录</button>
                    </form>
                )}

                {error && <p className="error-text" role="status">{error}</p>}
            </section>
        </main>
    );
};

export default LoginStudentPage;
