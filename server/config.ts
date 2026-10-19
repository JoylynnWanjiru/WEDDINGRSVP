// Environment access. Values are read lazily so a missing variable only fails
// the feature that needs it, with a clear message. Never log these values.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}

export const config = {
  databaseUrl: () => required("DATABASE_URL"),
  appUrl: () => required("APP_URL").replace(/\/+$/, ""),
  tokenSecret: () => {
    const secret = required("TOKEN_SECRET");
    if (secret.length < 32) throw new Error("TOKEN_SECRET must be at least 32 characters");
    return secret;
  },
  adminPasswordHash: () => required("ADMIN_PASSWORD_HASH"),
  cronSecret: () => required("CRON_SECRET"),
  /** v1 serves one wedding; the public teaser and request form use this slug. */
  weddingSlug: () => process.env.WEDDING_SLUG || "our-wedding",
};
