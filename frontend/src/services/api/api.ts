import axios from "axios";
import type {
  AuthResponse,
  RefreshResponse,
} from "../../types/auth";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api",
  withCredentials: true,
});

export const authAPI = {
  register: (
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ) =>
    api.post<AuthResponse>("/auth/register", {
      email,
      password,
      firstName,
      lastName,
    }),

  login: (email: string, password: string) =>
    api.post<AuthResponse>("/auth/login", {
      email,
      password,
    }),

  logout: () =>
    api.post<{ message: string }>("/auth/logout"),

  refresh: () =>
    api.post<RefreshResponse>("/auth/refresh"),
};

export default api;