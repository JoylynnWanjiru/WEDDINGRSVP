// Usage: npm run env:check
// Checks the FORMAT of each value in .env.local and prints only ✓ / ✗ / –.
// Values are never printed, so the output is safe to share.

import { existsSync, readFileSync } from "node:fs";

type Check = { name: string; required: boolean; test: (v: string) => string | null };

const checks: Check[] = [
  {
    name: "DATABASE_URL",
    required: true,
    test: (v) => {
      if (!/^postgres(ql)?:\/\//.test(v)) return "should start with postgresql://";
      let url: URL;
      try {
        url = new URL(v);
      } catch {
        return "isn't a valid URL (part of it may be missing)";
      }
      if (!url.password) return "has no password: in Neon click 'Show password' before copying";
      if (!url.hostname.endsWith(".neon.tech")) return "host should end in .neon.tech";
      if (!url.hostname.includes("-pooler")) return "turn on 'Connection pooling' in Neon and copy again";
      if (url.searchParams.get("sslmode") !== "require") return "should end with ?sslmode=require";
      return null;
    },
  },
  { name: "APP_URL", required: true, test: (v) => (/^https?:\/\/[^\s/]+(:\d+)?\/?$/.test(v) ? null : "should be like http://localhost:3000") },
  { name: "TOKEN_SECRET", required: true, test: (v) => (v.length >= 32 ? null : "too short: run npm run secret and paste the output") },
  { name: "ADMIN_PASSWORD_HASH", required: true, test: (v) => (/^scrypt:\d+:\d+:\d+:[\w-]+:[\w-]+$/.test(v) ? null : "run npm run hash-password and paste the whole value") },
  {
    name: "CRON_SECRET",
    required: true,
    test: (v) => (v.length < 32 ? "too short: run npm run secret" : v === env.TOKEN_SECRET ? "must be different from TOKEN_SECRET" : null),
  },
  { name: "GMAIL_USER", required: false, test: (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : "should be a full email address") },
  { name: "GMAIL_APP_PASSWORD", required: false, test: (v) => (/^[a-zA-Z]{16}$/.test(v) ? null : "should be 16 letters with no spaces") },
];

const env: Record<string, string> = {};
const problems: string[] = [];

function main() {
  if (!existsSync(".env.local")) {
    console.error("✗ .env.local not found in this folder (see docs/SETUP.md, step 0).");
    process.exit(1);
  }

  for (const [i, raw] of readFileSync(".env.local", "utf8").split(/\r?\n/).entries()) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const m = /^([A-Z_]+)(\s*)=(\s*)(.*?)(\s*)$/.exec(raw);
    if (!m) {
      problems.push(`line ${i + 1} isn't NAME=value`);
      continue;
    }
    const [, name, before, after, value, trailing] = m;
    if (before || after) problems.push(`${name}: remove the space around "="`);
    if (trailing) problems.push(`${name}: remove the space at the end of the line`);
    if (/^["'].*["']$/.test(value)) problems.push(`${name}: remove the quotes`);
    if (/^[A-Z_]+=/.test(value)) problems.push(`${name}: the name is pasted twice (${name}=${name}=…)`);
    env[name] = value;
  }

  console.log("\n.env.local (values hidden):\n");
  for (const c of checks) {
    const v = env[c.name];
    if (!v) {
      console.log(`  ${c.required ? "✗" : "–"} ${c.name}${c.required ? ": missing" : ": not set yet (needed for email, step 2)"}`);
      if (c.required) problems.push(`${c.name} is missing`);
      continue;
    }
    const issue = c.test(v);
    console.log(`  ${issue ? "✗" : "✓"} ${c.name}${issue ? `: ${issue}` : ""}`);
    if (issue) problems.push(`${c.name}: ${issue}`);
  }

  const formatting = problems.filter((p) => /space|quotes|twice|line \d/.test(p));
  if (formatting.length) console.log(`\n  Formatting:\n${formatting.map((p) => `   ✗ ${p}`).join("\n")}`);
  console.log(problems.length ? "\nFix the ✗ lines above, save, and run this again." : "\n✓ Everything required looks right.");
  process.exit(problems.length ? 1 : 0);
}

main();
