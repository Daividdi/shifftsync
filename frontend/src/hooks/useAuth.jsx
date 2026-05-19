import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../api/client";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("shiftsync_token");
    const saved = localStorage.getItem("shiftsync_user");

    if (!token || !saved) {
      setLoading(false);
      return;
    }

    try {
      setUser(JSON.parse(saved));
    } catch {
      localStorage.removeItem("shiftsync_user");
      setLoading(false);
      return;
    }

    // Valida token em background sem bloquear UI
    api.get("/auth/me")
      .then(r => {
        setUser(r.data);
        localStorage.setItem("shiftsync_user", JSON.stringify(r.data));
      })
      .catch(() => {
        // Só faz logout se o token for realmente inválido
        localStorage.removeItem("shiftsync_token");
        localStorage.removeItem("shiftsync_user");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const res = await api.post("/auth/login", { username, password });
    const { token, user: userData } = res.data;

    // Salva token ANTES de qualquer outra coisa
    localStorage.setItem("shiftsync_token", token);
    localStorage.setItem("shiftsync_user", JSON.stringify(userData));

    // Força o header na próxima requisição
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;

    setUser(userData);
    return userData;
  };

  const logout = useCallback(() => {
    localStorage.removeItem("shiftsync_token");
    localStorage.removeItem("shiftsync_user");
    delete api.defaults.headers.common["Authorization"];
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
