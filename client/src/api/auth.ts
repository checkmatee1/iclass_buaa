import axios from "axios";
import { http } from "./http";
import type { ApiResponse, LoginData, LoginRequest } from "../types/api";

export const login = async (payload: LoginRequest): Promise<ApiResponse<LoginData>> => {
    try {
        const res = await http.post<ApiResponse<LoginData>>("/api/login", payload);
        return res.data;
    } catch (error) {
        if (axios.isAxiosError<ApiResponse<LoginData>>(error) && error.response?.data) {
            return error.response.data;
        }

        return {
            ok: false,
            code: "REQUEST_FAILED",
            message: error instanceof Error ? error.message : "登录请求失败",
            data: null
        };
    }
};

export const logout = async (): Promise<ApiResponse<null>> => {
    const res = await http.post<ApiResponse<null>>("/api/logout", {});
    return res.data;
};
