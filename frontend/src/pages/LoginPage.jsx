import React, { useState } from "react";
import { User, Lock, AlertCircle, Sun, Moon } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Btn, Input } from "../components/UI";
import { useTheme } from "../context/ThemeContext";

export default function LoginPage() {
  const { login } = useAuth();
  const { theme: T, isDark, toggleTheme } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [showPwd, setShowPwd]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.response?.data?.error || "Falha na autenticação. Verifique suas credenciais.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: T.bgApp, padding: 20,
      backgroundImage: `radial-gradient(ellipse 100% 60% at 50% -10%, ${T.accent}28, transparent), radial-gradient(ellipse 60% 40% at 80% 120%, ${T.accent}12, transparent)`,
      transition: "background 0.25s",
      position: "relative",
    }}>
      {/* Theme toggle no canto superior direito */}
      <div style={{ position: "absolute", top: 20, right: 20 }}>
        <button onClick={toggleTheme} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "7px 14px", background: T.bgCard,
          border: `1px solid ${T.border}`, borderRadius: 20,
          cursor: "pointer", fontFamily: "'Sora',sans-serif",
          color: T.t8, fontSize: 12, fontWeight: 600, transition: "all 0.2s",
        }}>
          {isDark
            ? <><Sun size={13} style={{ color: T.amber }} /> Modo Claro</>
            : <><Moon size={13} style={{ color: T.accent }} /> Modo Escuro</>
          }
        </button>
      </div>

      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <img
            src={isDark ? "/angeltreat-logo-white.png" : "/angeltreat-logo.png"}
            alt="angelTREAT"
            style={{ height: 48, width: "auto", display: "block", margin: "0 auto 20px" }}
          />
          <h1 style={{ fontSize: 18, fontWeight: 700, color: T.t1, letterSpacing: "-0.01em", marginBottom: 4 }}>ShiftSync</h1>
          <p style={{ color: T.t9, fontSize: 12, letterSpacing: "0.1em", fontWeight: 600, textTransform: "uppercase" }}>Workforce Manager</p>
        </div>

        {/* Card */}
        <div style={{
          background: T.bgCard, border: `1px solid ${T.border}`,
          borderRadius: 18, padding: 32,
          boxShadow: isDark ? "0 32px 80px #00000099, 0 0 0 1px #ffffff08" : "0 8px 40px #00000022",
          transition: "background 0.25s, border-color 0.25s",
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: T.t1, marginBottom: 6 }}>Entrar</h2>
          <p style={{ fontSize: 13, color: T.t9, marginBottom: 24 }}>Use suas credenciais corporativas (LDAP)</p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: T.t8, display: "block", marginBottom: 6, fontWeight: 600 }}>
                Usuário
              </label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="seu.usuario"
                icon={<User size={14} />}
                autoComplete="username"
              />
            </div>

            <div style={{ marginBottom: 24, position: "relative" }}>
              <label style={{ fontSize: 12, color: T.t8, display: "block", marginBottom: 6, fontWeight: 600 }}>
                Senha
              </label>
              <div style={{ position: "relative" }}>
                <Input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  icon={<Lock size={14} />}
                  autoComplete="current-password"
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", color: T.t10, cursor: "pointer",
                    fontSize: 12, fontFamily: "'Sora',sans-serif", padding: "2px 4px",
                  }}
                >
                  {showPwd ? "Ocultar" : "Ver"}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                background: T.red + "18", border: `1px solid ${T.red}44`,
                borderRadius: 8, padding: "10px 14px", marginBottom: 20,
              }}>
                <AlertCircle size={16} style={{ color: T.red, flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 13, color: T.red }}>{error}</span>
              </div>
            )}

            <Btn
              type="submit"
              disabled={loading || !username || !password}
              style={{ width: "100%", justifyContent: "center", padding: "11px 16px", fontSize: 14 }}
            >
              {loading ? "Autenticando..." : "Entrar"}
            </Btn>
          </form>
        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: T.t7, marginTop: 20 }}>
          Autenticação via LDAP/Active Directory corporativo
        </p>
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(12px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>
    </div>
  );
}

