import { createContext, useContext, useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { authAPI } from "../services/api/api";
import api from "../services/api/api";
import type { User, AuthContextType } from "../types/auth";

const AuthContext = createContext<AuthContextType | null>(null);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const accessTokenRef = useRef<string | null>(null);
  accessTokenRef.current = accessToken;

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { data } = await authAPI.refresh();

        setAccessToken(data.accessToken);

        if (data.user) {
          setUser(data.user);
        }
      } catch (error) {
        setAccessToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  useEffect(() => {
    const interceptor = api.interceptors.request.use((config) => {
      const token = accessTokenRef.current;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      return config;
    });

    return () => {
      api.interceptors.request.eject(interceptor);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await authAPI.login(email, password);

    setAccessToken(data.accessToken);
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  const value: AuthContextType = {
    user,
    accessToken,
    isLoggedIn: !!accessToken,
    loading,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
