import { useState } from "react";
import type { SubmitEventHandler } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import { setSession } from "../utils/session";

const LoginStudentPage = () => {
    const navigate = useNavigate();
    const [studentId, setStudentId] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loginMode, setLoginMode] = useState<"direct" | "vpn" | null>(null);
    const [error, setError] = useState("");

    const performLogin = async (useVpn: boolean) => {
        if (!studentId.trim()) {
            setError("请输入学号");
            return;
        }
        if (!password) {
            setError("请输入统一认证密码");
            return;
        }

        const mode = useVpn ? "vpn" : "direct";
        setLoginMode(mode);
        setError("");
        try {
            const res = await login({
                studentId: studentId.trim(),
                password,
                useVpn
            });

            if (!res.ok || !res.data) {
                setError(res.message || `${useVpn ? "VPN" : "直连"}登录失败`);
                return;
            }

            setSession(res.data.token, res.data.userId, res.data.userName, useVpn);
            navigate("/calendar", { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : `${useVpn ? "VPN" : "直连"}登录失败`);
        } finally {
            setLoginMode(null);
        }
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

                {error && <p className="error-text">{error}</p>}
            </section>
        </main>
    );
};

export default LoginStudentPage;
