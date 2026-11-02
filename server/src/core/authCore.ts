import type { Got } from 'got';
import * as cheerio from 'cheerio';
import { ICLASS_URLS, SSO_URLS } from '../config/constants';

export class AuthFlowError extends Error {
    constructor(public readonly code: string, message: string) { super(message); }
}
export interface SsoState {
    url: string;
    execution: string;
    captchaId?: string;
    captchaUrl?: string;
}
export class SchoolCaptchaRequired extends AuthFlowError {
    constructor(public readonly state: SsoState, message = '学校要求图片验证码，请输入后继续') {
        super('CAPTCHA_REQUIRED', message);
    }
}
export interface SsoAttempt { state: SsoState; captcha: string }
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36';

const parseState = (body: string, url: string): SsoState => {
    const $ = cheerio.load(body);
    const execution = $('input[name="execution"]').attr('value');
    if (!execution) throw new AuthFlowError('AUTH_PAGE_CHANGED', '学校登录页面结构发生变化，未找到登录参数');
    const scripts = $('script').map((_, e) => $(e).text()).get().join('\n');
    const block = /config\.captcha\s*=\s*\{([\s\S]*?)\}/.exec(scripts)?.[1];
    const captchaId = block && /\bid\s*:\s*['"]([^'"]+)['"]/.exec(block)?.[1];
    const input = $('input[name="captcha"]').length > 0;
    if ((block || input) && !captchaId) {
        throw new AuthFlowError('AUTH_PAGE_CHANGED', '学校要求验证码，但未能解析验证码参数');
    }
    const formAction = $('form').has('input[name="execution"]').attr('action');
    const action = formAction ? new URL(formAction, url) : new URL(url);
    if (action.origin !== new URL(url).origin) throw new AuthFlowError('AUTH_PAGE_CHANGED', '学校登录表单地址异常');
    // Preserve the service query when the form uses the relative "login" action.
    if (!action.search) action.search = new URL(url).search;
    return {url: action.toString(), execution, captchaId: captchaId || undefined,
        captchaUrl: captchaId ? new URL('captcha', url).toString() : undefined};
};
export const prepareSsoLogin = async (client: Got, useVpn: boolean): Promise<SsoState> => {
    const url = useVpn ? SSO_URLS.VPN_LOGIN : SSO_URLS.LOGIN;
    const res = await client.get(url, {searchParams: useVpn ? {} : {service: ICLASS_URLS.DIRECT.LOGIN_HOME}, headers: {'User-Agent': userAgent}});
    if (res.statusCode !== 200) throw new AuthFlowError('AUTH_UNAVAILABLE', '学校认证页面暂时不可用，请稍后重试');
    return parseState(res.body, res.url);
};
export const getCaptchaImage = async (client: Got, state: SsoState): Promise<string> => {
    if (!state.captchaId || !state.captchaUrl) throw new AuthFlowError('AUTH_PAGE_CHANGED', '验证码参数缺失');
    const res = await client.get(state.captchaUrl, {searchParams: {captchaId: state.captchaId, r: String(Date.now())},
        headers: {'User-Agent': userAgent, Referer: state.url}, responseType: 'buffer'});
    const mime = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (res.body.length > 512 * 1024 || res.statusCode !== 200 || !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime)) {
        throw new AuthFlowError('CAPTCHA_UNAVAILABLE', '学校验证码加载失败，请重试');
    }
    return `data:${mime};base64,${res.body.toString('base64')}`;
};
export const ssoLogin = async (client: Got, username: string, password: string, useVpn: boolean, attempt?: SsoAttempt): Promise<void> => {
    if (!username || !password) throw new AuthFlowError('INVALID_PARAM', '请输入账号和密码');
    const state = attempt?.state ?? await prepareSsoLogin(client, useVpn);
    if (state.captchaId && !attempt?.captcha.trim()) throw new SchoolCaptchaRequired(state);
    const form: Record<string, string> = {username, password, submit: '登录', type: 'username_password', execution: state.execution, _eventId: 'submit'};
    if (attempt?.captcha) form.captcha = attempt.captcha.trim().toLowerCase();
    const res = await client.post(state.url, {form, headers: {'User-Agent': userAgent, Referer: state.url}, followRedirect: false, throwHttpErrors: false, retry: {limit: 0}});
    if ([301,302,303,307,308].includes(res.statusCode)) {
        const location = res.headers.location;
        if (!location) throw new AuthFlowError('AUTH_FAILED', '学校登录跳转缺少地址');
        const next = new URL(location, state.url);
        if (!['https:', 'http:'].includes(next.protocol) || ![new URL(state.url).hostname, 'iclass.buaa.edu.cn', 'sso.buaa.edu.cn', 'd.buaa.edu.cn'].includes(next.hostname)) throw new AuthFlowError('AUTH_FAILED', '学校登录跳转到了未知地址');
        await finalizeLogin(client, await client.get(next), useVpn);
        return;
    }
    const $ = cheerio.load(res.body);
    if ($('input[name="execution"]').length) {
        const schoolError = $('#errorDiv p, #errorDiv, .errors, #msg').first().text().trim();
        const captchaError = /captcha|验证码|校验码/i.test(schoolError);
        const returnedState = parseState(res.body, state.url);
        // Generic "Invalid credentials" does not establish that the password is wrong.
        if (returnedState.captchaId || captchaError) {
            throw new SchoolCaptchaRequired(returnedState, '验证码或账号验证未通过，请核对后重试');
        }
        throw new AuthFlowError('CREDENTIALS_REJECTED', '学校拒绝了登录凭据，请先在学校官网核实账号、密码及账号状态');
    }
    if (res.statusCode >= 400) throw new AuthFlowError('AUTH_UNAVAILABLE', '学校认证服务返回异常，请稍后重试');
    await finalizeLogin(client, res, useVpn);
};

const looksLikeIclassUrl = (url: string): boolean => {
    return url.includes('iclass.buaa.edu.cn') || url.includes('d.buaa.edu.cn/https-834');
};

const looksLikeVpnPortalHome = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        return parsed.hostname === 'd.buaa.edu.cn' && !parsed.pathname.includes('/login');
    } catch {
        return false;
    }
};

const enterIclassService = async (client: Got): Promise<void> => {
    const probeUrl = `${ICLASS_URLS.VPN.SERVICE_HOME.replace(/\/$/, '')}/`;

    const probeRes = await client.get(probeUrl, {
        followRedirect: true,
        throwHttpErrors: false
    });
    const probeFinalUrl = probeRes.url || `status ${probeRes.statusCode}`;


    if (!looksLikeIclassUrl(probeFinalUrl)) {
        throw new AuthFlowError('AUTH_FAILED', 'VPN 登录后未能进入 iClass，请重新登录');
    }
};

const finalizeLogin = async (client: Got, response: any, useVpn: boolean): Promise<void> => {
    const finalUrl = response.url || `status ${response.statusCode}`;


    if (looksLikeIclassUrl(finalUrl)) {
        return;
    }

    if (useVpn && looksLikeVpnPortalHome(finalUrl)) {
        await enterIclassService(client);
        return;
    }


    throw new AuthFlowError('AUTH_FAILED', '学校未完成登录，请重新验证');
};


