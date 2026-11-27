const REQUIRED = {
  length: (value) => Array.from(value).length >= 8,
  uppercase: (value) => /\p{Lu}/u.test(value),
  number: (value) => /\p{N}/u.test(value),
  symbol: (value) => /[^\p{L}\p{N}\s]/u.test(value),
};

export function getPasswordPolicy(password) {
  const value = typeof password === "string" ? password : "";
  const checks = {
    length: REQUIRED.length(value),
    uppercase: REQUIRED.uppercase(value),
    number: REQUIRED.number(value),
    symbol: REQUIRED.symbol(value),
    lowercase: /\p{Ll}/u.test(value),
    long: Array.from(value).length >= 12,
  };
  const valid = checks.length && checks.uppercase && checks.number && checks.symbol;
  const strength = !value ? "empty" : !valid ? "weak" : checks.long && checks.lowercase ? "strong" : "medium";
  return { valid, strength, checks };
}

export function validatePassword(password) {
  return typeof password === "string" && password.length <= 128 && getPasswordPolicy(password).valid;
}
