export const SSO_URLS = {
    LOGIN: "https://sso.buaa.edu.cn/login",
    VPN_LOGIN: "https://d.buaa.edu.cn/https/77726476706e69737468656265737421e3e44ed225256951300d8db9d6562d/login?service=https%3A%2F%2Fd.buaa.edu.cn%2Flogin%3Fcas_login%3Dtrue"
};

const VPN_BASE = "https://d.buaa.edu.cn/https-8347/77726476706e69737468656265737421f9f44d9d342326526b0988e29d51367ba018";
const VPN_LOGIN_BASE = "https://d.buaa.edu.cn/https-8346/77726476706e69737468656265737421f9f44d9d342326526b0988e29d51367ba018";
const VPN_CHECKIN_BASE = "https://d.buaa.edu.cn/https-8347/77726476706e69737468656265737421f9f44d9d342326526b0988e29d51367ba018";
const DIRECT_LOGIN_BASE = "https://iclass.buaa.edu.cn:8346";
const DIRECT_BASE = "https://iclass.buaa.edu.cn:8347";
const DIRECT_CHECKIN_BASE = "http://iclass.buaa.edu.cn:8081/eschool";

export const ICLASS_URLS = {
    VPN: {
        SERVICE_HOME: VPN_BASE,
        MY_CENTER: "https://d.buaa.edu.cn/https-8346/77726476706e69737468656265737421f9f44d9d342326526b0988e29d51367ba018/?type=jumpMyCenter",
        USER_LOGIN: `${VPN_LOGIN_BASE}/eschool/app/user/login_buaa.do`,
        COURSE_LIST: `${VPN_BASE}/app/choosecourse/get_myall_course.action`,
        SEMESTER_LIST: `${VPN_BASE}/app/course/get_base_school_year.action`,
        COURSE_SIGN_DETAIL: `${VPN_BASE}/app/my/get_my_course_sign_detail.action`,
        SCAN_SIGN: `${VPN_CHECKIN_BASE}/app/course/stu_scan_sign.action`,
        SIGN_TIMESTAMP: `${VPN_CHECKIN_BASE}/app/common/get_timestamp.action`,
        COURSE_SCHEDULE_BY_DATE: `${VPN_BASE}/app/course/get_stu_course_sched.action`
    },
    DIRECT: {
        SERVICE_HOME: DIRECT_BASE,
        LOGIN_HOME: `${DIRECT_LOGIN_BASE}/`,
        MY_CENTER: `${DIRECT_LOGIN_BASE}/?type=jumpMyCenter`,
        USER_LOGIN: `${DIRECT_LOGIN_BASE}/eschool/app/user/login_buaa.do`,
        COURSE_LIST: `${DIRECT_BASE}/app/choosecourse/get_myall_course.action`,
        SEMESTER_LIST: `${DIRECT_BASE}/app/course/get_base_school_year.action`,
        COURSE_SIGN_DETAIL: `${DIRECT_BASE}/app/my/get_my_course_sign_detail.action`,
        SCAN_SIGN: `${DIRECT_CHECKIN_BASE}/app/course/stu_scan_sign.action`,
        SIGN_TIMESTAMP: `${DIRECT_CHECKIN_BASE}/app/common/get_timestamp.action`,
        COURSE_SCHEDULE_BY_DATE: `${DIRECT_BASE}/app/course/get_stu_course_sched.action`
    }
} as const;
