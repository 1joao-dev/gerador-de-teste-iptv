import { clearAdminSessionCookie, isSameOriginRequest } from "../../lib/admin-auth.js";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Método não permitido." });
  }
  if (!isSameOriginRequest(req)) {
    return res.status(403).json({ message: "Origem da requisição não autorizada." });
  }
  clearAdminSessionCookie(res);
  return res.status(200).json({ authenticated: false });
}
