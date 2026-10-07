import type { Got } from 'got';
import { ICLASS_URLS } from '../config/constants';

const parseJsonSafe = (body: unknown): any | null => {
    if (body && typeof body === 'object') {
        return body;
    }
    if (typeof body !== 'string') {
        return null;
    }
    try {
        return JSON.parse(body);
    } catch {
        return null;
    }
};

const buildHeaders = (sessionId: string) => ({
    Sessionid: sessionId,
    Accept: 'application/json',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; M2012K11AC Build/TKQ1.221114.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 wxwork/4.1.30 MicroMessenger/7.0.1 Language/zh'
});

export const buildScanSignUrl = (useVpn: boolean): string => {
    const network = useVpn ? 'VPN' : 'DIRECT';
    return ICLASS_URLS[network].SCAN_SIGN;
};

export const buildTimestampUrl = (useVpn: boolean): string => {
    const network = useVpn ? 'VPN' : 'DIRECT';
    return ICLASS_URLS[network].SIGN_TIMESTAMP;
};

export const getServerTimestamp = async (
    client: Got,
    useVpn: boolean,
    userId: string,
    sessionId: string
): Promise<number> => {
    const res = await client.post(buildTimestampUrl(useVpn), {
        searchParams: { id: userId },
        headers: buildHeaders(sessionId),
        followRedirect: false,
        throwHttpErrors: false
    });

    if (res.statusCode !== 200) {
        throw new Error(`获取签到时间失败，HTTP 状态: ${res.statusCode}`);
    }

    const result = parseJsonSafe(res.body);
    if (!result) {
        throw new Error('获取签到时间失败：接口返回了无法解析的数据');
    }
    if (result.STATUS !== '0') {
        throw new Error(`获取签到时间失败：${result.ERRMSG || JSON.stringify(result)}`);
    }

    const timestamp = Number(result.timestamp ?? result.result?.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        throw new Error('获取签到时间失败：接口未返回有效时间戳');
    }

    return timestamp;
};

export const signNow = async (
    client: Got,
    useVpn: boolean,
    userId: string,
    sessionId: string,
    courseSchedId: string
): Promise<any> => {
    // The timestamp is short lived, so fetch it immediately before submitting the sign request.
    const timestamp = await getServerTimestamp(client, useVpn, userId, sessionId);
    const res = await client.post(buildScanSignUrl(useVpn), {
        searchParams: {
            id: userId,
            courseSchedId,
            timestamp: String(timestamp)
        },
        headers: buildHeaders(sessionId),
        followRedirect: false,
        throwHttpErrors: false
    });

    if (res.statusCode !== 200) {
        throw new Error(`签到失败，HTTP 状态: ${res.statusCode}`);
    }

    const result = parseJsonSafe(res.body);
    if (!result) {
        throw new Error('签到失败：接口返回了无法解析的数据');
    }
    if (result.STATUS !== '0') {
        throw new Error(`签到失败：${result.ERRMSG || JSON.stringify(result)}`);
    }
    if (String(result.result?.stuSignStatus ?? '') !== '1') {
        throw new Error(`签到失败：${result.ERRMSG || '服务器未确认签到成功'}`);
    }

    return result;
};
