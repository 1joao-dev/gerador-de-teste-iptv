import { verifyAdminSession } from "../../lib/admin-auth.js";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Método não permitido." });
  }
  const session = verifyAdminSession(req);
  if (!session) return res.status(401).json({ authenticated: false });
  return res.status(200).json({
    authenticated: true,
    user: { username: session.username, role: session.role },
    expiresAt: session.expiresAt,
  });
}
