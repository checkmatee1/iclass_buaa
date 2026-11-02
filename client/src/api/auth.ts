import axios from "axios";
import { http } from "./http";
import type { ApiResponse, LoginOutcome, LoginRequest } from "../types/api";

const fromAxiosError = <T>(error: unknown, fallbackMessage: string): ApiResponse<T> => {
    if (axios.isAxiosError<ApiResponse<T>>(error) && error.response?.data) {
        return error.response.data;
    }

    return {
        ok: false,
        code: "REQUEST_FAILED",
        message: error instanceof Error ? error.message : fallbackMessage,
        data: null
    };
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
    try {
        const res = await http.post<ApiResponse<LoginOutcome>>("/api/default-login", {});
        return res.data;
    } catch (error) {
        return fromAxiosError<LoginOutcome>(error, "默认 VPN 登录请求失败");
    }
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
