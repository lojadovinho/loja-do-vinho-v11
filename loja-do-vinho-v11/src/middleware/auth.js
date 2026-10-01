const jwt = require("jsonwebtoken");

function auth(requiredRole) {
  return (req, res, next) => {
    const token = req.cookies?.lv_token;
    if (!token) return res.status(401).json({ error: "Não autenticado." });

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (requiredRole && payload.role !== requiredRole) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: "Sessão inválida." });
    }
  };
}

module.exports = { auth };
