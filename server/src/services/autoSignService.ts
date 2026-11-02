import type { CourseDetailItem } from '../core/courseCore';
import { loginAndBuildContext, type LoginContext } from './authService';
import logger from '../utils/logger';

const BEIJING_TIME_ZONE = 'Asia/Shanghai';
const DEFAULT_LEAD_TIME_MS = 20 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 10 * 1000;
const DEFAULT_SCHEDULE_REFRESH_MS = 60 * 1000;
const DEFAULT_LOGIN_RETRY_MS = 60 * 1000;
const DEFAULT_SESSION_REFRESH_MS = 6 * 60 * 60 * 1000;
const MIN_TIMER_INTERVAL_MS = 1000;

type CourseState = 'waiting' | 'polling' | 'success' | 'expired';

interface TrackedCourse {
    course: CourseDetailItem;
    state: CourseState;
    attempts: number;
    lastAttemptAt: number;
    inFlight: boolean;
}

export interface AutoSignServiceStatus {
    enabled: boolean;
    running: boolean;
    authenticated: boolean;
    scheduleDate: string | null;
    trackedCourses: number;
    pollingCourses: number;
    successfulCourses: number;
    expiredCourses: number;
    lastScheduleRefreshAt: string | null;
    lastError: string | null;
}

export interface AutoSignService {
    start(): void;
    stop(): void;
    getStatus(): AutoSignServiceStatus;
}

interface AutoSignConfig {
    enabled: boolean;
    studentId: string;
    vpnUsername: string;
    vpnPassword: string;
    leadTimeMs: number;
    pollIntervalMs: number;
    scheduleRefreshMs: number;
    loginRetryMs: number;
    sessionRefreshMs: number;
}

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
    if (value === undefined) {
        return fallback;
    }

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
    }
    return fallback;
};

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const readConfig = (): AutoSignConfig => {
    const studentId = String(process.env.ICLASS_DEFAULT_STUDENT_ID ?? '').trim();
    const vpnUsername = String(process.env.ICLASS_DEFAULT_VPN_USERNAME ?? '').trim();
    const vpnPassword = String(process.env.ICLASS_DEFAULT_VPN_PASSWORD ?? '');
    const credentialsConfigured = Boolean(studentId && vpnUsername && vpnPassword);

    return {
        enabled: parseBoolean(process.env.AUTO_SIGN_ENABLED, credentialsConfigured),
        studentId,
        vpnUsername,
        vpnPassword,
        leadTimeMs: parsePositiveInteger(process.env.AUTO_SIGN_LEAD_TIME_MS, DEFAULT_LEAD_TIME_MS),
        pollIntervalMs: parsePositiveInteger(process.env.AUTO_SIGN_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS),
        scheduleRefreshMs: parsePositiveInteger(process.env.AUTO_SIGN_SCHEDULE_REFRESH_MS, DEFAULT_SCHEDULE_REFRESH_MS),
        loginRetryMs: parsePositiveInteger(process.env.AUTO_SIGN_LOGIN_RETRY_MS, DEFAULT_LOGIN_RETRY_MS),
        sessionRefreshMs: parsePositiveInteger(process.env.AUTO_SIGN_SESSION_REFRESH_MS, DEFAULT_SESSION_REFRESH_MS)
    };
};

const getBeijingDateKey = (timestamp: number): string => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: BEIJING_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}${values.month}${values.day}`;
};

const parseBeijingDateTime = (date: string, time: string): number | null => {
    const dateMatch = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const timeMatch = String(time).match(/^(\d{1,2}):(\d{2})/);
    if (!dateMatch || !timeMatch) {
        return null;
    }

    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    if (
        month < 1 || month > 12 ||
        day < 1 || day > 31 ||
        hour < 0 || hour > 23 ||
        minute < 0 || minute > 59
    ) {
        return null;
    }

    // China Standard Time is UTC+8 and does not observe daylight saving time.
    const timestamp = Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0);
    const verification = new Intl.DateTimeFormat('en-CA', {
        timeZone: BEIJING_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(verification.map((part) => [part.type, part.value]));
    const expectedDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    const actualDate = `${values.year}-${values.month}-${values.day}`;
    if (expectedDate !== actualDate || Number(values.hour) !== hour || Number(values.minute) !== minute) {
        return null;
    }

    return timestamp;
};

const normalizeError = (error: unknown): string => {
    return error instanceof Error && error.message ? error.message : String(error);
};

const isAuthenticationFailure = (result: any): boolean => {
    const message = `${String(result?.ERRMSG ?? '')} ${String(result?.message ?? '')}`.toLowerCase();
    return ['登录', '未登录', '会话', 'session', '认证', '过期', 'unauthorized'].some((keyword) => message.includes(keyword));
};

class DefaultAutoSignService implements AutoSignService {
    private readonly config = readConfig();
    private readonly courses = new Map<string, TrackedCourse>();
    private timer: NodeJS.Timeout | null = null;
    private tickInFlight = false;
    private context: LoginContext | null = null;
    private loginAt = 0;
    private nextLoginAttemptAt = 0;
    private scheduleDate: string | null = null;
    private lastScheduleRefreshAt = 0;
    private lastError: string | null = null;

    start(): void {
        if (!this.config.enabled) {
            logger.info('[auto-sign] disabled; set AUTO_SIGN_ENABLED=true and configure default VPN credentials to enable');
            return;
        }

        if (!this.config.studentId || !this.config.vpnUsername || !this.config.vpnPassword) {
            this.lastError = '自动签到已启用，但默认 VPN 账号配置不完整';
            logger.error(`[auto-sign] ${this.lastError}`);
            return;
        }

        if (this.timer) {
            return;
        }

        const timerInterval = Math.max(
            MIN_TIMER_INTERVAL_MS,
            Math.min(this.config.pollIntervalMs, this.config.scheduleRefreshMs)
        );
        logger.info(`[auto-sign] started lead=${this.config.leadTimeMs}ms poll=${this.config.pollIntervalMs}ms refresh=${this.config.scheduleRefreshMs}ms`);
        void this.tick();
        this.timer = setInterval(() => void this.tick(), timerInterval);
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.context = null;
        logger.info('[auto-sign] stopped');
    }

    getStatus(): AutoSignServiceStatus {
        const tracked = [...this.courses.values()];
        return {
            enabled: this.config.enabled,
            running: this.timer !== null,
            authenticated: this.context !== null,
            scheduleDate: this.scheduleDate,
            trackedCourses: tracked.length,
            pollingCourses: tracked.filter((item) => item.state === 'polling').length,
            successfulCourses: tracked.filter((item) => item.state === 'success').length,
            expiredCourses: tracked.filter((item) => item.state === 'expired').length,
            lastScheduleRefreshAt: this.lastScheduleRefreshAt > 0
                ? new Date(this.lastScheduleRefreshAt).toISOString()
                : null,
            lastError: this.lastError
        };
    }

    private async tick(): Promise<void> {
        if (this.tickInFlight) {
            return;
        }
        this.tickInFlight = true;

        try {
            const now = Date.now();
            const dateKey = getBeijingDateKey(now);
            if (this.scheduleDate !== dateKey) {
                this.scheduleDate = dateKey;
                this.courses.clear();
                this.lastScheduleRefreshAt = 0;
                logger.info(`[auto-sign] new schedule date ${dateKey}`);
            }

            const context = await this.ensureContext(now);
            if (!context) {
                return;
            }

            if (now - this.lastScheduleRefreshAt >= this.config.scheduleRefreshMs) {
                await this.refreshSchedule(context, dateKey, now);
                if (this.context !== context) {
                    return;
                }
            }

            for (const tracked of this.courses.values()) {
                await this.processCourse(context, tracked, now);
                if (this.context !== context) {
                    break;
                }
            }
        } catch (error) {
            this.lastError = normalizeError(error);
            logger.error(`[auto-sign] tick failed: ${this.lastError}`);
        } finally {
            this.tickInFlight = false;
        }
    }

    private async ensureContext(now: number): Promise<LoginContext | null> {
        if (this.context && now - this.loginAt < this.config.sessionRefreshMs) {
            return this.context;
        }
        if (now < this.nextLoginAttemptAt) {
            return null;
        }

        try {
            logger.info('[auto-sign] logging in with configured VPN account');
            this.context = await loginAndBuildContext({
                studentId: this.config.studentId,
                useVpn: true,
                vpnUsername: this.config.vpnUsername,
                vpnPassword: this.config.vpnPassword
            });
            this.loginAt = Date.now();
            this.nextLoginAttemptAt = 0;
            this.lastError = null;
            logger.info(`[auto-sign] login succeeded for userId=${this.context.userId}`);
            return this.context;
        } catch (error) {
            this.context = null;
            this.lastError = normalizeError(error);
            this.nextLoginAttemptAt = Date.now() + this.config.loginRetryMs;
            logger.error(`[auto-sign] login failed; retrying later: ${this.lastError}`);
            return null;
        }
    }

    private async refreshSchedule(context: LoginContext, dateKey: string, now: number): Promise<void> {
        try {
            const details = await context.client.getCourseByDate(dateKey);

            for (const course of details) {
                const courseSchedId = String(course.courseSchedId ?? '').trim();
                if (!courseSchedId) {
                    continue;
                }

                const existing = this.courses.get(courseSchedId);
                if (existing) {
                    existing.course = course;
                    if (course.signStatus === '1' && existing.state !== 'success') {
                        existing.state = 'success';
                        logger.info(`[auto-sign] already signed course=${course.name} sched=${courseSchedId}`);
                    }
                    continue;
                }

                this.courses.set(courseSchedId, {
                    course,
                    state: course.signStatus === '1' ? 'success' : 'waiting',
                    attempts: 0,
                    lastAttemptAt: 0,
                    inFlight: false
                });
            }

            this.lastScheduleRefreshAt = now;
            this.lastError = null;
            logger.info(`[auto-sign] schedule refreshed date=${dateKey} courses=${details.length}`);
        } catch (error) {
            this.lastError = normalizeError(error);
            logger.warn(`[auto-sign] schedule refresh failed: ${this.lastError}`);
            this.invalidateContext();
        }
    }

    private async processCourse(context: LoginContext, tracked: TrackedCourse, now: number): Promise<void> {
        if (tracked.state === 'success' || tracked.state === 'expired' || tracked.inFlight) {
            return;
        }

        if (tracked.course.signStatus === '1') {
            tracked.state = 'success';
            return;
        }

        const startAt = parseBeijingDateTime(tracked.course.date, tracked.course.startTime);
        const endAt = parseBeijingDateTime(tracked.course.date, tracked.course.endTime);
        if (startAt === null || endAt === null) {
            tracked.state = 'expired';
            logger.warn(`[auto-sign] invalid course time course=${tracked.course.name} date=${tracked.course.date} start=${tracked.course.startTime} end=${tracked.course.endTime}`);
            return;
        }

        if (now > endAt) {
            tracked.state = 'expired';
            logger.warn(`[auto-sign] course expired without success course=${tracked.course.name} sched=${tracked.course.courseSchedId} attempts=${tracked.attempts}`);
            return;
        }

        const windowStart = startAt - this.config.leadTimeMs;
        if (now < windowStart) {
            tracked.state = 'waiting';
            return;
        }
        tracked.state = 'polling';

        if (now - tracked.lastAttemptAt < this.config.pollIntervalMs) {
            return;
        }

        tracked.inFlight = true;
        tracked.lastAttemptAt = now;
        tracked.attempts += 1;
        try {
            const result = await context.client.signNow(tracked.course.courseSchedId);
            const status = String(result?.STATUS ?? '');
            const message = String(result?.ERRMSG ?? '学校接口未说明原因');
            if (status === '0') {
                tracked.state = 'success';
                tracked.course.signStatus = '1';
                this.lastError = null;
                logger.info(`[auto-sign] sign succeeded course=${tracked.course.name} sched=${tracked.course.courseSchedId} attempts=${tracked.attempts}`);
                return;
            }

            logger.warn(`[auto-sign] sign rejected course=${tracked.course.name} sched=${tracked.course.courseSchedId} attempt=${tracked.attempts} status=${status || 'unknown'} message=${message}`);
            if (isAuthenticationFailure(result)) {
                this.lastError = message;
                this.invalidateContext();
            }
        } catch (error) {
            this.lastError = normalizeError(error);
            logger.warn(`[auto-sign] sign request failed course=${tracked.course.name} sched=${tracked.course.courseSchedId}: ${this.lastError}`);
            this.invalidateContext();
        } finally {
            tracked.inFlight = false;
        }
    }

    private invalidateContext(): void {
        this.context = null;
        this.loginAt = 0;
        this.nextLoginAttemptAt = 0;
    }
}

export const createAutoSignService = (): AutoSignService => new DefaultAutoSignService();
