const jwt = require("jsonwebtoken");
const { getDb } = require("../db/init");

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    return res.status(401).json({ error: "Token não fornecido" });
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const db = getDb();
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.id);
    if (!user || !user.active) return res.status(401).json({ error: "Usuário inativo" });
    req.user = { id: user.id, username: user.username, role: user.role };
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    const expanded = new Set(roles);
    // ti ↔ hr equivalentes
    if (expanded.has("hr"))     expanded.add("ti");
    if (expanded.has("ti"))     expanded.add("hr");
    // leader inclui gerencia (gerencia pode tudo que leader pode)
    if (expanded.has("leader")) { expanded.add("hr"); expanded.add("ti"); expanded.add("gerencia"); }
    // gerencia tem acesso de leitura igual a hr em rotas GET
    if (expanded.has("hr") && req.method === "GET") expanded.add("gerencia");
    if (!expanded.has(userRole))
      return res.status(403).json({ error: "Sem permissão — role: " + userRole });
    next();
  };
}

module.exports = { requireAuth, requireRole };
