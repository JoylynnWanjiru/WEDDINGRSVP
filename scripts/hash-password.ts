// Usage: npx tsx scripts/hash-password.ts <password>
// Prints a value for ADMIN_PASSWORD_HASH. Put it in .env.local / Vercel, never in git.

import { hashSecret } from "../server/auth/sessions";

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error("Usage: npx tsx scripts/hash-password.ts <password of at least 10 characters>");
  process.exit(1);
}
console.log(await hashSecret(password));
