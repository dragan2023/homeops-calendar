/**
 * 认证：移动端用 Bearer Token（后端 /api/login?issueToken=true 直接签发），
 * Token 存 AsyncStorage，启动时静默校验一次。
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setToken } from "../services/api";

const TOKEN_KEY = "homeops_token";
const USER_KEY = "homeops_user";

type Ctx = {
  ready: boolean;
  token: string | null;
  username: string | null;
  homeName: string | null;
  baseUrl: string;
  login: (u: string, p: string) => Promise<{ ok: boolean; message?: string }>;
  setup: (homeName: string, u: string, p: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
};
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setTok] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [homeName, setHomeName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(TOKEN_KEY);
        if (saved) {
          setToken(saved);
          setTok(saved);
          try {
            const me = await api.me();
            setUsername(me.user.username);
            setHomeName(me.user.homeName);
          } catch {
            // Token 失效（被撤销/换库）：清掉，回到登录页
            setToken(null);
            setTok(null);
            await AsyncStorage.removeItem(TOKEN_KEY);
          }
        }
      } catch {
        /* 读存储失败就当未登录 */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persist = useCallback(async (nextToken: string, user: string, home: string | null) => {
    setToken(nextToken);
    setTok(nextToken);
    setUsername(user);
    setHomeName(home);
    await AsyncStorage.multiSet([[TOKEN_KEY, nextToken], [USER_KEY, user]]);
  }, []);

  const login = useCallback(async (u: string, p: string) => {
    try {
      const res = await api.login({ username: u, password: p });
      if (!res.token) return { ok: false, message: "后端没有返回 Token（是否用旧版本服务？）" };
      setToken(res.token);
      const me = await api.me();
      await persist(res.token, me.user.username, me.user.homeName);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: String((err as Error).message) };
    }
  }, [persist]);

  const setup = useCallback(async (home: string, u: string, p: string) => {
    try {
      const res = await api.setup({ homeName: home, username: u, password: p });
      if (!res.token) return { ok: false, message: "初始化成功但没拿到 Token" };
      const me = await api.me();
      await persist(res.token, u, me.user.homeName);
      return { ok: true };
    } catch (err) {
      const msg = String((err as Error).message);
      return { ok: false, message: msg === "already_initialized" ? "已经初始化过了，请直接登录" : msg };
    }
  }, [persist]);

  const logout = useCallback(async () => {
    setToken(null);
    setTok(null);
    setUsername(null);
    setHomeName(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  }, []);

  const value = useMemo<Ctx>(() => ({ ready, token, username, homeName, baseUrl: api.base, login, setup, logout }), [ready, token, username, homeName, login, setup, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return ctx;
}
