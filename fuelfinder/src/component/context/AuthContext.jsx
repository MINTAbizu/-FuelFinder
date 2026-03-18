import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import api, { setApiAccessToken } from "../services/api";
import {
  disableTwoFactorAuth,
  getMyProfile,
  loginUser,
  logoutUser,
  refreshUserToken,
  registerUser,
  resendPhoneOtp,
  resendTwoFactorOtp,
  loginWithGoogle,
  startTwoFactorSetup,
  verifyTwoFactorOtp,
  verifyPhoneOtp,
} from "../services/authService";

const AuthContext = createContext(null);

const ACCESS_TOKEN_KEY = "ff_access_token";
const REFRESH_TOKEN_KEY = "ff_refresh_token";
const USER_KEY = "ff_user";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshPromiseRef = useRef(null);

  const persistSession = useCallback(async (nextUser, nextAccessToken, nextRefreshToken) => {
    setUser(nextUser);
    setAccessToken(nextAccessToken);
    setRefreshToken(nextRefreshToken);
    setApiAccessToken(nextAccessToken);
    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, nextAccessToken);
    await AsyncStorage.setItem(REFRESH_TOKEN_KEY, nextRefreshToken);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(nextUser));
  }, []);

  const clearSession = useCallback(async () => {
    setUser(null);
    setAccessToken("");
    setRefreshToken("");
    setApiAccessToken("");
    await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
    await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
  }, []);

  const replaceUser = useCallback(async (nextUser) => {
    setUser(nextUser);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(nextUser));
  }, []);

  const refreshSession = useCallback(async () => {
    if (!refreshToken) throw new Error("Missing refresh token");
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    setIsRefreshing(true);
    refreshPromiseRef.current = (async () => {
      const data = await refreshUserToken(refreshToken);
      const nextAccessToken = data?.tokens?.accessToken;
      const nextRefreshToken = data?.tokens?.refreshToken;
      if (!nextAccessToken || !nextRefreshToken) {
        throw new Error("Invalid refresh response");
      }
      const profile = await getMyProfile();
      await persistSession(profile.user, nextAccessToken, nextRefreshToken);
      return nextAccessToken;
    })();

    try {
      return await refreshPromiseRef.current;
    } finally {
      refreshPromiseRef.current = null;
      setIsRefreshing(false);
    }
  }, [persistSession, refreshToken]);

  useEffect(() => {
    const reqId = api.interceptors.request.use((config) => {
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
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

        // Do not retry auth endpoints (except /auth/me).
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
  }, [accessToken, clearSession, refreshSession]);

  useEffect(() => {
    (async () => {
      try {
        const storedAccessToken = (await AsyncStorage.getItem(ACCESS_TOKEN_KEY)) || "";
        const storedRefreshToken = (await AsyncStorage.getItem(REFRESH_TOKEN_KEY)) || "";
        const storedUserRaw = (await AsyncStorage.getItem(USER_KEY)) || "";
        const storedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;

        if (!storedAccessToken || !storedRefreshToken) {
          setIsLoading(false);
          return;
        }

        setAccessToken(storedAccessToken);
        setRefreshToken(storedRefreshToken);
        if (storedUser) setUser(storedUser);
        setApiAccessToken(storedAccessToken);

        try {
          const profile = await getMyProfile();
          setUser(profile.user);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(profile.user));
        } catch (_err) {
          const data = await refreshUserToken(storedRefreshToken);
          const nextAccessToken = data?.tokens?.accessToken;
          const nextRefreshToken = data?.tokens?.refreshToken;
          if (!nextAccessToken || !nextRefreshToken) {
            throw new Error("Session restore failed");
          }
          setAccessToken(nextAccessToken);
          setRefreshToken(nextRefreshToken);
          setApiAccessToken(nextAccessToken);
          await AsyncStorage.setItem(ACCESS_TOKEN_KEY, nextAccessToken);
          await AsyncStorage.setItem(REFRESH_TOKEN_KEY, nextRefreshToken);
          const profile = await getMyProfile();
          setUser(profile.user);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(profile.user));
        }
      } catch (_error) {
        await clearSession();
      } finally {
        setIsLoading(false);
      }
    })();
  }, [clearSession]);

  const signUp = useCallback(
    async ({ name, email, phone, password }) => {
      const data = await registerUser({ name, email, phone, password });
      if (data?.verificationRequired || data?.twoFactorRequired) {
        return data;
      }
      await persistSession(
        data.user,
        data.tokens.accessToken,
        data.tokens.refreshToken
      );
      return data;
    },
    [persistSession]
  );

  const signIn = useCallback(
    async ({ email, password }) => {
      const data = await loginUser({ email, password });
      if (data?.verificationRequired || data?.twoFactorRequired) {
        return data;
      }
      await persistSession(
        data.user,
        data.tokens.accessToken,
        data.tokens.refreshToken
      );
      return data;
    },
    [persistSession]
  );

  const confirmPhoneOtp = useCallback(
    async ({ verificationToken, otpCode }) => {
      const data = await verifyPhoneOtp({ verificationToken, otpCode });
      await persistSession(
        data.user,
        data.tokens.accessToken,
        data.tokens.refreshToken
      );
      return data;
    },
    [persistSession]
  );

  const resendPhoneVerification = useCallback(async ({ verificationToken }) => {
    const data = await resendPhoneOtp({ verificationToken });
    return data;
  }, []);

  const confirmTwoFactorOtp = useCallback(
    async ({ verificationToken, otpCode }) => {
      const data = await verifyTwoFactorOtp({ verificationToken, otpCode });
      if (data?.tokens?.accessToken && data?.tokens?.refreshToken && data?.user) {
        await persistSession(
          data.user,
          data.tokens.accessToken,
          data.tokens.refreshToken
        );
      } else if (data?.user) {
        await replaceUser(data.user);
      }
      return data;
    },
    [persistSession, replaceUser]
  );

  const resendTwoFactorCode = useCallback(async ({ verificationToken }) => {
    const data = await resendTwoFactorOtp({ verificationToken });
    return data;
  }, []);

  const beginTwoFactorSetup = useCallback(async () => {
    const data = await startTwoFactorSetup();
    return data;
  }, []);

  const turnOffTwoFactor = useCallback(async () => {
    const data = await disableTwoFactorAuth();
    if (data?.user) {
      await replaceUser(data.user);
    }
    return data;
  }, [replaceUser]);

  const signOut = useCallback(async () => {
    try {
      await logoutUser();
    } catch (_err) {
      // Ignore network/logout failures and clear local session anyway.
    }
    await clearSession();
  }, [clearSession]);

  const signInWithGoogle = useCallback(
    async ({ idToken }) => {
      const data = await loginWithGoogle(idToken);
      if (data?.verificationRequired || data?.twoFactorRequired) {
        return data;
      }
      await persistSession(
        data.user,
        data.tokens.accessToken,
        data.tokens.refreshToken
      );
      return data;
    },
    [persistSession]
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
