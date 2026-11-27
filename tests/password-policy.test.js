import test from "node:test";
import assert from "node:assert/strict";
import { getPasswordPolicy, validatePassword } from "../lib/password-policy.js";

test("requires eight characters, uppercase, number and symbol", () => {
  assert.equal(validatePassword("Abc123!x"), true);
  assert.equal(validatePassword("Abc12345"), false);
  assert.equal(validatePassword("abc123!x"), false);
  assert.equal(validatePassword("Abcdef!x"), false);
  assert.equal(validatePassword("Abc123 x"), false);
  assert.equal(validatePassword("Ab1!"), false);
});

test("reports weak, medium and strong passwords", () => {
  assert.equal(getPasswordPolicy("abc").strength, "weak");
  assert.equal(getPasswordPolicy("Abc123!x").strength, "medium");
  assert.equal(getPasswordPolicy("SenhaSegura123!").strength, "strong");
});

test("does not count whitespace as a symbol", () => {
  assert.equal(getPasswordPolicy("Senha123 ").valid, false);
});
