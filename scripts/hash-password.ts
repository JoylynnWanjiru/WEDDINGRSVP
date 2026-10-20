// Usage: npm run hash-password
// Asks for the admin password without showing it, and prints a value for
// ADMIN_PASSWORD_HASH. Put that in .env.local / Vercel, never in git.
// (Typing the password as a command argument would leave it in your shell history.)

import { hashSecret } from "../server/auth/sessions";

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let value = "";
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") process.exit(130); // Ctrl+C
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const password = process.argv[2] ?? (await askHidden("Admin password (hidden): "));
  if (password.length < 10) {
    console.error("Please use at least 10 characters.");
    process.exit(1);
  }
  if (!process.argv[2] && (await askHidden("Type it again: ")) !== password) {
    console.error("The two passwords didn't match.");
    process.exit(1);
  }
  const hash = await hashSecret(password);
  console.log("\nCopy this whole line into .env.local:\n");
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
}

void main();
