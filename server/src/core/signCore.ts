import type { Got } from 'got';
import { ICLASS_URLS } from '../config/constants';
import logger from '../utils/logger';

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

export const buildScanSignUrl = (
    useVpn: boolean
): string => {
    const network = useVpn ? 'VPN' : 'DIRECT';
    return ICLASS_URLS[network].SCAN_SIGN;
};

export const signNow = async (
    client: Got,
    useVpn: boolean,
    userId: string,
    sessionId: string,
    courseSchedId: string
): Promise<any> => {
    const network = useVpn ? 'VPN' : 'DIRECT';
    const timestampUrl = ICLASS_URLS[network].SIGN_TIMESTAMP;
    const signUrl = buildScanSignUrl(useVpn);

    const commonHeaders = {
        sessionId,
        Accept: 'application/json',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; M2012K11AC Build/TKQ1.221114.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 wxwork/4.1.30 MicroMessenger/7.0.1 Language/zh'
    };

    const timestampRes = await client.post(timestampUrl, {
        searchParams: { id: userId },
        headers: commonHeaders,
        followRedirect: false,
        throwHttpErrors: false
    });
    const timestampPayload = parseJsonSafe(timestampRes.body);
    const timestamp = Number(timestampPayload?.timestamp);
    if (timestampRes.statusCode !== 200 || !Number.isFinite(timestamp)) {
        throw new Error(`获取签到时间戳失败（HTTP=${timestampRes.statusCode}）`);
    }

    const baseParams = {
        id: userId,
        courseSchedId,
        timestamp: String(timestamp)
    };

    const res = await client.post(signUrl, {
        searchParams: baseParams,
        headers: commonHeaders,
        followRedirect: false,
        throwHttpErrors: false
    });

    const parsedResult = parseJsonSafe(res.body);
    const diagnostics = {
        mode: useVpn ? 'WEBVPN' : 'DIRECT',
        endpoint: new URL(signUrl).pathname,
        httpStatus: res.statusCode,
        requestTimestamp: timestamp,
        requestTime: new Date(timestamp).toISOString(),
        timestampSource: new URL(timestampUrl).pathname,
        responseDate: res.headers.date ?? null,
        responseContentType: res.headers['content-type'] ?? null
    };

    logger.info(`[sign] ${JSON.stringify({
        ...diagnostics,
        schoolStatus: parsedResult?.STATUS ?? null,
        schoolMessage: parsedResult?.ERRMSG ?? null
    })}`);

    if (parsedResult !== null) {
        return {
            ...parsedResult,
            diagnostics
        };
    }

    return {
        STATUS: '1',
        ERRMSG: '签到接口返回非 JSON',
        statusCode: res.statusCode,
        location: res.headers.location ?? null,
        raw: String(res.body).slice(0, 200),
        diagnostics
    };
};
