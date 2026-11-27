import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/worker.js";
import { createUserSession } from "../lib/admin-auth.js";

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    send(value) {
      this.body = value;
      return this;
    },
  };
}

function configureAuth(role = "user", username = "cliente01") {
  process.env.APP_ACCESS_CODE = "segredo-de-proprietario-de-teste-com-mais-de-32-caracteres";
  process.env.APP_SESSION_SECRET = "s".repeat(80);
  process.env.ADMIN_USERNAME = "1joaodev";
  process.env.NODE_ENV = "production";
  return createUserSession(username, role);
}

test("proxy rejects requests without a signed session", async (t) => {
  const original = { ...process.env };
  t.after(() => {
    for (const key of ["APP_ACCESS_CODE", "APP_SESSION_SECRET", "ADMIN_USERNAME", "NODE_ENV"]) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  delete process.env.APP_ACCESS_CODE;
  delete process.env.APP_SESSION_SECRET;
  const response = mockResponse();
  await handler({
    method: "GET",
    query: { path: "/api/health" },
    headers: {},
  }, response);
  assert.equal(response.statusCode, 401);
});

test("proxy forwards only allowed routes and keeps the worker token server-side", async (t) => {
  const original = {
    APP_ACCESS_CODE: process.env.APP_ACCESS_CODE,
    APP_SESSION_SECRET: process.env.APP_SESSION_SECRET,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    WORKER_API_URL: process.env.WORKER_API_URL,
    WORKER_API_TOKEN: process.env.WORKER_API_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
    fetch: globalThis.fetch,
  };
  t.after(() => {
    for (const key of ["APP_ACCESS_CODE", "APP_SESSION_SECRET", "ADMIN_USERNAME", "WORKER_API_URL", "WORKER_API_TOKEN", "NODE_ENV"]) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    globalThis.fetch = original.fetch;
  });

  const token = configureAuth("user", "cliente01");
  process.env.WORKER_API_URL = "https://worker.example";
  process.env.WORKER_API_TOKEN = "token-interno-do-worker";
  let forwarded;
  globalThis.fetch = async (url, options) => {
    forwarded = { url: String(url), options };
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const response = mockResponse();
  await handler({
    method: "GET",
    query: { path: "/api/health" },
    headers: { cookie: "__Host-iptvflow_admin=" + token },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(forwarded.url, "https://worker.example/api/health");
  assert.equal(forwarded.options.headers.Authorization, "Bearer token-interno-do-worker");
  assert.equal(forwarded.options.headers["X-IPTVFlow-User"], "cliente01");
  assert.equal(forwarded.options.headers["X-IPTVFlow-Role"], "user");

  const chatResponse = mockResponse();
  await handler({
    method: "POST",
    query: { path: "/api/test-requests/123e4567-e89b-12d3-a456-426614174000/chat" },
    headers: {
      cookie: "__Host-iptvflow_admin=" + token,
      origin: "https://app.example",
      host: "app.example",
    },
    body: { message: "João" },
  }, chatResponse);
  assert.equal(chatResponse.statusCode, 200);
  assert.equal(forwarded.url, "https://worker.example/api/test-requests/123e4567-e89b-12d3-a456-426614174000/chat");
  assert.equal(forwarded.options.method, "POST");
  assert.deepEqual(JSON.parse(forwarded.options.body), { message: "João" });

  const blocked = mockResponse();
  await handler({
    method: "GET",
    query: { path: "/admin/secrets" },
    headers: { cookie: "__Host-iptvflow_admin=" + token },
  }, blocked);
  assert.equal(blocked.statusCode, 404);
});

test("only signed administrator sessions can run diagnostics", async (t) => {
  const original = {
    APP_ACCESS_CODE: process.env.APP_ACCESS_CODE,
    APP_SESSION_SECRET: process.env.APP_SESSION_SECRET,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    WORKER_API_URL: process.env.WORKER_API_URL,
    WORKER_API_TOKEN: process.env.WORKER_API_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
    fetch: globalThis.fetch,
  };
  t.after(() => {
    for (const key of ["APP_ACCESS_CODE", "APP_SESSION_SECRET", "ADMIN_USERNAME", "WORKER_API_URL", "WORKER_API_TOKEN", "NODE_ENV"]) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    globalThis.fetch = original.fetch;
  });

  process.env.WORKER_API_URL = "https://worker.example";
  process.env.WORKER_API_TOKEN = "token-interno-do-worker";
  const userToken = configureAuth("user", "cliente01");
  const denied = mockResponse();
  await handler({
    method: "GET",
    query: { path: "/api/diagnostics/futex" },
    headers: { cookie: "__Host-iptvflow_admin=" + userToken },
  }, denied);
  assert.equal(denied.statusCode, 403);

  const ownerToken = createUserSession("1joaodev", "owner");
  let forwardedUrl = "";
  globalThis.fetch = async (url) => {
    forwardedUrl = String(url);
    return new Response(JSON.stringify({ diagnostic: true }), { status: 200 });
  };
  const allowed = mockResponse();
  await handler({
    method: "GET",
    query: { path: "/api/diagnostics/futex" },
    headers: { cookie: "__Host-iptvflow_admin=" + ownerToken },
  }, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(forwardedUrl, "https://worker.example/api/diagnostics/futex");
});
