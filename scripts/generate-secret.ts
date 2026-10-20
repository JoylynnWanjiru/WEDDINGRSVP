// Usage: npm run secret
// Prints a long random value for TOKEN_SECRET or CRON_SECRET.

import { randomBytes } from "node:crypto";

console.log(randomBytes(48).toString("base64url"));
