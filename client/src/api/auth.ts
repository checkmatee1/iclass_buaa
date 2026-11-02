import axios from "axios";
import { http } from "./http";
import type { ApiResponse, LoginOutcome, LoginRequest } from "../types/api";

export const isConnectionFailure = (code: string) =>
    code === "GATEWAY_UNAVAILABLE" || code === "REQUEST_FAILED";

const fromAxiosError = <T>(error: unknown, fallbackMessage: string): ApiResponse<T> => {
    if (axios.isAxiosError(error)) {
        const payload: unknown = error.response?.data;
        if (payload && typeof payload === "object" && "ok" in payload && typeof payload.ok === "boolean"
            && "code" in payload && typeof payload.code === "string"
            && "message" in payload && typeof payload.message === "string" && "data" in payload) {
            return payload as ApiResponse<T>;
        }
        if ([502, 503, 504].includes(error.response?.status ?? 0)) {
            return {ok: false, code: "GATEWAY_UNAVAILABLE", message: "公网连接暂时中断，请稍后重试", data: null};
        }
    }
    return {ok: false, code: "REQUEST_FAILED", message: fallbackMessage, data: null};
};

export const login = async (payload: LoginRequest): Promise<ApiResponse<LoginOutcome>> => {
    try {
        const res = await http.post<ApiResponse<LoginOutcome>>("/api/login", payload);
        return res.data;
    } catch (error) {
        return fromAxiosError<LoginOutcome>(error, "登录请求失败");
    }
};

export const defaultLogin = async (): Promise<ApiResponse<LoginOutcome>> => {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await http.post<ApiResponse<LoginOutcome>>("/api/default-login", {});
            return res.data;
        } catch (error) {
            const result = fromAxiosError<LoginOutcome>(error, "连接失败，请稍后重试");
            // The default context is shared and cached server-side, so fetching it again is safe.
            if (attempt === 1 || !isConnectionFailure(result.code)) return result;
        }
    }
    return {ok: false, code: "REQUEST_FAILED", message: "连接失败，请稍后重试", data: null};
};

export const logout = async (): Promise<ApiResponse<null>> => {
    const res = await http.post<ApiResponse<null>>("/api/logout", {});
    return res.data;
};

export const submitCaptcha = async (challengeId: string, captcha: string, refresh = false): Promise<ApiResponse<LoginOutcome>> => {
    try {
        const res = await http.post<ApiResponse<LoginOutcome>>(
            refresh ? "/api/login/captcha/refresh" : "/api/login/captcha", {challengeId, captcha});
        return res.data;
    } catch (error) {
        return fromAxiosError<LoginOutcome>(error, "验证码请求失败，请重新登录");
    }
};
