import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import api, { setApiAccessToken } from "../services/api";
import { disableDevicePushTokenRegistrationAsync } from "../services/fuelAlertService";
import { clearOfflineStorage, isNetworkError } from "../services/offlineService";
import {
  biometricLogin,
  disableTwoFactorAuth,
  getMyProfile,
  loginUser,
  loginWithGoogle,
  logoutUser,
  refreshUserToken,
  registerUser,
  resendPhoneOtp,
  resendTwoFactorOtp,
  startTwoFactorSetup,
  verifyPhoneOtp,
  verifyTwoFactorOtp,
} from "../services/authService";

const AuthContext = createContext(null);

const ACCESS_TOKEN_KEY = "ff_access_token";
const REFRESH_TOKEN_KEY = "ff_refresh_token";
const USER_KEY = "ff_user";
const SESSION_STORAGE_KEYS = [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY];

function parseStoredUser(rawValue) {
  if (!rawValue) return null;
  try {
    return JSON.parse(rawValue);
  } catch (_error) {
    return null;
  }
}

function buildSessionStorageEntries(nextUser, nextAccessToken, nextRefreshToken) {
  return [
    [ACCESS_TOKEN_KEY, String(nextAccessToken || "")],
    [REFRESH_TOKEN_KEY, String(nextRefreshToken || "")],
    [USER_KEY, JSON.stringify(nextUser || null)],
  ];
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const accessTokenRef = useRef("");
  const refreshTokenRef = useRef("");
  const userRef = useRef(null);
  const refreshPromiseRef = useRef(null);
  const sessionVersionRef = useRef(0);

  const getSessionVersion = useCallback(() => sessionVersionRef.current, []);

  const hasSessionVersion = useCallback((expectedVersion) => {
    return expectedVersion === sessionVersionRef.current;
  }, []);

  const applySession = useCallback((nextUser, nextAccessToken = "", nextRefreshToken = "") => {
    userRef.current = nextUser || null;
    accessTokenRef.current = nextAccessToken || "";
    refreshTokenRef.current = nextRefreshToken || "";

    setUser(nextUser || null);
    setAccessToken(nextAccessToken || "");
    setRefreshToken(nextRefreshToken || "");
    setApiAccessToken(nextAccessToken || "");
  }, []);

  const persistSessionStorage = useCallback(async (nextUser, nextAccessToken, nextRefreshToken) => {
    await AsyncStorage.multiSet(
      buildSessionStorageEntries(nextUser, nextAccessToken, nextRefreshToken)
    );
  }, []);

  const persistSession = useCallback(
    async (nextUser, nextAccessToken, nextRefreshToken, expectedVersion = sessionVersionRef.current) => {
      if (!hasSessionVersion(expectedVersion)) return false;
      applySession(nextUser, nextAccessToken, nextRefreshToken);
      try {
        await persistSessionStorage(nextUser, nextAccessToken, nextRefreshToken);
      } catch (_error) {
        // Keep the in-memory session usable even if local persistence fails.
      }
      return true;
    },
    [applySession, hasSessionVersion, persistSessionStorage]
  );

  const clearSession = useCallback(async () => {
    sessionVersionRef.current += 1;
    refreshPromiseRef.current = null;
    applySession(null, "", "");
    try {
      await AsyncStorage.multiRemove(SESSION_STORAGE_KEYS);
    } catch (_error) {
      // The session is already cleared in memory.
    }
    try {
      await clearOfflineStorage();
    } catch (_error) {
      // Ignore offline cache cleanup failures after the live session is gone.
    }
  }, [applySession]);

  const replaceUser = useCallback(async (nextUser, expectedVersion = sessionVersionRef.current) => {
    if (!hasSessionVersion(expectedVersion)) return false;
    userRef.current = nextUser || null;
    setUser(nextUser || null);
    try {
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(nextUser || null));
    } catch (_error) {
      // Ignore local persistence failures and keep the current session active.
    }
    return true;
  }, [hasSessionVersion]);

  const refreshSession = useCallback(async () => {
    const currentRefreshToken = refreshTokenRef.current;
    if (!currentRefreshToken) throw new Error("Missing refresh token");
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const expectedVersion = getSessionVersion();
    setIsRefreshing(true);
    refreshPromiseRef.current = (async () => {
      const data = await refreshUserToken(currentRefreshToken);
      if (!hasSessionVersion(expectedVersion)) {
        throw new Error("Session changed");
      }
      const nextAccessToken = data?.tokens?.accessToken;
      const nextRefreshToken = data?.tokens?.refreshToken;
      const nextUser = data?.user || userRef.current;

      if (!nextAccessToken || !nextRefreshToken) {
        throw new Error("Invalid refresh response");
      }

      await persistSession(nextUser, nextAccessToken, nextRefreshToken, expectedVersion);
      return nextAccessToken;
    })();

    try {
      return await refreshPromiseRef.current;
    } finally {
      refreshPromiseRef.current = null;
      setIsRefreshing(false);
    }
  }, [getSessionVersion, hasSessionVersion, persistSession]);

  useEffect(() => {
    const reqId = api.interceptors.request.use((config) => {
      const currentAccessToken = accessTokenRef.current;
      if (currentAccessToken) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${currentAccessToken}`;
      }
      return config;
    });

    const resId = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const original = error?.config;
        const status = error?.response?.status;

        if (!original || status !== 401 || original._retry) {
          return Promise.reject(error);
        }

        const isAuthMutation =
          original.url?.includes("/auth/login") ||
          original.url?.includes("/auth/register") ||
          original.url?.includes("/auth/refresh") ||
          original.url?.includes("/auth/google") ||
          original.url?.includes("/auth/phone/verify") ||
          original.url?.includes("/auth/phone/resend");
        if (isAuthMutation) {
          return Promise.reject(error);
        }

        try {
          original._retry = true;
          const nextAccessToken = await refreshSession();
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${nextAccessToken}`;
          return api(original);
        } catch (refreshErr) {
          await clearSession();
          return Promise.reject(refreshErr);
        }
      }
    );

    return () => {
      api.interceptors.request.eject(reqId);
      api.interceptors.response.eject(resId);
    };
  }, [clearSession, refreshSession]);

  useEffect(() => {
    let active = true;
    const expectedVersion = getSessionVersion();

    const restoreSession = async () => {
      let storedAccessToken = "";
      let storedRefreshToken = "";
      let storedUser = null;

      try {
        const storedEntries = await AsyncStorage.multiGet(SESSION_STORAGE_KEYS);
        const storedValues = Object.fromEntries(storedEntries);
        storedAccessToken = storedValues[ACCESS_TOKEN_KEY] || "";
        storedRefreshToken = storedValues[REFRESH_TOKEN_KEY] || "";
        storedUser = parseStoredUser(storedValues[USER_KEY]);

        if (!storedAccessToken || !storedRefreshToken) {
          if (active) setIsLoading(false);
          return;
        }

        if (!active || !hasSessionVersion(expectedVersion)) return;
        applySession(storedUser, storedAccessToken, storedRefreshToken);

        if (storedUser && active) {
          setIsLoading(false);
        }

        try {
          const profile = await getMyProfile();
          if (!active) return;
          if (!hasSessionVersion(expectedVersion)) return;
          if (!profile?.user) {
            throw new Error("Profile restore failed");
          }
          await replaceUser(profile.user, expectedVersion);
          setIsLoading(false);
        } catch (profileError) {
          if (isNetworkError(profileError) && storedUser) {
            if (active) setIsLoading(false);
            return;
          }

          try {
            const data = await refreshUserToken(storedRefreshToken);
            const nextAccessToken = data?.tokens?.accessToken;
            const nextRefreshToken = data?.tokens?.refreshToken;
            const nextUser = data?.user;

            if (!nextAccessToken || !nextRefreshToken) {
              throw new Error("Session restore failed");
            }

            if (nextUser) {
              if (!active || !hasSessionVersion(expectedVersion)) return;
              await persistSession(nextUser, nextAccessToken, nextRefreshToken, expectedVersion);
            } else {
              if (!active || !hasSessionVersion(expectedVersion)) return;
              applySession(storedUser, nextAccessToken, nextRefreshToken);
              const profile = await getMyProfile();
              if (!active) return;
              if (!hasSessionVersion(expectedVersion)) return;
              if (!profile?.user) {
                throw new Error("Profile restore failed");
              }
              await persistSession(profile.user, nextAccessToken, nextRefreshToken, expectedVersion);
            }

            if (active) setIsLoading(false);
          } catch (refreshError) {
            if (isNetworkError(refreshError) && storedUser) {
              if (active) setIsLoading(false);
              return;
            }
            throw refreshError;
          }
        }
      } catch (error) {
        if (active) {
          if (isNetworkError(error) && storedUser && storedAccessToken && storedRefreshToken) {
            applySession(storedUser, storedAccessToken, storedRefreshToken);
            setIsLoading(false);
            return;
          }
          await clearSession();
          setIsLoading(false);
        }
      }
    };

    restoreSession();

    return () => {
      active = false;
    };
  }, [applySession, clearSession, getSessionVersion, hasSessionVersion, persistSession, replaceUser]);

  const signUp = useCallback(
    async ({ name, email, phone, password }) => {
      const expectedVersion = getSessionVersion();
      const data = await registerUser({ name, email, phone, password });
      if (data?.verificationRequired || data?.twoFactorRequired) {
        return data;
      }
      void persistSession(data.user, data.tokens.accessToken, data.tokens.refreshToken, expectedVersion);
      return data;
    },
    [getSessionVersion, persistSession]
  );

  const signIn = useCallback(
    async ({ email, password }) => {
      const expectedVersion = getSessionVersion();
      const data = await loginUser({ email, password });
      if (data?.verificationRequired || data?.twoFactorRequired) {
        return data;
      }
      void persistSession(data.user, data.tokens.accessToken, data.tokens.refreshToken, expectedVersion);
      return data;
    },
    [getSessionVersion, persistSession]
  );

  const confirmPhoneOtp = useCallback(
    async ({ verificationToken, otpCode }) => {
      const expectedVersion = getSessionVersion();
      const data = await verifyPhoneOtp({ verificationToken, otpCode });
      void persistSession(data.user, data.tokens.accessToken, data.tokens.refreshToken, expectedVersion);
      return data;
    },
    [getSessionVersion, persistSession]
  );

  const resendPhoneVerification = useCallback(async ({ verificationToken }) => {
    return resendPhoneOtp({ verificationToken });
  }, []);

  const confirmTwoFactorOtp = useCallback(
    async ({ verificationToken, otpCode }) => {
      const expectedVersion = getSessionVersion();
      const data = await verifyTwoFactorOtp({ verificationToken, otpCode });
      if (data?.tokens?.accessToken && data?.tokens?.refreshToken && data?.user) {
        void persistSession(data.user, data.tokens.accessToken, data.tokens.refreshToken, expectedVersion);
      } else if (data?.user) {
        void replaceUser(data.user, expectedVersion);
      }
      return data;
    },
    [getSessionVersion, persistSession, replaceUser]
  );

  const resendTwoFactorCode = useCallback(async ({ verificationToken }) => {
    return resendTwoFactorOtp({ verificationToken });
  }, []);

  const beginTwoFactorSetup = useCallback(async () => {
    return startTwoFactorSetup();
  }, []);

  const turnOffTwoFactor = useCallback(async () => {
    const expectedVersion = getSessionVersion();
    const data = await disableTwoFactorAuth();
    if (data?.user) {
      void replaceUser(data.user, expectedVersion);
    }
    return data;
  }, [getSessionVersion, replaceUser]);

  const signOut = useCallback(async () => {
    try {
      await disableDevicePushTokenRegistrationAsync();
    } catch (_err) {
      // Best-effort cleanup only.
    }
    try {
      await logoutUser();
    } catch (_err) {
      // Ignore network/logout failures and clear local session anyway.
    }
    await clearSession();
  }, [clearSession]);

  const signInWithGoogle = useCallback(
    async ({ idToken }) => {
      const expectedVersion = getSessionVersion();
      const data = await loginWithGoogle(idToken);
      if (data?.verificationRequired || data?.twoFactorRequired) {
        return data;
      }
      void persistSession(data.user, data.tokens.accessToken, data.tokens.refreshToken, expectedVersion);
      return data;
    },
    [getSessionVersion, persistSession]
  );

  const signInWithBiometric = useCallback(
    async ({ deviceId, biometricSecret }) => {
      const expectedVersion = getSessionVersion();
      const data = await biometricLogin({ deviceId, biometricSecret });
      void persistSession(data.user, data.tokens.accessToken, data.tokens.refreshToken, expectedVersion);
      return data;
    },
    [getSessionVersion, persistSession]
  );

  const value = useMemo(
    () => ({
      user,
      accessToken,
      refreshToken,
      isLoading,
      isRefreshing,
      isAuthenticated: Boolean(user && accessToken),
      signUp,
      signIn,
      signOut,
      replaceUser,
      confirmPhoneOtp,
      resendPhoneVerification,
      confirmTwoFactorOtp,
      resendTwoFactorCode,
      beginTwoFactorSetup,
      turnOffTwoFactor,
      signInWithBiometric,
      signInWithGoogle,
    }),
    [
      user,
      accessToken,
      refreshToken,
      isLoading,
      isRefreshing,
      signUp,
      signIn,
      signOut,
      replaceUser,
      confirmPhoneOtp,
      resendPhoneVerification,
      confirmTwoFactorOtp,
      resendTwoFactorCode,
      beginTwoFactorSetup,
      turnOffTwoFactor,
      signInWithBiometric,
      signInWithGoogle,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
