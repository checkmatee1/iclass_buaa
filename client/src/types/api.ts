export interface ApiResponse<T> {
    ok: boolean;
    code: string;
    message: string;
    data: T | null;
}

export interface LoginRequest {
    studentId: string;
    password: string;
    useVpn: boolean;
}

export interface LoginData {
    token: string;
    userId: string;
    userName: string;
}

export interface CourseDetailItem {
    name: string;
    id: string;
    courseSchedId: string;
    date: string;
    startTime: string;
    endTime: string;
    signStatus: string;
}

export interface CourseDetailData {
    details: CourseDetailItem[];
}

export interface SignRequest {
    courseSchedId: string;
}

export interface SignQrRequest {
    courseSchedId: string;
}

export interface SignQrData {
    qrUrl: string;
    courseSchedId: string;
    timestamp: number;
}
