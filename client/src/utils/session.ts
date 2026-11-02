const TOKEN_KEY = "iclass_token";
const USER_ID_KEY = "iclass_user_id";
const USER_NAME_KEY = "iclass_user_name";
const USE_VPN_KEY = "iclass_use_vpn";

// Clear login metadata written to persistent browser storage by older versions.
[TOKEN_KEY, USER_ID_KEY, USER_NAME_KEY, USE_VPN_KEY, "iclass_last_student_id"].forEach((key) => {
    localStorage.removeItem(key);
});

export const getToken = (): string => sessionStorage.getItem(TOKEN_KEY) ?? "";

export const setSession = (
    token: string,
    userId: string,
    userName: string,
    useVpn: boolean
): void => {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_ID_KEY, userId);
    sessionStorage.setItem(USER_NAME_KEY, userName);
    sessionStorage.setItem(USE_VPN_KEY, useVpn ? "1" : "0");
};

export const clearSession = (): void => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_ID_KEY);
    sessionStorage.removeItem(USER_NAME_KEY);
    sessionStorage.removeItem(USE_VPN_KEY);
};

export const getUserDisplay = (): { userId: string; userName: string } => ({
    userId: sessionStorage.getItem(USER_ID_KEY) ?? "",
    userName: sessionStorage.getItem(USER_NAME_KEY) ?? ""
});

export const getUseVpnMode = (): boolean => sessionStorage.getItem(USE_VPN_KEY) === "1";
