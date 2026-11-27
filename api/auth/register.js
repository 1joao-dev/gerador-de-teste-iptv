import {
  clearLoginFailures,
  createUserSession,
  isAuthConfigured,
  isSameOriginRequest,
  loginRateLimit,
  recordLoginFailure,
  setAdminSessionCookie,
  isAdminUsername,
  ADMIN_SESSION_TTL_SECONDS,
} from "../../lib/admin-auth.js";
import { validatePassword } from "../../lib/password-policy.js";
import {
  getKeyAuthRegistrationMessage,
  isKeyAuthConfigured,
  registerKeyAuthAccount,
} from "../../lib/keyauth.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Vary", "Origin");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Método não permitido." });
  }
  if (!isSameOriginRequest(req)) return res.status(403).json({ message: "Origem da requisição não autorizada." });
  if (!isAuthConfigured()) return res.status(503).json({ message: "A autenticação ainda não foi configurada no servidor." });
  if (!isKeyAuthConfigured()) return res.status(503).json({ message: "O cadastro aguarda a configuração do KeyAuth no servidor." });

  const limit = loginRateLimit(req);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return res.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const licenseKey = typeof body.licenseKey === "string" ? body.licenseKey.trim() : "";

  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
    return res.status(400).json({ message: "O usuário deve ter de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado." });
  }
  if (isAdminUsername(username)) return res.status(409).json({ message: "Esse nome de usuário é reservado para uma conta administrativa." });
  if (!validatePassword(password)) {
    return res.status(400).json({ message: "A senha precisa ter no mínimo 8 caracteres, uma letra maiúscula, um número e um símbolo." });
  }
  if (!licenseKey || licenseKey.length > 160) return res.status(400).json({ message: "Informe uma chave KeyAuth válida." });

  try {
    const result = await registerKeyAuthAccount({ username, password, licenseKey });
    if (!result.success) {
      recordLoginFailure(req);
      return res.status(400).json({ message: getKeyAuthRegistrationMessage(result.message) });
    }
    clearLoginFailures(req);
    const token = createUserSession(username);
    setAdminSessionCookie(res, token);
    return res.status(201).json({
      authenticated: true,
      user: { username, role: "user" },
      expiresIn: ADMIN_SESSION_TTL_SECONDS,
    });
  } catch (error) {
    return res.status(502).json({ message: error instanceof Error ? error.message : "Não foi possível concluir o cadastro no KeyAuth." });
  }
}
