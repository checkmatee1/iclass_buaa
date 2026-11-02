import axios from "axios";
import { getToken } from "../utils/session";

// Keep browser requests same-origin so the local reverse proxy can reach the API.
const defaultBaseUrl = "";

export const http = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || defaultBaseUrl,
    timeout: 15000
});

http.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
        config.headers = config.headers ?? {};
        config.headers["X-Session-Token"] = token;
    }
    return config;
});
