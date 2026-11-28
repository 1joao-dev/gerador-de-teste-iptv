import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/auth/password.js";
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
  };
}

function configure(t) {
  const keys = ["APP_ACCESS_CODE", "APP_SESSION_SECRET", "ADMIN_USERNAME", "WORKER_API_URL", "WORKER_API_TOKEN", "NODE_ENV"];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  t.after(() => {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    globalThis.fetch = originalFetch;
  });

  process.env.APP_ACCESS_CODE = "senha-inicial-do-proprietario-com-mais-de-32-caracteres";
  process.env.APP_SESSION_SECRET = "s".repeat(80);
  process.env.ADMIN_USERNAME = "1joaodev";
  process.env.WORKER_API_URL = "https://worker.example";
  process.env.WORKER_API_TOKEN = "worker-token-de-teste";
  process.env.NODE_ENV = "production";
}

function request(token, body, origin = "https://app.example") {
  return {
    method: "POST",
    headers: {
      cookie: "__Host-iptvflow_admin=" + token,
      origin,
      host: "app.example",
    },
    body,
  };
}

test("owner password change forwards the initial owner secret only server-to-server", async (t) => {
  configure(t);
  const token = createUserSession("1joaodev", "owner");
  let forwarded;
  globalThis.fetch = async (url, options) => {
    forwarded = { url: String(url), options };
    return new Response(JSON.stringify({ changed: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const response = mockResponse();
  await handler(request(token, {
    currentPassword: process.env.APP_ACCESS_CODE,
    newPassword: "SenhaNova456!",
  }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(forwarded.url, "https://worker.example/api/auth/password");
  assert.equal(forwarded.options.headers.Authorization, "Bearer worker-token-de-teste");
  assert.equal(forwarded.options.headers["X-IPTVFlow-User"], "1joaodev");
  assert.equal(forwarded.options.headers["X-IPTVFlow-Role"], "owner");
  const body = JSON.parse(forwarded.options.body);
  assert.equal(body.currentPassword, process.env.APP_ACCESS_CODE);
  assert.equal(body.newPassword, "SenhaNova456!");
  assert.equal(body.initialOwnerPassword, process.env.APP_ACCESS_CODE);
  assert.equal(JSON.stringify(response.body).includes(process.env.APP_ACCESS_CODE), false);
});

test("common account password changes do not receive the owner recovery secret", async (t) => {
  configure(t);
  const token = createUserSession("cliente01", "user");
  let forwarded;
  globalThis.fetch = async (url, options) => {
    forwarded = { url: String(url), options };
    return new Response(JSON.stringify({ changed: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const response = mockResponse();
  await handler(request(token, {
    currentPassword: "SenhaAntiga123!",
    newPassword: "SenhaNova456!",
  }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(forwarded.options.headers["X-IPTVFlow-User"], "cliente01");
  assert.equal(forwarded.options.headers["X-IPTVFlow-Role"], "user");
  const body = JSON.parse(forwarded.options.body);
  assert.equal(body.currentPassword, "SenhaAntiga123!");
  assert.equal(body.newPassword, "SenhaNova456!");
  assert.equal(Object.hasOwn(body, "initialOwnerPassword"), false);
});

test("password change rejects cross-origin requests before contacting the worker", async (t) => {
  configure(t);
  const token = createUserSession("cliente01", "user");
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("The worker must not be called.");
  };

  const response = mockResponse();
  await handler(request(token, {
    currentPassword: "SenhaAntiga123!",
    newPassword: "SenhaNova456!",
  }, "https://attacker.example"), response);

  assert.equal(response.statusCode, 403);
  assert.equal(called, false);
});
