import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_SESSION_TTL_SECONDS,
  REMEMBERED_SESSION_TTL_SECONDS,
  createUserSession,
  setAdminSessionCookie,
  verifyUserSession,
} from "../lib/admin-auth.js";

function configure(t) {
  const keys = ["APP_ACCESS_CODE", "APP_SESSION_SECRET", "ADMIN_USERNAME"];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });
  process.env.APP_ACCESS_CODE = "owner-access-secret-for-session-tests-0123456789";
  process.env.APP_SESSION_SECRET = "session-signing-secret-for-tests-".padEnd(80, "x");
  process.env.ADMIN_USERNAME = "1joaodev";
}

function request(token) {
  return { headers: { cookie: "__Host-iptvflow_admin=" + token } };
}

test("remember login creates a signed 30-day persistent session without changing the default 4-hour session", (t) => {
  configure(t);

  const standardToken = createUserSession("1joaodev", "owner");
  const rememberedToken = createUserSession("1joaodev", "owner", true);
  const standardSession = verifyUserSession(request(standardToken));
  const rememberedSession = verifyUserSession(request(rememberedToken));

  assert.equal(standardSession.remember, false);
  assert.equal(rememberedSession.remember, true);
  assert.ok(standardSession.expiresAt - Math.floor(Date.now() / 1000) <= ADMIN_SESSION_TTL_SECONDS);
  assert.ok(rememberedSession.expiresAt - Math.floor(Date.now() / 1000) <= REMEMBERED_SESSION_TTL_SECONDS);
  assert.ok(rememberedSession.expiresAt - standardSession.expiresAt >= REMEMBERED_SESSION_TTL_SECONDS - ADMIN_SESSION_TTL_SECONDS - 2);

  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
  setAdminSessionCookie(response, rememberedToken, true);
  assert.match(response.headers["Set-Cookie"], /Max-Age=2592000/);
  assert.match(response.headers["Set-Cookie"], /HttpOnly/);
  assert.match(response.headers["Set-Cookie"], /Secure/);
  assert.match(response.headers["Set-Cookie"], /SameSite=Strict/);
});

test("unremembered login remains a 4-hour cookie and remembered state is signed", (t) => {
  configure(t);
  const token = createUserSession("1joaodev", "owner", false);
  const session = verifyUserSession(request(token));
  assert.equal(session.remember, false);

  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
  setAdminSessionCookie(response, token, false);
  assert.match(response.headers["Set-Cookie"], /Max-Age=14400/);

  const parts = token.split(".");
  const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  payload.remember = true;
  const forged = Buffer.from(JSON.stringify(payload)).toString("base64url") + "." + parts[1];
  assert.equal(verifyUserSession(request(forged)), null);
});
