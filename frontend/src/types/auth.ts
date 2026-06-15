export type User = {
  name: string;
  email: string;
};

export type AuthResponse = {
  message: string;
  id: string;
  user: User;
  accessToken: string;
};

export type RefreshResponse = {
  accessToken: string;
  user: User;
};

export type AuthContextType = {
  user: User | null;
  accessToken: string | null;
  isLoggedIn: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};