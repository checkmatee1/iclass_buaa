import { IClassClient } from '../core/IClassClient';
import { randomUUID } from 'crypto';
import { recognizeCaptcha } from './captchaOcrService';
import logger from '../utils/logger';
import { AuthFlowError, SchoolCaptchaRequired, prepareSsoLogin, getCaptchaImage, type SsoState } from '../core/authCore';

export interface LoginInput {
    studentId: string;
    password: string;
    username?: string;
    useVpn: boolean;
}

export interface LoginContext {
    client: IClassClient;
    studentId: string;
    userId: string;
    userName: string;
    sessionId: string;
    useVpn: boolean;
}

export interface ServiceResult<T> {
    ok: boolean;
    code: string;
    message: string;
    data: T | null;
}

const buildLoginContext = (client: IClassClient, input: LoginInput): LoginContext => {
    const userId = String(client.userInfo?.id ?? '');
    const userName = String(client.userInfo?.realName ?? client.userInfo?.name ?? input.studentId);
    const sessionId = String(client.sessionId ?? '');

    if (!userId || !sessionId) {
        throw new Error('登录成功但用户信息不完整，请重试');
    }

    return {
        client,
        studentId: input.studentId,
        userId,
        userName,
        sessionId,
        useVpn: input.useVpn
    };
};

export interface CaptchaChallenge {
    challengeId: string;
    image: string;
    expiresAt: number;
    useVpn: boolean;
    isDefault: boolean;
}
export class CaptchaChallengeError extends AuthFlowError {
    constructor(public readonly challenge: CaptchaChallenge, message: string) { super('CAPTCHA_REQUIRED', message); }
}
interface PendingLogin {
    client: IClassClient;
    input: LoginInput;
    state: SsoState;
    expiresAt: number;
    isDefault: boolean;
}
const pending = new Map<string, PendingLogin>();
const TTL = 5 * 60 * 1000;
let defaultContext: LoginContext | null = null;
let defaultChallenge: CaptchaChallengeError | null = null;
let defaultInFlight: Promise<LoginContext> | null = null;
const prune = (): void => {
    for (const [id, item] of pending) if (Date.now() >= item.expiresAt) pending.delete(id);
};
const cleanupTimer = setInterval(prune, 60 * 1000);
cleanupTimer.unref();
const challengeFor = async (item: PendingLogin, message: string): Promise<never> => {
    prune();
    if (pending.size >= 32) throw new AuthFlowError('LOGIN_BUSY', '等待验证的登录过多，请稍后重试');
    const image = await getCaptchaImage(item.client.client, item.state);
    if (pending.size >= 32) throw new AuthFlowError('LOGIN_BUSY', '等待验证的登录过多，请稍后重试');
    const challengeId = randomUUID();
    item.expiresAt = Date.now() + TTL;
    pending.set(challengeId, item);
    const error = new CaptchaChallengeError({challengeId, image, expiresAt: item.expiresAt,
        useVpn: item.input.useVpn, isDefault: item.isDefault}, message);
    if (item.isDefault) defaultChallenge = error;
    throw error;
};
export const safeAuthError = (error: unknown): AuthFlowError => {
    if (error instanceof AuthFlowError) return error;
    return new AuthFlowError('AUTH_UNAVAILABLE', '学校认证或 iClass 请求失败，请稍后重试');
};
const authenticate = async (input: LoginInput, isDefault: boolean): Promise<LoginContext> => {
    if (!input.password) throw new AuthFlowError('INVALID_PARAM', '请输入统一认证密码');
    const client = new IClassClient(input.useVpn);
    try {
        await client.login({studentId: input.username ?? input.studentId, password: input.password});
        return buildLoginContext(client, input);
    } catch (error) {
        if (error instanceof SchoolCaptchaRequired) {
            const item: PendingLogin = {client, input, state: error.state, expiresAt: 0, isDefault};
            let message = error.message;
            // Four images total: initial image plus at most three replacements.
            // Each image is fetched once and tried with five OCR preprocessing variants.
            for (let imageIndex = 0; imageIndex < 4; imageIndex++) {
                if (!String(process.env.ICLASS_CAPTCHA_OCR_URL ?? '').trim()) break;
                const image = await getCaptchaImage(client.client, item.state);
                const imageCaptchaId = item.state.captchaId;
                for (let attempt = 0; attempt < 5; attempt++) {
                    const captcha = await recognizeCaptcha(image, attempt);
                    if (!captcha) continue;
                    logger.info(`[auth] captcha OCR submitting image=${imageIndex + 1} attempt=${attempt + 1}`);
                    try {
                        await client.login({studentId: input.username ?? input.studentId, password: input.password},
                            {state: item.state, captcha});
                        logger.info('[auth] captcha OCR login succeeded');
                        return buildLoginContext(client, input);
                    } catch (retryError) {
                        if (!(retryError instanceof SchoolCaptchaRequired)) throw safeAuthError(retryError);
                        item.state = retryError.state;
                        message = retryError.message;
                        if (!item.state.captchaId) throw new AuthFlowError('AUTH_PAGE_CHANGED', '学校验证码参数已变化，请重新登录');
                        // A school-issued new captcha invalidates this image; never submit it again.
                        if (item.state.captchaId !== imageCaptchaId) break;
                    }
                }
            }
            logger.info('[auth] captcha requires manual verification');
            return challengeFor(item, message);
        }
        throw safeAuthError(error);
    }
};
export const loginAndBuildContext = (input: LoginInput): Promise<LoginContext> => authenticate(input, false);
export const getDefaultLoginContext = async (): Promise<LoginContext> => {
    if (defaultContext?.client.sessionExpired) defaultContext = null;
    if (defaultContext) return defaultContext;
    prune();
    if (defaultChallenge && pending.has(defaultChallenge.challenge.challengeId)) throw defaultChallenge;
    if (defaultInFlight) return defaultInFlight;
    const studentId = String(process.env.ICLASS_DEFAULT_STUDENT_ID ?? '').trim();
    const username = String(process.env.ICLASS_DEFAULT_VPN_USERNAME ?? '').trim();
    const password = String(process.env.ICLASS_DEFAULT_VPN_PASSWORD ?? '');
    if (!studentId || !username || !password) throw new AuthFlowError('DEFAULT_LOGIN_NOT_CONFIGURED', '未配置默认 VPN 账号');
    defaultInFlight = authenticate({studentId, username, password, useVpn: true}, true);
    try { defaultContext = await defaultInFlight; return defaultContext; }
    finally { defaultInFlight = null; }
};
export const peekDefaultLoginContext = (): LoginContext | null => defaultContext;
export const invalidateDefaultLoginContext = (context: LoginContext | null): void => {
    if (defaultContext === context) defaultContext = null;
};
export const continueCaptchaLogin = async (id: string, captcha: string, refresh = false): Promise<{context: LoginContext; isDefault: boolean}> => {
    prune();
    const item = pending.get(id);
    if (!item) throw new AuthFlowError('CAPTCHA_EXPIRED', '验证码已过期或已使用，请重新登录');
    if (!refresh && (!captcha.trim() || captcha.length > 32)) throw new AuthFlowError('INVALID_PARAM', '请输入图片验证码');
    // Taking the entry makes refresh and submission mutually exclusive and single-use.
    pending.delete(id);
    if (item.isDefault) defaultChallenge = null;
    const operation = async (): Promise<LoginContext> => {
        try {
            if (refresh) {
                item.state = await prepareSsoLogin(item.client.client, item.input.useVpn);
                if (!item.state.captchaId) throw new AuthFlowError('CAPTCHA_EXPIRED', '学校已不要求验证码，请重新登录');
                return challengeFor(item, '请输入刷新后的验证码');
            }
            await item.client.login({studentId: item.input.username ?? item.input.studentId, password: item.input.password}, {state: item.state, captcha});
            const context = buildLoginContext(item.client, item.input);
            if (item.isDefault) defaultContext = context;
            return context;
        } catch (error) {
            if (error instanceof SchoolCaptchaRequired) {
                item.state = error.state;
                return challengeFor(item, error.message);
            }
            throw safeAuthError(error);
        }
    };
    const running = operation();
    if (item.isDefault) defaultInFlight = running;
    try { return {context: await running, isDefault: item.isDefault}; }
    finally { if (item.isDefault && defaultInFlight === running) defaultInFlight = null; }
};
