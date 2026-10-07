import { IClassClient } from '../core/IClassClient';

export interface LoginInput {
    studentId: string;
    password: string;
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

export const loginAndBuildContext = async (input: LoginInput): Promise<LoginContext> => {
    if (!input.password) {
        throw new Error('请输入统一认证密码');
    }

    const client = new IClassClient(input.useVpn);
    await client.login({
        studentId: input.studentId,
        password: input.password
    });
    return buildLoginContext(client, input);
};
