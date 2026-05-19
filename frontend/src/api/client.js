import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 15000,
});

// Interceptor de request — lê token no momento da requisição, não na criação
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("shiftsync_token");
  if (token) {
    config.headers = config.headers || {};
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

// Interceptor de response — logout em 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const isLoginRoute = err.config?.url?.includes("/auth/login");
      const isMeRoute    = err.config?.url?.includes("/auth/me");
      if (!isLoginRoute && !isMeRoute) {
        localStorage.removeItem("shiftsync_token");
        localStorage.removeItem("shiftsync_user");
        window.location.href = "/";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
