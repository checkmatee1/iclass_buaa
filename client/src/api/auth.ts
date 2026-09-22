import axios from "axios";
import { http } from "./http";
import type { ApiResponse, LoginData, LoginRequest } from "../types/api";

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

export const login = async (payload: LoginRequest): Promise<ApiResponse<LoginData>> => {
    try {
        const res = await http.post<ApiResponse<LoginData>>("/api/login", payload);
        return res.data;
    } catch (error) {
        return fromAxiosError<LoginData>(error, "登录请求失败");
    }
};

export const defaultLogin = async (): Promise<ApiResponse<LoginData>> => {
    try {
        const res = await http.post<ApiResponse<LoginData>>("/api/default-login", {});
        return res.data;
    } catch (error) {
        return fromAxiosError<LoginData>(error, "默认 VPN 登录请求失败");
    }
};

export const logout = async (): Promise<ApiResponse<null>> => {
    const res = await http.post<ApiResponse<null>>("/api/logout", {});
    return res.data;
};
