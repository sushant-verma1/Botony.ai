import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { authAPI, authSession } from "../services/api/api";
import type { User, AuthContextType } from "../types/auth";

const AuthContext = createContext<AuthContextType | null>(null);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Registered before the restore effect below so a token refreshed by the
  // interceptor mid-session still reaches React state.
  useEffect(() => {
    return authSession.register({
      onRefreshed: (data) => {
        setAccessToken(data.accessToken);

        if (data.user) {
          setUser(data.user);
        }
      },
      onAuthFailure: () => {
        setAccessToken(null);
        setUser(null);
      },
    });
  }, []);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const data = await authSession.refresh();

        setAccessToken(data.accessToken);

        if (data.user) {
          setUser(data.user);
        }
      } catch {
        authSession.setAccessToken(null);
        setAccessToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await authAPI.login(email, password);

    // Module first: the request interceptor reads it synchronously, so it must
    // be current before any request this triggers goes out.
    authSession.setAccessToken(data.accessToken);
    setAccessToken(data.accessToken);
    setUser(data.user);
  };

  const updateProfile = async (name: string) => {
    const { data } = await authAPI.updateProfile(name);

    setUser(data.user);
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } finally {
      authSession.setAccessToken(null);
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
    updateProfile,
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
