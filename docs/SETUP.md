# Setup guide: database (Neon) and email (Gmail)

This connects the app to a **real database** and a **real email account**. Every
secret goes into one file on your computer, `.env.local`, which git ignores, so
it never reaches GitHub.

> **Golden rule:** never paste a secret (connection string, password, app password)
> into a chat, an issue, a screenshot or a commit. If one leaks, reset it at the
> source (instructions at the end of each step).

---

## Step 0: create `.env.local`

`.env.example` is the committed template, with names and no values. You copy it and fill
in your own values.

In the project folder (VS Code terminal, or in Claude Code type `!` before the command):

```powershell
Copy-Item .env.example .env.local
git check-ignore -v .env.local
```

The second command should print a line ending in `.env.local`. That means git
will ignore the file. Open `.env.local` in your editor; you'll fill it in below.

---

## Step 1: the database (Neon)

### What you are setting up

Neon hosts a **PostgreSQL** database for free. The app talks to it using a
**connection string**, a URL that contains everything needed to log in:

```
postgresql://neondb_owner:PASSWORD@ep-cool-name-123-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
             └── user ──┘ └ secret┘ └──────────────── host (server address) ────────────────┘ └ db ┘ └ encrypted ┘
```

Because it contains the password, **the whole string is a secret**.

### 1.1 Create an account and a project

1. Go to **https://neon.tech** and click **Sign up**. Signing in with GitHub is easiest.
2. Choose the **Free** plan.
3. Create a project:
   - **Project name:** `wedding-rsvp`
   - **Postgres version:** leave the default
   - **Region:** **AWS Europe West 2 (London)**, the closest Neon region to Kenya.
     The app server must run next to the database, because one page can make several
     queries. That's already set: `vercel.json` has `"regions": ["lhr1"]` (Vercel's London).
     If you ever pick a different Neon region, change `lhr1` to the matching Vercel region
     (e.g. `iad1` for US East).
4. Click **Create project**.

### 1.2 Copy the connection string

1. On the project dashboard, click **Connect**.
2. Leave branch `main`, database `neondb`, role `neondb_owner`.
3. Make sure **Connection pooling** is **on**. The host then contains `-pooler`.
   Pooling lets many short serverless requests share connections.
4. Copy the connection string. If the password shows as `****`, click **Show password**
   or use the copy button, which copies the real value.

### 1.3 Fill in `.env.local`

Paste each value after the `=`, with no spaces and no quotes:

| Line | What to put |
|---|---|
| `DATABASE_URL=` | the connection string from 1.2 |
| `APP_URL=` | `http://localhost:3000` for now (your real site address later) |
| `TOKEN_SECRET=` | run `npm run secret` and paste the output |
| `CRON_SECRET=` | run `npm run secret` **again** and paste the new output |
| `ADMIN_PASSWORD_HASH=` | run `npm run hash-password`, type your admin password twice (it stays hidden), and paste the line it prints |

Leave the Gmail lines empty until step 2. Save the file.

> ⚠️ **`TOKEN_SECRET` is permanent once invitations go out.** Every guest's personal
> link and gate pass is derived from it (BLUEPRINT D1). Changing it later breaks them all.
> Keep a copy somewhere safe, such as a password manager.

### 1.4 Create the tables, add the wedding, check everything

```powershell
npm run db:migrate
npm run db:seed
npm run db:check
```

| Command | What it does | You should see |
|---|---|---|
| `db:migrate` | Runs the SQL files in `server/db/migrations` in order, creating the 16 tables. Neon remembers which have run, so running it twice is harmless. | `✓ Migrations applied to ep-…neon.tech` |
| `db:seed` | Adds your wedding with placeholder names, the programme, FAQ and dress code. Safe to run twice. | `✓ Seeded wedding "our-wedding"…` |
| `db:check` | Creates a throwaway wedding, runs add guest → RSVP → approve → two ushers scanning at once, then deletes it. | a list of `✓` lines and `✓ All checks passed` |

**Migrations vs seed:** a migration changes the *shape* of the database (tables,
columns, rules). A seed puts starting *data* in. Both are repeatable.

### 1.5 Look at your data (optional, but worth it)

In Neon, open **Tables** to browse rows, or **SQL Editor** and run:

```sql
select slug, bride_name, wedding_date from weddings;
select title, starts_at from programme_items order by starts_at;
```

### If something goes wrong

| Message | Likely cause | Fix |
|---|---|---|
| `DATABASE_URL is not set` | `.env.local` missing, or the line is empty | Do step 0, then 1.3 |
| `password authentication failed` | Part of the string got cut off when copying | Copy it again from **Connect** |
| `getaddrinfo ENOTFOUND` | Typo in the host, or no internet | Copy it again; check your connection |
| First command is slow | Neon wakes a sleeping database (about 1 s) | Normal on the free plan |

**If the connection string leaks:** Neon → your project → **Roles** → `neondb_owner` →
**Reset password**, then put the new string in `.env.local`.

---

## Step 2: email (Gmail)

### What you are setting up

The app sends email through Gmail's mail server (**SMTP**). Google doesn't let apps
use your normal password, so you create an **app password**: a separate 16-letter
password that only works for sending mail, and can be deleted at any time without
touching your main password.

### 2.1 Choose the sending account

**Recommended:** create a new Gmail just for the wedding (e.g. `amaniandbaraka.wedding@gmail.com`):

- guests see it as the sender (shown as "Bride & Groom")
- replies and bounce notices land there, not in your personal inbox
- if anything goes wrong, your personal account is never at risk

Gmail allows roughly 500 recipients a day; the app stops itself at 400 (BR-17).

### 2.2 Turn on 2-Step Verification

App passwords only exist once 2-Step Verification is on.

1. Sign in to the sending account and go to **https://myaccount.google.com/security**.
2. Under "How you sign in to Google", click **2-Step Verification** → **Get started**.
3. Add your phone number and confirm the code.

### 2.3 Create the app password

1. Go to **https://myaccount.google.com/apppasswords**.
2. **App name:** `Wedding RSVP` → **Create**.
3. Google shows a 16-letter password **once**. Copy it now.

If the page says *"The setting you are looking for is not available"*, then either
2-Step Verification isn't on yet, or the account is a work/school account that
doesn't allow it. Use a personal Gmail.

### 2.4 Fill in `.env.local`

```
GMAIL_USER=amaniandbaraka.wedding@gmail.com
GMAIL_APP_PASSWORD=abcdefghijklmnop
```

Type the app password **without spaces**. Save the file.

### 2.5 Send a test email

Send it to a **different** address you can check (your personal email):

```powershell
npm run email:test -- your.personal@example.com
```

You should see `✓ Sent to …`. Open that inbox **and the spam folder**. If it landed in
spam, open it and click **Not spam**, then reply once. This teaches your mail
provider the address is trusted.

### If something goes wrong

| Message | Likely cause | Fix |
|---|---|---|
| `GMAIL_USER is missing` | Lines empty in `.env.local` | Step 2.4 |
| `Gmail rejected the login` | Normal password used, typo, or 2-Step Verification off | Use the 16-letter app password; check 2.2 |
| Sent, but nothing arrives | Spam folder, or a typo in the recipient address | Check spam; resend to the correct address |

**If the app password leaks:** https://myaccount.google.com/apppasswords → delete
"Wedding RSVP" → create a new one → update `.env.local`.

---

## Finished checklist

- [ ] `git status` does **not** list `.env.local`
- [ ] `npm run db:check` → `✓ All checks passed`
- [ ] `npm run email:test -- …` → `✓ Sent`, and the email arrived
- [ ] `TOKEN_SECRET` and the admin password are saved in a password manager

When you deploy (you'll do this yourself on Vercel), the same names and values go into
**Vercel → Project → Settings → Environment Variables**. Set `APP_URL` to the real site address.
