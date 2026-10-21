# Wedding RSVP & Guest Management — Project Specification

> Status: **Planning / pre-build**
> Prepared: 19 October 2026
> Theme: **Burgundy, Gold & White** (from the wax-seal envelope reference)
> Hosting budget: **KSh 0**

---

## 1. Overview

A personalised wedding website and guest-management system. It replaces printed invitation cards and lets the couple:

- Send every guest a **personal invitation link** (by email and WhatsApp).
- See who **received, opened and viewed** their invitation.
- Collect **RSVPs**, including named extra guests within a set seat allowance.
- **Approve or revoke** any invitation at any time.
- Issue each confirmed guest a **personalised gate pass with a QR code**, scanned at the gate on the wedding day.
- Share the **exact venue location, directions, full programme and all event details** with **approved** guests only.
- Track **headcount, dietary needs and arrivals** live from an admin dashboard.

> **Core privacy rule:** the public sees only a teaser and a "request an invitation" form. Responding "Yes" is not enough to see anything more. Story, programme, live location, dress code, FAQ, gate pass and the day-of page unlock **only after the couple approves that guest's attendance**, and lock again if the invitation is revoked. See §4a.

### Reference / inspiration

- Reference site: **https://lydia-and-chege.vercel.app/**
  - Keep: the card-opening animation, personalised "For [Guest name]" card, story section, countdown, order of the day, dress-code palette with tap-to-copy hex codes, FAQ, RSVP section, venue hidden until RSVP is confirmed, strong social-share preview image.
  - Change: navy/lilac theme → **burgundy, gold & white**; lilac sprig → **dove wax seal** motif; expand the programme; add live location, gate pass and admin.
- The original repo is not available, so this is a **fresh build** that recreates and extends the reference.

### Scope now vs later

| Now (v1) | Later (v2, resale) |
|---|---|
| One wedding (ours) | Many couples, each with their own theme, photos, venue and programme |
| Admin = the couple + planner | Couple sign-up, theme editor, billing |
| Free Vercel Hobby plan | Vercel Pro ($20/month) once it earns money — Hobby is **personal, non-commercial use only** |

**Approach for now:** build for one wedding, but **like a template**. Every couple-specific detail (names, date, colours, photos, venue, programme, FAQ, dress code) lives in the database/config — never hard-coded in components — and every table carries a `wedding_id`. Turning it into a multi-couple product later is then mostly adding a sign-up flow and a theme editor, not a rewrite.

---

## 2. Technology decisions (agreed)

**One codebase:** TypeScript + Next.js (App Router). Front end and back end in one project, deployed to Vercel from GitHub.

| Need | Choice | Notes |
|---|---|---|
| Language | **TypeScript** | One language front and back |
| Framework | **Next.js (latest stable, App Router)** | Pages + Server Actions + Route Handlers |
| Hosting | **Vercel Hobby** (free) | ~1M function invocations, 100 GB bandwidth, 60 s max function time, 5,000 image transformations / month |
| Source control | **GitHub** (free, private repo) | Push → Vercel auto-deploys |
| Database | **Neon Postgres** (free) | 1 GB storage; sleeps when idle, wakes in ~1 s; no manual unpausing (unlike Supabase free, which pauses after a week idle) |
| ORM | **Drizzle ORM** + `@neondatabase/serverless` | Typed queries, migrations via `drizzle-kit` |
| Validation | **Zod** | All form and API input |
| Styling | **Tailwind CSS** | Theme colours as CSS variables (see §3) |
| Animation | **Framer Motion** (or CSS keyframes) | Envelope/card opening |
| Email | **Nodemailer + Gmail SMTP** (app password) | Free; personal Gmail allows roughly 500 recipients/day. Requires 2-Step Verification to create an app password |
| Email templates | **React Email** | Same components/styling as the site |
| WhatsApp | **`wa.me` click-to-chat links** | Admin taps "Send on WhatsApp" → WhatsApp opens with the personal message pre-filled → sent from own phone. The official WhatsApp Cloud API charges per message, so it is out |
| QR codes (create) | **`qrcode`** | Generated server-side as SVG/PNG |
| QR codes (scan) | **`html5-qrcode`** | Ushers scan in their phone browser; no app install |
| Signed tokens | **`jose`** | Personal invite tokens, gate-pass tokens, admin session cookie |
| Admin login | Single **admin password** (env var) + signed HTTP-only cookie | Add usher accounts with a separate PIN (see §9) |
| Maps / location | **Google Maps link** (`https://www.google.com/maps/dir/?api=1&destination=LAT,LNG`) | Free; opens turn-by-turn directions on the guest's phone |
| Images | Stored in `/public`, pre-compressed **`.webp`**, `unoptimized` where large | Stays under Vercel's free image-transformation limit |
| Scheduled jobs | **Vercel Cron** (once per day on Hobby) | Daily reminder emails to non-responders |
| Analytics (optional) | Vercel Web Analytics (Hobby allowance) | Page views only |

**Total running cost: KSh 0.** Optional: a custom domain (~KSh 1,500/year), e.g. `lydiaandcharles.co.ke`.

### Things deliberately not used (cost)

- WhatsApp Cloud API (per-message fees).
- Resend/Postmark (need a paid domain to send from; 100/day cap on free Resend).
- Supabase free (pauses after 1 week inactivity).
- Paid auth services (Clerk etc.) — unnecessary for one admin.
- Google Maps JavaScript/Embed API keys — a plain link is enough and free.

---

## 3. Brand & theme — Burgundy, Gold & White

Colours sampled from the reference photo (burgundy envelope, gold wax seal with a white dove).

### Colour tokens

| Token | Hex | Use |
|---|---|---|
| `--wine-night` | `#28030A` | Darkest: footer, overlays, deepest shadows |
| `--wine` | `#3D0F19` | **Primary background** (hero, RSVP, dark sections); text colour on light sections |
| `--burgundy` | `#5E1F2D` | Cards / raised surfaces on dark sections |
| `--mulberry` | `#662A39` | Envelope flap, hover states, borders on dark |
| `--gold` | `#C9AB66` | **Accent**: monogram, seal, dividers, buttons, headings on dark |
| `--gold-antique` | `#9C6934` | Seal shadow, decorative lines, icon strokes |
| `--gold-deep` | `#8A5A26` | Gold **text** on light backgrounds (passes contrast) |
| `--pearl` | `#E2D7D1` | Dove white, secondary text on dark |
| `--ivory` | `#FAF6F2` | **Light section background** (story, programme, details) |
| `--white` | `#FFFFFF` | Card stock, primary text on dark |

### Contrast (checked, WCAG)

| Text | Background | Ratio | OK for |
|---|---|---|---|
| White `#FFFFFF` | Wine `#3D0F19` | 16.4:1 | All text |
| Gold `#C9AB66` | Wine `#3D0F19` | 7.4:1 | All text |
| Gold `#C9AB66` | Burgundy `#5E1F2D` | 5.6:1 | All text |
| Pearl `#E2D7D1` | Wine `#3D0F19` | 11.6:1 | All text |
| Wine `#3D0F19` | Ivory `#FAF6F2` | 15.3:1 | All text |
| Wine `#3D0F19` | Gold `#C9AB66` (button) | 7.4:1 | Button labels |
| Deep gold `#8A5A26` | Ivory `#FAF6F2` | 5.5:1 | All text |
| ⚠️ Gold `#C9AB66` | Ivory `#FAF6F2` | 2.1:1 | **Decoration only — never text** |

### CSS variables (starter)

```css
:root {
  --wine-night: #28030A;
  --wine: #3D0F19;
  --burgundy: #5E1F2D;
  --mulberry: #662A39;
  --gold: #C9AB66;
  --gold-antique: #9C6934;
  --gold-deep: #8A5A26;
  --pearl: #E2D7D1;
  --ivory: #FAF6F2;
  --white: #FFFFFF;
}
```

In v1 these come from `theme.ts`; in v2 they are loaded per wedding from the `weddings` table so each couple can pick colours.

### Typography

- Display / names: **Cormorant Garamond** (or Playfair Display) — elegant serif, like the reference.
- Labels / small caps / body: **Jost** or **Montserrat** — clean sans, letter-spaced for labels.
- Loaded with `next/font/google` (self-hosted at build, free, no layout shift).

### Motifs

- **Dove wax seal** in gold (replaces the lilac sprig). Use as: envelope seal, favicon, section dividers, email header.
- Monogram of the couple's initials in gold on the seal and card.
- Textured burgundy paper backgrounds (subtle, compressed `.webp`).
- Social-share image (1200×630): burgundy envelope + gold dove seal + names + date.

---

## 4. Guest-facing site (pages & sections)

### 4a. Access levels

Access is decided **on the server on every request** from the guest's personal token and their current status. Locked content is never sent to the browser — it is not hidden with CSS or JavaScript, it simply isn't in the page.

| Level | Who | Can see | Cannot see |
|---|---|---|---|
| **Public** | Anyone without a personal link (including someone who got a forwarded link to `/`) | Envelope teaser ("For our dear guest"), couple names, date, countdown, a line saying this is a private celebration, **"Request an invitation"** form | Story, photos, programme, venue, location, dress code, FAQ, contacts, gate pass |
| **Invited** | Has a personal link; awaiting response or awaiting approval | Card with **their own name**, RSVP form with their seat allowance, their current status ("Thank you — your response is with the couple for confirmation") | Everything else above |
| **Approved** | Couple has **approved** their attendance | Everything: story, full programme, **venue & live location**, dress code, good-to-know, FAQ, contacts, **gate pass**, **day-of page** | Other guests' details |
| **Declined** | Guest said no | Thank-you message; can change to "Yes" before the deadline (goes back to awaiting approval) | Everything else |
| **Not approved** | Couple declined this guest's attendance | Polite neutral message ("The couple is unable to confirm your attendance — please contact them"); cannot respond again unless the couple reopens it | Everything else; no pass |
| **Revoked** | Couple withdrew the invitation | Neutral "This invitation is no longer active" page | Everything; gate pass fails at the scanner |
| **Admin** | Couple / planner only (password) | Dashboard, guest list, settings | — guests never see the admin |
| **Usher** | Gate staff (PIN) | Scanner result: name + party size only | Guest list, contact details, settings |

Rules:
- A guest answering **"Yes" unlocks the details only once approved**. Approval is automatic within the seat allowance and venue capacity, and the couple decide the exceptions (BLUEPRINT D24).
- If the couple revokes, or an approved guest changes their answer to "No", access is removed **immediately** on the next page load, and the gate pass stops scanning.
- Share-preview image and page metadata show only names + date — no venue, no programme.
- Locked pages and personal links carry `noindex` so search engines never list them.

### Routes

| Route | Access | Purpose |
|---|---|---|
| `/` | Public | Teaser: envelope animation, names, date, countdown, "Request an invitation" form |
| `/i/[token]` | Invited and above | **Personal invitation**: envelope opens to a card with the guest's name; logs "card viewed"; RSVP form pre-filled with seat allowance. Once **approved**, the same page shows the full wedding site (sections below) |
| `/i/[token]/pass`, `/i/[token]/day` | — | Old addresses: redirect to the `#pass` and `#programme` sections of `/i/[token]` (BLUEPRINT D22) |
| `/admin` … | Admin | Dashboard, guest list, settings (see §8) |
| `/scan` | Usher (PIN) | Gate scanner |

**One page per guest (BLUEPRINT D22).** `/i/[token]` holds everything, with a section navigation bar like the reference site. For approved guests it adds the gate pass (QR), the full programme, details and, on the wedding day, a live "happening now / next" banner at the top. Any route with an invalid token redirects to `/`.

### Sections — public teaser (`/`)

1. **Envelope** — burgundy envelope, gold dove seal, "For our dear guest".
2. **Names & date** + countdown.
3. **Private celebration note** — "This is a private celebration. If you've been invited, please open the personal link sent to you."
4. **Request an invitation** (*off by default*, BLUEPRINT D21; the couple can turn it on in settings) — name, phone, email, short message. Creates a request for the couple to review (BLUEPRINT §5b).
5. **Footer** — names and date only.

### Sections — personal invitation (`/i/[token]`)

**Before approval (Invited):**
1. **Envelope opening** — tap the gold dove seal; card slides out reading "For [Guest Name]" + names + date. "Open again" button.
2. **Welcome** — "You're invited to our wedding", names, date.
3. **RSVP** — form (see §7), or their current status if already answered.

**After approval (Approved) — the full site:**
1. Envelope opening + welcome (as above)
2. **Confirmation banner** — "Your attendance is confirmed — party of 3" + **View gate pass** button
3. **Our story** — text + photos
4. **Countdown**
5. **Programme** — full order of the day (see §5)
6. **Venue & live location** (see §6)
7. **Dress code** — guidance + colour swatches with tap-to-copy hex codes
8. **Good to know** — transport, parking, children policy, gifts/contributions (M-Pesa, optional), accommodation
9. **FAQ** — accordion
10. **Contacts** — MC, head usher, transport coordinator
11. **Update my RSVP** — change party details before the deadline (changes return to awaiting approval if they add people)
12. **Footer**

---

## 5. Programme of the day (draft — edit times in admin)

Anchored on the reference site's timings. Every item is stored in the `programme_items` table so it can be edited without code changes.

| Time | Item | Detail for guests |
|---|---|---|
| 11:30 AM | **Gates open & arrival** | Present your gate pass QR at the gate; ushers guide seating |
| 12:00 PM | **Welcome & seating** | Guests seated; family seated in reserved rows |
| 12:45 PM | **Bridal party arrival** | Please be seated and silence phones |
| 1:00 PM | **Ceremony begins** | Processional, hymns, readings, sermon |
| 1:40 PM | **Vows & exchange of rings** | |
| 1:55 PM | **Signing of the register** | Special music / choir |
| 2:10 PM | **Recessional** | Couple exits; guests follow ushers' directions |
| 2:15 PM | **Cocktails & light bites** | Guests move to cocktail area / transfer to reception venue |
| 3:00 PM | **Photographs** | Family, bridal party, then guest groups (ushers will call each group) |
| 4:00 PM | **Reception: guests seated** | Find your table on the seating board |
| 4:15 PM | **Grand entrance of the couple** | |
| 4:30 PM | **Cake cutting** | |
| 4:45 PM | **Speeches & family introductions** | MC, parents, best man, maid of honour |
| 5:00 PM | **Dinner** | Buffet/served by table — dietary meals marked |
| 6:15 PM | **Gifts & well-wishes** | Gift table / M-Pesa details on the site |
| 6:45 PM | **First dance** | Then the floor opens |
| 7:00 PM | **Party** | |
| 12:45 AM | **Last dance & send-off** | |
| 1:00 AM | **Farewells** | Safe travels home |

Day-of page extras:
- **"Happening now / next"** banner computed from the current time.
- Contacts: MC, head usher, transport coordinator (tap to call / WhatsApp).
- Separate ceremony and reception venues supported (each with its own location).

---

## 6. Venue & live location

- Venue name, address, landmarks, and **latitude/longitude** stored per venue (ceremony, reception, optional traditional ceremony).
- **Never shown** to the public, to invited guests awaiting a response, or to guests who said "Yes" but are **not yet approved** ("Exact location and directions will be shared once your attendance is confirmed").
- Shown **only to approved guests** on `/i/[token]` and in the approval email:
  - **"Get directions"** button → `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG` (opens Google Maps navigation from the guest's current location).
  - **"Open in Maps"** button → `https://www.google.com/maps/search/?api=1&query=LAT,LNG`.
  - Static map image (screenshot exported once, stored in `/public`) — no paid map API.
  - Landmarks / gate directions text, parking notes, nearest stage for matatu users.
- Revoked guests, and guests who change to "No", lose access immediately (the server checks status on every load).
- The venue API/route returns **403** for any token that isn't approved, so the coordinates can't be pulled by calling the endpoint directly.

---

## 7. Guest lifecycle & RSVP rules

### Invitation statuses

> **Source of truth: [BLUEPRINT §5](BLUEPRINT.md#5-lifecycle--the-invitation)** for statuses and transitions, and **[§6](BLUEPRINT.md#6-business-rules-testable)** for the rules. They are not repeated here, so the two documents can't drift apart.

In short: `approved`, `partially_arrived` and `arrived` unlock the full site, live location and gate pass. Delivery facts (email sent, WhatsApp shared, email opened, pass emailed) are timestamps, not statuses. "Viewed" (the guest opened their personal link) is the proof of receipt.

### RSVP form fields

- Full name (pre-filled), email, phone (WhatsApp).
- Attending: Yes / No.
- **Extra guests**: up to the **seat allowance** set by the couple per invitation (default 0). For each: full name, adult/child.
- Dietary needs (per person): none, vegetarian, vegan, halal, gluten-free, allergies (text).
- Which events attending (if more than one: ceremony, reception, traditional ceremony).
- Message to the couple (optional).
- Guests can **change their response** until the RSVP deadline (set in admin).

### Rules

See [BLUEPRINT §6](BLUEPRINT.md#6-business-rules-testable) (BR-1 to BR-23) and the edge cases in [§7](BLUEPRINT.md#7-edge-cases--gotchas). Page-level consequences:

- The public "request an invitation" form creates a **request**, not an invitation. Accepting it creates the invitation and its personal link (BLUEPRINT §5b).
- After the RSVP deadline the form shows "Please contact the couple" and is read-only.

---

## 8. Admin dashboard (couple & planner)

The admin area is **only for the couple and planner**. Guests never see it.

### Overview cards
- Invited · Viewed · Not yet viewed · **Awaiting approval** · Approved · Declined · No response · Requests · Revoked
- **Approval queue**: one-tap Approve / Decline for each "Yes" response and each public request, showing party size and seat allowance
- **Total expected headcount** (guests + extras) vs **venue capacity**
- Checked in (live on the day)
- Dietary tallies (for the caterer)

### Guest list
- Search, filter by status, group (bride's family, groom's family, friends, church, work), side, event.
- Add guest manually or **import CSV** (name, phone, email, group, seat allowance).
- Per guest: copy personal link, **Send email**, **Send on WhatsApp** (opens `wa.me/<phone>?text=<message with link>`), mark as sent, revoke / restore, edit seat allowance, view timeline (sent → opened → viewed → responded → checked in).
- **Bulk actions**: send emails to selected (throttled to stay under Gmail's daily limit), revoke, change group.

### Exports
- CSV/Excel: full guest list, headcount by group, dietary list for caterer, check-in report.

### Settings
- Couple names, date, ceremony time, RSVP deadline, timezone.
- Venues (name, address, lat/lng, landmarks, parking).
- Programme items (time, title, detail, venue). The whole programme is approved-only (BLUEPRINT BR-1), so items have no visibility setting.
- Dress code text + colour swatches.
- FAQ items.
- Story text + photos.
- Contacts (MC, ushers, transport).
- Theme colours (v1: read-only display of tokens; v2: editable).

### Roles
| Role | Access |
|---|---|
| Admin (couple) | Everything |
| Planner | v1: same login and rights as the couple (BLUEPRINT D6). v2: separate login, everything except deleting data / changing the admin password |
| Usher | `/scan` only, with a shared PIN |

---

## 9. Gate pass & check-in

- Gate pass token = signed JWT (`jose`) containing `invitationId`, `weddingId`, `passVersion`. **No personal data inside.** The pass exists from the moment the couple approves; emailing it is tracked separately (BLUEPRINT D2).
- QR encodes `https://<site>/scan/v/<token>`.
- Pass page/email shows: guest name, party size ("Wanjiru + 2"), date, gate opening time, QR, "Screenshots are fine — your pass is checked live."
- **Scanner (`/scan`)**:
  - Usher enters PIN → camera opens (`html5-qrcode`).
  - On scan, server checks: valid signature, guest exists, not revoked, `passVersion` current, not already checked in.
  - Shows a large result screen: ✅ green "Welcome, Wanjiru — party of 3" or ❌ red "Revoked / Already checked in at 12:14 / Invalid".
  - Partial check-in: "2 of 3 arrived" (remaining can enter later).
  - Manual search by name for guests without a phone.
- **Offline fallback**: scanner caches the approved list (names + pass IDs) in the browser at the start of the day; if signal drops it validates locally and syncs check-ins when back online.
- Revoking or re-issuing a pass increments `passVersion`, so old screenshots fail.

---

## 10. Messages & notifications

### Email (Gmail SMTP via Nodemailer, React Email templates)

| Email | Trigger | Contents |
|---|---|---|
| Invitation | Admin sends | Personal greeting, card image, "Open your invitation" button (personal link), RSVP deadline, tracking pixel |
| RSVP received | Guest submits | Summary of response and party; "your response is with the couple for confirmation". **No venue, programme or pass** |
| Approval + gate pass | Couple approves | Gate pass QR, programme summary, **Get directions** button, dress code, contacts — the first message that contains event details |
| Reminder: no response | Daily cron, X days before deadline | Gentle nudge, link |
| Reminder: day before | Cron, day before (**approved guests only**) | Pass, gate time, directions, weather tip |
| Revoked | Admin revokes (optional, can be silent) | Polite notice |

Sending limits: Gmail personal ≈ 500 recipients/day; the app caps itself at 400 (BR-17). Every send goes through the queue. The admin's **"Send now"** is the main way to send: it works through the queue in small batches until it is empty or the daily cap is reached. The daily cron is only a safety net (BLUEPRINT D7).

### WhatsApp (free, manual send)

Pre-filled `wa.me` message template, editable in settings:

```
Hello {firstName}! 💌
{brideName} & {groomName} warmly invite you to our wedding on {date}.
Open your personal invitation and RSVP here: {personalLink}
Kindly respond by {rsvpDeadline}.
```

Clicking "Send on WhatsApp" marks `whatsapp_shared_at` (proof the link was sent; "viewed" still comes from the link being opened).

---

## 11. Data model (Neon Postgres via Drizzle)

> **Source of truth: the code, [`server/db/schema.ts`](../server/db/schema.ts).** Entities and the constraints that enforce correctness are summarised in [BLUEPRINT §8](BLUEPRINT.md#8-data-model-sketch).

Tables: `weddings`, `admin_settings`, `venues`, `programme_items`, `faq_items`, `dress_code`, `contacts`, `photos`, **`invitations`** (one per household; earlier drafts called it `guests`), `invitation_requests` (public requests, kept separate until accepted), `party_members`, `rsvp_events`, `check_ins`, `email_queue`, `activity_log`, `rate_limits`.

Top-level tables carry `wedding_id` for future multi-couple use. Child tables (`party_members`, `rsvp_events`) reach it through their invitation.

Storage estimate for 500 guests: well under 10 MB — far inside Neon's 1 GB free.

---

## 12. Security & privacy

- Invite tokens: 32 bytes, URL-safe, unguessable; only a **hash** is stored in the DB. How they are made, and why `TOKEN_SECRET` must never change once invitations go out: BLUEPRINT D1.
- Gate pass: signed JWT, checked live; `passVersion` invalidates old passes.
- Admin: password stored as an env var hash (scrypt, BLUEPRINT D4); session in a signed, HTTP-only, `SameSite=Lax` cookie; rate-limit login attempts. Changing the password ends every session (D5).
- Usher PIN: hashed; scanner endpoints only return name + party size. Changing the PIN, or "sign out all ushers", ends every usher session (D5).
- **Approval gate in one place:** a single server helper (`requireApproved(token)`) used by every page, server action and API route that returns locked content (story, programme, venue, dress code, FAQ, contacts, pass, day-of). Locked data is fetched only after it passes, so it never reaches the browser of an unapproved visitor.
- Gate-pass tokens are only issued at approval and are checked live at the gate.
- Story and venue photos are served through the same gate (or use unguessable file names), not as plain public images.
- `noindex` on `/i/*`, `/admin`, `/scan`; `Referrer-Policy: no-referrer` (as the reference does).
- No guest phone numbers or emails in URLs except the `wa.me` link the admin opens.
- Kenya Data Protection Act: short privacy note on the RSVP form ("Your details are used only for this wedding and deleted afterwards"); admin button to **delete all guest data** after the wedding.

---

## 13. Project structure

> **Source of truth: the [README's project structure](../README.md#project-structure).**

The code is built **backend first**: all logic lives in `server/` as plain TypeScript, tested directly (Vitest + PGlite), and `app/` pages, server actions and API routes are thin wrappers that call it. Pages and components are built after the backend is complete.

### Environment variables (`.env.example`)

```
DATABASE_URL=            # Neon connection string
APP_URL=                 # https://<project>.vercel.app
TOKEN_SECRET=            # ≥32 random chars; never change after invites go out (BLUEPRINT D1)
ADMIN_PASSWORD_HASH=     # scrypt hash from scripts/hash-password.ts
GMAIL_USER=              # sending Gmail address
GMAIL_APP_PASSWORD=      # Gmail app password (needs 2-Step Verification)
CRON_SECRET=             # protects cron routes
```

---

## 14. Staying inside the free limits

| Limit | Guard |
|---|---|
| Gmail ≈ 500 recipients/day | Email queue, cap of 400 per Kenya calendar day, daily counter shown in admin (BR-17) |
| Vercel cron = daily on Hobby | "Send now" in admin drains the queue in small batches, each well inside the function time limit; the daily cron is a safety net (D7). Number of cron jobs allowed per project: check when deploying; the three jobs can be merged into one if needed |
| Vercel function time 60 s | Keep each request small; batch emails in the queue |
| 5,000 image transformations/month | Pre-compress images to `.webp`; use `unoptimized` for large backgrounds |
| Neon compute sleeps when idle | First request after idle takes ~1 s — acceptable; warm it up on the wedding morning by opening the admin |
| Vercel Hobby = non-commercial | Fine for our wedding; move to Pro before charging other couples |

---

## 15. Build order

### Phase 0 — Setup (½ day)
- [ ] Create GitHub repo, Next.js + TypeScript + Tailwind
- [ ] Create Neon project, add `DATABASE_URL`
- [ ] Connect repo to Vercel, add env vars
- [ ] Drizzle schema + first migration + seed (wedding, venues, programme, FAQ)

### Phase 1 — Theme & public teaser (2 days)
- [ ] Theme tokens, fonts, layout
- [ ] Envelope opening animation with gold dove seal
- [ ] Public teaser: names, date, countdown, private-celebration note, request-an-invitation form
- [ ] Social-share image + metadata (names + date only)

### Phase 2 — Personal invitations, RSVP & approval gate (3 days)
- [ ] Token generation, `/i/[token]` with guest's name on the card
- [ ] `requireApproved()` server helper + access levels (§4a)
- [ ] "Card viewed" tracking
- [ ] RSVP form with seat allowance, extras, dietary, events, deadline
- [ ] Approved-only sections: story, programme, venue, dress code, FAQ, contacts
- [ ] Public "request invitation" flow (pending approval)

### Phase 3 — Admin (3–4 days)
- [ ] Login, dashboard counts, guest list, filters, guest timeline
- [ ] Add guest / CSV import
- [ ] Send email (queue + Gmail), Send on WhatsApp (`wa.me`), copy link
- [ ] Approval queue (responses + public requests); approve / decline / revoke / restore; seat allowance edit
- [ ] Settings: wedding details, venues, programme, FAQ, dress code, contacts
- [ ] CSV exports (guest list, dietary, headcount)

### Phase 4 — Confirmed-guest features (2 days)
- [ ] Gate pass page + QR + confirmation email
- [ ] Day-of page: full programme, "happening now", directions buttons, contacts
- [ ] Email open pixel
- [ ] Daily reminder cron

### Phase 5 — Gate day (2 days)
- [ ] Usher PIN login, `/scan` with camera
- [ ] Live verification, party-size and partial check-in
- [ ] Offline cache + sync
- [ ] Live check-in counter on dashboard

### Phase 6 — Test & launch (1–2 days)
- [ ] Test on Android + iPhone, Safari + Chrome, slow 3G
- [ ] Send test invites to friends; full dry run of revoke → scan fails
- [ ] Access test: public, invited, "Yes" but not approved, approved, declined, revoked — confirm each sees only what §4a allows, including by calling the API routes directly. `npm run access:check` passes on the dev server (21 Oct 2026); repeat it on the deployed site.
- [ ] Accessibility pass (contrast, tap targets ≥44 px, keyboard)
- [ ] Send invitations **6–8 weeks** before the wedding (between **24 October and 7 November** for 19 December; WhatsApp-shared links can go out before email is finished)

---

## 16. Content checklist (from the couple)

- [ ] Couple names as they should appear; monogram initials
- [ ] Date, ceremony start time, gate opening time
- [ ] RSVP deadline
- [ ] Ceremony venue: name, address, landmarks, Google Maps pin (lat/lng), parking
- [ ] Reception venue (if different): same details
- [ ] Final programme with times
- [ ] Story text + 4–8 photos (couple, details, venue)
- [ ] Dress code text + colours (burgundy-friendly palette, e.g. burgundy, gold, champagne, ivory, sage)
- [ ] FAQ answers (children, plus-ones, transport, gifts, dietary, changing response)
- [ ] Contacts: MC, head usher, transport coordinator
- [ ] Guest list CSV: name, phone, email, group, side, seat allowance
- [ ] Optional: M-Pesa Paybill/Till for contributions
- [ ] Gmail address to send from (+ app password)

---

## 17. Later: turning it into a product (v2)

- Couple sign-up and onboarding wizard (names, date, venue, upload photos).
- **Theme editor**: pick colours (stored in `weddings.theme`), fonts, envelope/seal style, motif.
- Subdomain or path per wedding (`/w/[slug]` or `slug.yourbrand.co.ke`).
- Photo uploads → Vercel Blob or Cloudinary free tier.
- Optional paid add-ons: official WhatsApp API sending, custom domain, Resend with own domain.
- Payments via M-Pesa (Daraja API) per wedding, one-time pricing.
- Move to **Vercel Pro** once charging couples.
- Usher accounts per wedding, planner multi-wedding view.
