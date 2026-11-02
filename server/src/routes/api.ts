import { createServer, IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { URL } from 'url';
import type { CourseItem } from '../core/courseCore';
import {
	loginAndBuildContext,
	getDefaultLoginContext,
	peekDefaultLoginContext,
	continueCaptchaLogin,
	CaptchaChallengeError,
	safeAuthError,
	LoginContext,
	LoginInput,
	ServiceResult as AuthServiceResult
} from '../services/authService';
import {
	generateSignQrForFrontend,
	getMergedCourseDetailsForFrontend,
	getSemesterCoursesForFrontend,
	signNowForFrontend,
	ServiceResult as CourseServiceResult,
	SemesterCoursesData
} from '../services/courseService';
import logger from '../utils/logger';
import type { AutoSignServiceStatus } from '../services/autoSignService';

type AnyServiceResult = AuthServiceResult<any> | CourseServiceResult<any>;

interface SessionState {
	context: LoginContext;
	courses: CourseItem[];
}

const sessions = new Map<string, SessionState>();

const DEFAULT_API_PORT = Number(process.env.API_PORT ?? 3000);
const DEFAULT_API_HOST = String(process.env.API_HOST ?? '127.0.0.1');
const ALLOWED_ORIGINS = new Set([
	'http://localhost:4000',
	'http://127.0.0.1:4000'
]);

const setCorsHeaders = (req: IncomingMessage, res: ServerResponse): void => {
	const origin = String(req.headers.origin ?? '');
	if (ALLOWED_ORIGINS.has(origin)) {
		res.setHeader('Access-Control-Allow-Origin', origin);
		res.setHeader('Vary', 'Origin');
	}
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
};

const sendJson = (res: ServerResponse, statusCode: number, payload: AnyServiceResult | Record<string, unknown>): void => {
	res.statusCode = statusCode;
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	res.setHeader('Cache-Control', 'no-store');
	res.end(JSON.stringify(payload));
};

const readJsonBody = async (req: IncomingMessage): Promise<any> => {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	if (chunks.length === 0) {
		return {};
	}

	const raw = Buffer.concat(chunks).toString('utf8');
	if (!raw.trim()) {
		return {};
	}

	try {
		return JSON.parse(raw);
	} catch {
		throw new Error('请求体不是有效 JSON');
	}
};

const parseBool = (value: unknown, fallback: boolean): boolean => {
	if (typeof value === 'boolean') {
		return value;
	}
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (normalized === 'true' || normalized === '1') {
			return true;
		}
		if (normalized === 'false' || normalized === '0') {
			return false;
		}
	}
	return fallback;
};

const extractToken = (req: IncomingMessage): string => {
	const headerToken = String(req.headers['x-session-token'] ?? '').trim();
	if (headerToken) {
		return headerToken;
	}

	const authHeader = String(req.headers.authorization ?? '').trim();
	if (authHeader.toLowerCase().startsWith('bearer ')) {
		return authHeader.slice(7).trim();
	}

	return '';
};

const unauthorized = (res: ServerResponse): void => {
	sendJson(res, 401, {
		ok: false,
		code: 'UNAUTHORIZED',
		message: '会话无效或已过期，请重新登录',
		data: null
	});
};

const sendAuthFailure = (res: ServerResponse, error: unknown): void => {
    if (error instanceof CaptchaChallengeError) {
        sendJson(res, 200, {ok: false, code: error.code, message: error.message, data: error.challenge});
        return;
    }
    const failure = safeAuthError(error);
    const status = failure.code === 'INVALID_PARAM' ? 400 : failure.code === 'CAPTCHA_EXPIRED' ? 410 : 401;
    sendJson(res, status, {ok: false, code: failure.code, message: failure.message, data: null});
};
const sendAuthenticated = (res: ServerResponse, context: LoginContext): void => {
    const existing = [...sessions].find(([, state]) => state.context === context);
    const token = existing?.[0] ?? randomUUID();
    for (const [key, state] of sessions) {
        if (state.context.studentId === context.studentId && state.context.useVpn === context.useVpn && key !== token) sessions.delete(key);
    }
    sessions.set(token, {context, courses: []});
    sendJson(res, 200, {ok: true, code: 'OK', message: '登录成功',
        data: {token, userId: context.userId, userName: context.userName}});
};
const handleLogin = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    let body: any;
    try { body = await readJsonBody(req); }
    catch { sendJson(res, 400, {ok: false, code: 'INVALID_JSON', message: '请求体必须是合法 JSON', data: null}); return; }
    const studentId = String(body?.studentId ?? '').trim();
    const password = String(body?.password ?? '');
    const useVpn = parseBool(body?.useVpn, false);
    if (!studentId || !password) {
        sendJson(res, 400, {ok: false, code: 'INVALID_PARAM', message: '请输入学号和统一认证密码', data: null}); return;
    }
    try { sendAuthenticated(res, await loginAndBuildContext({studentId, password, useVpn})); }
    catch (error) { sendAuthFailure(res, error); }
};
const handleDefaultLogin = async (_req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try { sendAuthenticated(res, await getDefaultLoginContext()); }
    catch (error) { sendAuthFailure(res, error); }
};
const handleCaptcha = async (req: IncomingMessage, res: ServerResponse, refresh: boolean): Promise<void> => {
    let body: any;
    try { body = await readJsonBody(req); }
    catch { sendJson(res, 400, {ok: false, code: 'INVALID_JSON', message: '请求体必须是合法 JSON', data: null}); return; }
    try {
        const result = await continueCaptchaLogin(String(body?.challengeId ?? ''), String(body?.captcha ?? ''), refresh);
        sendAuthenticated(res, result.context);
    } catch (error) { sendAuthFailure(res, error); }
};

const handleCourses = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
	const token = extractToken(req);
	const state = sessions.get(token);
	if (!state) {
		unauthorized(res);
		return;
	}

	const result: CourseServiceResult<SemesterCoursesData> = await getSemesterCoursesForFrontend(state.context.client);
	if (result.ok && result.data) {
		state.courses = result.data.courses;
		sendJson(res, 200, result);
		return;
	}

	sendJson(res, 400, result);
};

const handleCourseDetails = async (req: IncomingMessage, res: ServerResponse, onDefaultScheduleReload?: () => void): Promise<void> => {
	const token = extractToken(req);
	const state = sessions.get(token);
	if (!state) {
		unauthorized(res);
		return;
	}

	if (state.courses.length === 0) {
		const prefetch = await getSemesterCoursesForFrontend(state.context.client);
		if (prefetch.ok && prefetch.data) {
			state.courses = prefetch.data.courses;
		} else {
			sendJson(res, 400, prefetch);
			return;
		}
	}

	const result = await getMergedCourseDetailsForFrontend(state.context.client, state.courses, 7);
	if (result.ok && state.context === peekDefaultLoginContext()) onDefaultScheduleReload?.();
	sendJson(res, result.ok ? 200 : 400, result);
};

const handleSign = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
	const token = extractToken(req);
	const body = await readJsonBody(req);
	const state = sessions.get(token);

	if (!state) {
		unauthorized(res);
		return;
	}

	const courseSchedId = String(body?.courseSchedId ?? '').trim();

	if (!courseSchedId) {
		sendJson(res, 400, {
			ok: false,
			code: 'INVALID_PARAM',
			message: 'courseSchedId 不能为空',
			data: null
		});
		return;
	}

	if (state.courses.length === 0) {
		const prefetch = await getSemesterCoursesForFrontend(state.context.client);
		if (prefetch.ok && prefetch.data) {
			state.courses = prefetch.data.courses;
		} else {
			sendJson(res, 400, prefetch);
			return;
		}
	}

	const result = await signNowForFrontend(state.context.client, courseSchedId);
	sendJson(res, result.ok ? 200 : 400, result);
};

const handleSignQr = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
	const token = extractToken(req);
	const body = await readJsonBody(req);
	const state = sessions.get(token);

	if (!state) {
		unauthorized(res);
		return;
	}

	const courseSchedId = String(body?.courseSchedId ?? '').trim();
	const result = await generateSignQrForFrontend(
		state.context.client,
		state.context.useVpn,
		courseSchedId
	);
	sendJson(res, result.ok ? 200 : 400, result);
};

const handleLogout = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
	const token = extractToken(req);
	if (token) {
		sessions.delete(token);
	}

	sendJson(res, 200, {
		ok: true,
		code: 'OK',
		message: '已退出登录',
		data: null
	});
};

export interface ApiServerOptions {
	getAutoSignStatus?: () => AutoSignServiceStatus;
	onDefaultScheduleReload?: () => void;
}

export const startApiServer = (port: number = DEFAULT_API_PORT, options: ApiServerOptions = {}) => {
	const server = createServer(async (req, res) => {
		setCorsHeaders(req, res);

		if (req.method === 'OPTIONS') {
			res.statusCode = 204;
			res.end();
			return;
		}

		const method = String(req.method ?? 'GET').toUpperCase();
		const urlObj = new URL(req.url ?? '/', 'http://localhost');
		const path = urlObj.pathname;

		try {
			if (method === 'GET' && path === '/api/health') {
				sendJson(res, 200, {
					ok: true,
					code: 'OK',
					message: 'service running',
					data: {
						activeSessions: sessions.size,
						autoSign: options.getAutoSignStatus?.() ?? null
					}
				});
				return;
			}

			if (method === 'POST' && path === '/api/login') {
				await handleLogin(req, res);
				return;
			}

            if (method === 'POST' && (path === '/api/login/captcha' || path === '/api/login/captcha/refresh')) {
                await handleCaptcha(req, res, path.endsWith('/refresh'));
                return;
            }
			if (method === 'POST' && path === '/api/default-login') {
				await handleDefaultLogin(req, res);
				return;
			}

			if (method === 'GET' && path === '/api/courses') {
				await handleCourses(req, res);
				return;
			}

			if (method === 'GET' && path === '/api/course-details') {
				await handleCourseDetails(req, res, options.onDefaultScheduleReload);
				return;
			}

			if (method === 'POST' && path === '/api/sign') {
				await handleSign(req, res);
				return;
			}

			if (method === 'POST' && path === '/api/sign-qr') {
				await handleSignQr(req, res);
				return;
			}

			if (method === 'POST' && path === '/api/logout') {
				await handleLogout(req, res);
				return;
			}

			sendJson(res, 404, {
				ok: false,
				code: 'NOT_FOUND',
				message: '接口不存在',
				data: null
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error(`[api] ${method} ${path} failed: ${message}`);
			sendJson(res, 500, {
				ok: false,
				code: 'INTERNAL_ERROR',
				message: '服务器内部错误',
				data: null
			});
		}
	});

	server.listen(port, DEFAULT_API_HOST, () => {
		logger.info(`[api] server started at http://${DEFAULT_API_HOST}:${port}`);
	});

	return server;
};
