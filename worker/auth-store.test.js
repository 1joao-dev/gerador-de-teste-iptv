import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AuthStore } from "./auth-store.js";

async function createStore(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "iptv-flow-auth-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new AuthStore({
    filePath: path.join(directory, "auth.json"),
    pepper: "test-pepper-that-is-long-enough-for-unit-tests",
    ownerUsername: "1joaodev",
  });
  await store.init();
  return store;
}

test("access keys are one-time and passwords are stored as scrypt hashes", async (t) => {
  const store = await createStore(t);
  const generated = await store.createAccessKey({
    actor: { username: "1joaodev", role: "owner" },
    label: "Cliente teste",
    expiresInDays: 30,
  });
  assert.match(generated.key, /^IPF-[A-F0-9]{48}$/);
  assert.equal((await store.listAccessKeys())[0].status, "active");

  const user = await store.register({
    username: "cliente01",
    password: "SenhaForte123!",
    accessKey: generated.key,
  });
  assert.equal(user.role, "user");
  assert.equal((await store.listAccessKeys())[0].status, "used");

  const stored = JSON.parse(await fs.readFile(store.filePath, "utf8"));
  assert.equal(stored.users[0].passwordHash.includes("SenhaForte123!"), false);
  assert.equal(stored.keys[0].hash.includes(generated.key), false);
  await assert.rejects(
    store.register({ username: "cliente02", password: "SenhaForte123!", accessKey: generated.key }),
    /já foi utilizada/,
  );
});

test("simultaneous registration cannot redeem a key twice", async (t) => {
  const store = await createStore(t);
  const generated = await store.createAccessKey({ actor: { username: "1joaodev", role: "owner" }, expiresInDays: null });
  const results = await Promise.allSettled([
    store.register({ username: "cliente01", password: "SenhaForte123!", accessKey: generated.key }),
    store.register({ username: "cliente02", password: "SenhaForte123!", accessKey: generated.key }),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.filter((item) => item.status === "rejected").length, 1);
});

test("keys can be revoked and expiry choices are validated", async (t) => {
  const store = await createStore(t);
  const actor = { username: "admin01", role: "admin" };
  const generated = await store.createAccessKey({ actor, expiresInDays: 7 });
  assert.equal((await store.revokeAccessKey({ id: generated.accessKey.id, actor })).status, "revoked");
  await assert.rejects(
    store.createAccessKey({ actor, expiresInDays: 2 }),
    /validade permitida/,
  );
});

test("only the owner can promote users to administrators", async (t) => {
  const store = await createStore(t);
  const generated = await store.createAccessKey({ actor: { username: "1joaodev", role: "owner" }, expiresInDays: null });
  await store.register({ username: "cliente01", password: "SenhaForte123!", accessKey: generated.key });
  await assert.rejects(
    store.setUserRole({ username: "cliente01", role: "admin", actor: { username: "admin01", role: "admin" } }),
    /Somente o proprietário/,
  );
  const promoted = await store.setUserRole({ username: "cliente01", role: "admin", actor: { username: "1joaodev", role: "owner" } });
  assert.equal(promoted.role, "admin");
  assert.equal((await store.validateSession("cliente01")).role, "admin");
});

test("registration enforces the agreed password policy", async (t) => {
  const store = await createStore(t);
  const generated = await store.createAccessKey({ actor: { username: "1joaodev", role: "owner" }, expiresInDays: null });
  await assert.rejects(
    store.register({ username: "cliente01", password: "senha123!", accessKey: generated.key }),
    /letra maiúscula/,
  );
});
