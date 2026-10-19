# Wedding RSVP & Guest Management — Project Blueprint

> Companion to [`PROJECT_SPEC.md`](PROJECT_SPEC.md) (stack, colours, pages, folder structure).
> This blueprint defines **behaviour**: who acts, how an invitation moves, the rules, and the edge cases.
> Prepared 19 October 2026 · Wedding date 12 December 2026 · Items marked **[ASSUMPTION]** need confirming.

---

## 0. The problem, restated

Printed invitation cards can't be tracked. You don't know who received one, guests claim they never got it, extra people turn up, and on the day there's no reliable way to check who was actually invited. Headcount for catering is a guess.

The system replaces printed cards with **personal online invitations**. The couple sends each guest a private link, sees whether it was opened, collects a response with named extra guests, and **personally approves** who attends. Only approved guests can see the venue, programme and other details, and only they receive a gate pass that is checked at the gate on the day. The couple can withdraw any invitation at any time, and it stops working everywhere immediately.

### Project type

**Workflow / transactional app** (primary). One central object, the **invitation**, moves through a lifecycle with approvals, and access depends on its state.
Mixed with **CRUD / content app** (secondary): the couple manages wedding content (programme, venue, FAQ, guest list).
Plus a small **real-time** slice: gate check-in on the wedding day, where speed and connectivity matter.

| Section | Weight here |
|---|---|
| Actors, lifecycle, business rules, data model | **Central** |
| Edge cases, security/privacy | **Central** |
| Non-functional (gate day) | Important but narrow |
| Public contract (API/SDK) | **Not applicable** — no outside system calls this app; internal routes only |
| Data pipeline / ML | **Not applicable** |

---

## 1. Context & problem

**Today:** physical cards handed out or sent, with responses by phone or WhatsApp to whoever is coordinating.

**Why it hurts:**
- **No record of delivery** — "I never got an invitation" can't be disproved.
- **No control after sending** — a card can't be taken back; forwarded or photographed cards bring uninvited people.
- **Unknown headcount** — guests bring unannounced extras, so catering and seating are guesses.
- **Scattered information** — venue, directions and timings get repeated over many calls and messages.
- **Gate confusion** — ushers have no reliable list; anyone confident can walk in.
- **Cost** — printing and delivering cards.

---

## 2. The system in one sentence

> **The couple** sends each guest a **personal invitation link** → the guest opens it and responds with their named party → **the couple approves** them → the approved guest unlocks the venue, programme and a **gate pass** that ushers scan on the day — **with the guarantee that no one sees event details or gets through the gate unless the couple has approved them, and that approval can be withdrawn at any moment.**

---

## 3. What it must do

### Essential (v1)

| # | Use case |
|---|---|
| U1 | **Couple** can add guests (one by one or from a CSV) with a seat allowance, so each household is invited for a fixed number of people. |
| U2 | **Couple** can send each guest their personal link by email or WhatsApp, so the invitation reaches them on the channel they use. |
| U3 | **Couple** can see, per guest, when the invitation was sent, opened and viewed, so "I never saw it" can be checked. |
| U4 | **Guest** can open their personal card showing their own name, so the invitation feels personal and identifies them. |
| U5 | **Guest** can respond Yes/No and name each person coming (within their allowance), with dietary needs, so the couple knows exactly who is coming. |
| U6 | **Couple** can approve, decline or revoke any guest, so the couple alone decides who attends. |
| U7 | **Approved guest** can see the full programme, venue, live directions, dress code, FAQ and contacts, so they know where to be and when. |
| U8 | **Approved guest** receives and can reopen a gate pass with a QR code, so they can enter on the day. |
| U9 | **Usher** can scan a pass and instantly see "admit X people" or "refuse", so the gate is fast and controlled. |
| U10 | **Couple** can see live totals (approved headcount, dietary counts, arrivals), so catering and seating are planned on real numbers. |
| U11 | **Member of the public** can request an invitation, so people who were missed can ask without the couple publishing any details. |
| U12 | **Couple** can edit wedding content (programme, venues, FAQ, dress code, story) without changing code. |

### Nice-to-have (v1 if time allows)

| # | Use case |
|---|---|
| N1 | Automatic daily reminder to guests who haven't responded. |
| N2 | Day-of page with "happening now / next". |
| N3 | Offline gate scanning with later sync. |
| N4 | CSV export for caterer (dietary list) and seating. |
| N5 | "Notify all approved guests" broadcast when the programme or venue changes. |
| N6 | Table/seating assignment shown on the gate pass. |

---

## 4. Actors & roles

| Actor | How they are identified | May do (capability) | May never |
|---|---|---|---|
| **Public visitor** | No token | See teaser (names, date, countdown); submit an invitation request | See any event detail; get a pass |
| **Invited guest** | Personal invite token | View their own card; respond; edit their response until the deadline | See event details or a pass before approval; see other guests |
| **Approved guest** | Personal token + status approved | Everything an invited guest can, plus full event details, location, gate pass, day-of page | See other guests; change their own approval |
| **Couple (admin)** | Admin password session | Everything: guests, approvals, revocations, content, settings, exports, data deletion | — |
| **Planner** | Admin session (shared or separate login) **[ASSUMPTION: same login as couple in v1]** | Same as couple except change admin password or delete all data | — |
| **Usher** | Shared gate PIN | Open scanner; scan; search a name at the gate; record arrivals | See phone numbers, emails, guest list outside the scanner, settings |
| **System (scheduler)** | Cron secret | Send queued emails; send reminders; switch site to "thank you" after the wedding | Approve or revoke anyone |

**Capability vs action:** every action is written to the activity log with *who* did it (actor + which usher device/admin session) and *when*, separate from what their role permits.

---

## 5. Lifecycle — the invitation

The central object is an **invitation** (one per household/party), not an individual person.

```
                         ┌──────────── couple rejects ───────────► REQUEST_REJECTED (end)
REQUESTED (public form) ─┤
                         └──── couple approves request ──┐
                                                         ▼
                          DRAFT ──send──► SENT ──open link──► VIEWED
                                            │                    │
                                            └────────┬───────────┘
                                                     │ guest responds
                                   ┌─────────────────┴─────────────────┐
                                   ▼                                   ▼
                          AWAITING_APPROVAL (said Yes)            DECLINED (said No)
                                   │         │                         │
                      couple approves   couple declines        guest changes to Yes
                                   │         │                 (before deadline) ──► AWAITING_APPROVAL
                                   ▼         ▼
                               APPROVED   NOT_APPROVED (end, can be reopened by couple)
                                   │
                         gate pass issued (automatic on approval)
                                   ▼
                              PASS_ISSUED ──scan──► PARTIALLY_ARRIVED ──scan──► ARRIVED

  From ANY state except ARRIVED: couple revokes ──► REVOKED (couple can restore → previous state)
```

### Transitions

| From → To | Triggered by | Captured |
|---|---|---|
| — → REQUESTED | Public visitor submits request form | name, phone, email, message, timestamp, IP hash |
| REQUESTED → DRAFT | Couple approves request | admin, timestamp; seat allowance set |
| REQUESTED → REQUEST_REJECTED | Couple rejects request | admin, timestamp, optional reason (internal) |
| — → DRAFT | Couple adds guest / CSV import | admin, source, seat allowance |
| DRAFT → SENT | Couple sends email or taps "Send on WhatsApp" | channel, timestamp (per channel) |
| SENT → VIEWED | Guest opens personal link (card animation shown) | first & last viewed time, view count |
| *(side event)* email opened | Tracking pixel loads | timestamp — **does not change state** (unreliable) |
| SENT/VIEWED → AWAITING_APPROVAL | Guest submits "Yes" | party members, dietary, events, timestamp |
| SENT/VIEWED → DECLINED | Guest submits "No" | timestamp, optional message |
| DECLINED → AWAITING_APPROVAL | Guest changes to "Yes" before deadline | new party, timestamp |
| AWAITING_APPROVAL → APPROVED | Couple approves | admin, timestamp; pass token issued; approval email queued |
| AWAITING_APPROVAL → NOT_APPROVED | Couple declines attendance | admin, timestamp, optional message to guest |
| APPROVED → AWAITING_APPROVAL | Guest **adds** a person to their party | old vs new party; pass version bumped |
| APPROVED → DECLINED | Guest changes to "No" | timestamp; pass version bumped |
| APPROVED → PASS_ISSUED | System, right after approval email is sent | send timestamp |
| PASS_ISSUED → PARTIALLY_ARRIVED / ARRIVED | Usher scans and admits N people | usher device, count admitted, timestamp |
| any (except ARRIVED) → REVOKED | Couple revokes | admin, timestamp, reason (internal); pass version bumped |
| REVOKED → previous state | Couple restores | admin, timestamp; new pass version if previously approved |

Approval is **never automatic**. **[ASSUMPTION: confirm]**

---

## 6. Business rules (testable)

### Access
- **BR-1** Event details (story, photos, programme, venues, coordinates, dress code, FAQ, contacts, day-of page, pass) are returned **only** for invitations in APPROVED, PASS_ISSUED, PARTIALLY_ARRIVED or ARRIVED.
- **BR-2** Every other state, and every request without a valid token, receives none of that data — not in HTML, not in API responses, not in emails.
- **BR-3** Access is evaluated on **every request** from the current database state; nothing is cached per guest in the browser that grants access.
- **BR-4** An invalid, unknown or malformed token behaves exactly like "no token" (public teaser), without revealing whether the token ever existed.

### RSVP
- **BR-5** Party size = 1 (primary guest) + named extras; extras ≤ seat allowance. Submissions exceeding it are rejected with a clear message.
- **BR-6** Every party member needs a full name; adult/child flag; dietary choice (default "none").
- **BR-7** Responses and edits are accepted until the RSVP deadline (Africa/Nairobi time). After it, the form is read-only for guests; admins can still edit. **[ASSUMPTION: deadline 14 November 2026, four weeks before]**
- **BR-8** Adding a person after approval returns the invitation to AWAITING_APPROVAL. Removing a person or changing dietary details keeps it APPROVED and updates the pass immediately.
- **BR-9** Submitting the same response twice (double-tap, retry) produces one record, not two.

### Approval & capacity
- **BR-10** Only admins can approve, decline, revoke or restore.
- **BR-11** Approving when approved headcount would exceed venue capacity shows a warning with the overflow number and requires a second confirmation; it does not hard-block. **[ASSUMPTION]**
- **BR-12** Reducing a seat allowance below a guest's current party size is blocked until the admin removes named people (the admin chooses who).

### Gate
- **BR-13** A scan admits only if: signature valid, pass version current, invitation not revoked, state is PASS_ISSUED or PARTIALLY_ARRIVED, and arrived count < party size.
- **BR-14** Arrived count can never exceed party size, even with two ushers scanning the same pass at the same moment.
- **BR-15** A scan of a fully arrived pass shows "Already admitted — N of N at HH:MM" and the usher who admitted them.
- **BR-16** Ushers can admit fewer than the full party ("2 of 3 now"); the rest can be admitted later on the same pass.

### Messaging
- **BR-17** The system never sends more than **400 emails per calendar day** (safety margin below Gmail's ~500). Extra sends queue for the next day. **[ASSUMPTION]**
- **BR-18** No email to a guest who isn't approved contains venue, coordinates, programme detail or a pass.
- **BR-19** Reminders go only to SENT/VIEWED (no response) guests, at most once every 3 days, stopping at the deadline. **[ASSUMPTION]**

### Data
- **BR-20** Phone numbers are stored in international format (`+2547XXXXXXXX`); `07…`, `7…` and `254…` inputs are normalised.
- **BR-21** Two invitations can't share the same normalised phone number within one wedding; adding a duplicate shows the existing guest instead.
- **BR-22** Guests are never hard-deleted during the event — removal is REVOKED. Hard deletion happens only in the post-wedding purge.
- **BR-23** All guest personal data is deleted **30 days after the wedding** unless the couple exports and extends. **[ASSUMPTION]**

---

## 7. Edge cases & gotchas

| # | Scenario | Correct behaviour |
|---|---|---|
| E1 | Guest **double-taps Submit** or the request retries on a slow network | One response saved (upsert keyed on invitation); the button disables on submit; the second request returns the same result. |
| E2 | Personal link is **forwarded** to someone else | They see the original guest's name and status only. They could respond on that guest's behalf — mitigated because the couple approves every "Yes" and sees the named party. Optional: ask for the last 4 digits of the guest's phone before responding. **[ASSUMPTION: off by default]** |
| E3 | Approved guest **screenshots the pass and shares it** | First scan wins (BR-13/14). Later scans show "Already admitted at 12:14 by Gate 1". Usher can check names on the screen against the person. |
| E4 | Couple **revokes on the wedding day** while a scanner is **offline** | Offline cache can't know. Mitigation: scanner shows "last synced HH:MM"; it re-syncs automatically every minute when online; revocations on the day should be phoned to the head usher. Online scans always reflect revocation instantly. |
| E5 | Two ushers scan the **same pass at the same second** | Database update is conditional (`arrived_count + n ≤ party_size`); one succeeds, the other gets "already admitted". |
| E6 | Approved guest **adds a person** after receiving the pass | Back to AWAITING_APPROVAL (BR-8); the old pass stops working until re-approved, and the guest sees "your change is with the couple". |
| E7 | Approved guest **changes to "No"** | Access removed; pass invalid; seats freed in totals; couple notified in the dashboard. |
| E8 | **Programme or venue changes** after approval emails went out | Website always shows the latest version. Emails link to the live page rather than relying on the email text. Admin can send a "details updated" message to all approved guests (N5). |
| E9 | **Gmail daily limit** reached mid-batch | Remaining emails stay queued and send next day; dashboard shows "X queued". Admin can switch those guests to WhatsApp sharing. |
| E10 | **Gmail app password revoked** or Google blocks sign-in | Sends fail; queue marks them failed with the error; dashboard shows a red banner. Nothing is marked "sent" unless Gmail accepted it. |
| E11 | **Wrong or bouncing email address** | Bounces arrive in the couple's Gmail inbox (can't be read automatically for free). Admin can mark "bounced" and resend via WhatsApp. |
| E12 | **Email "opened" but guest says they didn't see it** (or vice versa) | Opens are shown as a hint only (Apple Mail preloads images; some clients block them). "Viewed" (card opened on the site) is the record of receipt. |
| E13 | **Same person invited twice** (e.g. by bride's and groom's sides), or a **public request** from someone already invited | Duplicate phone is detected (BR-21); admin sees "already invited by…" and can merge. |
| E14 | Guest **responds after the deadline** | Form is read-only with "Please contact the couple"; admin can still record their response. |
| E15 | Guest outside Kenya (**different timezone**) | Countdown, programme and deadline always display in Africa/Nairobi time, labelled "EAT". |
| E16 | **Database asleep** (Neon free tier idles) on the first request | First load takes about a second longer. On the wedding morning, open the admin once before gates open to wake it. |
| E17 | **No signal at the gate** | Offline scanning (N3) with cached approved list; manual name search; sync when back online. If N3 isn't built, ushers use a printed approved list as backup. |
| E18 | Guest has **no smartphone / no pass** | Usher searches by name in the scanner and admits manually; logged as "manual admit". |
| E19 | **Spam** on the public request form | Honeypot field + rate limit per IP + optional Cloudflare Turnstile (free). Requests never unlock anything without approval anyway. |
| E20 | Someone **guesses tokens** | Tokens are 32 random bytes (unguessable); failed lookups are rate-limited; invalid tokens look like the public page (BR-4). |
| E21 | Two admins **edit the same guest** at once | Save checks `updated_at`; the second save gets "This guest was changed — reload" instead of silently overwriting. |
| E22 | Couple **revokes by mistake** | Restore returns the previous state; if they were approved, a fresh pass is issued (old screenshots stay invalid). |
| E23 | **After the wedding** | Site switches to a thank-you page; passes stop working; data purge runs on schedule (BR-23). |
| E24 | Admin **forgets the password** | Reset by changing the password hash in Vercel's environment settings and redeploying. Documented in README. |
| E25 | **Children** in a party | Counted separately (adults / children) in totals and the catering export. |

### One-way actions (can't be undone)
- Emails and WhatsApp messages, once sent.
- A guest having seen the venue (approval then revoke doesn't "unsee" it).
- Post-wedding data purge.
- Check-ins (an admin can correct the count, but the log keeps the original entry).

---

## 8. Data model (sketch)

Full field list is in the spec (§11). Fields that **enforce correctness**:

| Entity | Key fields | Constraints / why |
|---|---|---|
| `weddings` | id, date, timezone, rsvp_deadline, capacity, theme | One row in v1; every other table references it (future multi-couple). |
| `invitations` (called `guests` in the spec) | id, wedding_id, **status**, seat_allowance, **phone (E.164)**, **invite_token_hash**, **pass_version**, arrived_count, all timestamps, `updated_at` | Unique (wedding_id, phone); unique token hash; `arrived_count ≤ party_size`; status is an enum of §5 states only. |
| `party_members` | id, invitation_id, name, is_child, dietary, is_primary | Exactly one primary per invitation; count − 1 ≤ seat_allowance (checked on save). |
| `rsvp_events` | invitation_id, event, attending | Unique (invitation_id, event). |
| `venues`, `programme_items`, `faq_items`, `dress_code`, `contacts`, `photos` | wedding_id, content, sort_order, visibility | Content only; all served through the approval check. |
| `email_queue` | invitation_id, template, status, attempts, error, sent_at | Daily send counter derived from `sent_at`. |
| `check_ins` | invitation_id, count, usher_device, method (scan/manual), at | Append-only log behind `arrived_count`. |
| `activity_log` | actor, action, invitation_id, meta, at | Append-only audit trail of every state change. |

---

## 9. Non-functional requirements

| Area | Requirement |
|---|---|
| **Mobile-first** | Every guest page works on a mid-range Android phone; tap targets ≥ 44 px. |
| **Performance** | Invitation page usable within ~3 s on a slow 3G connection; images pre-compressed `.webp`; card animation doesn't block the RSVP form. |
| **Gate speed** | Online scan result in under 1 s after the database is awake; ~300 arrivals in 90 minutes (≈ 3–4 per minute per gate) is comfortably within limits. |
| **Scale** | Up to ~600 invitations / ~1,500 people per wedding. |
| **Availability** | Wedding day is the only critical window; printed approved list as a fallback. |
| **Security & privacy** | Server-side approval gate (BR-1–4); no personal data in URLs or QR codes; admin cookie HTTP-only and signed; Kenya Data Protection Act notice and purge (BR-23). |
| **Cost** | KSh 0 running cost within the free limits listed in the spec §14. |
| **Maintainability** | Couple-specific content lives in the database, not code; one helper enforces approval; README covers setup, password reset and the wedding-day checklist. |
| **Accessibility** | Text contrast ≥ 4.5:1 (palette checked in the spec §3); works with screen readers; animation respects "reduce motion". |

---

## 10. External interfaces & integrations

| Interface | Used for | If slow / down / misbehaving |
|---|---|---|
| **Gmail SMTP** (Nodemailer) | All emails | Queue + retry with backoff (max 3 attempts); failures visible in dashboard; WhatsApp as manual fallback. |
| **WhatsApp `wa.me` links** | Sending personal links from the couple's own phone | No server dependency. If WhatsApp isn't installed, the link opens WhatsApp Web. The app can't confirm delivery — only records that the admin tapped "send". |
| **Google Maps URLs** | Directions / location | Plain links; if Maps is unavailable the written address and landmarks are still on the page. |
| **Neon Postgres** | All data | Short cold start when idle; if unreachable, guest pages show "Please try again in a moment" (never a page with missing locks); scanner falls back to offline cache. |
| **Vercel Cron** | Daily queue processing, reminders, post-wedding switch | If a run fails, the next day's run picks up everything still pending (jobs are idempotent). |
| **Vercel hosting** | Site & server code | Platform outage is outside our control → printed list backup at the gate. |
| **Cloudflare Turnstile** (optional, free) | Bot protection on public request form | If it fails to load, fall back to honeypot + rate limit; never block an approved guest's pages. |
| **Camera (browser)** | Scanning QR codes | If permission is denied, the scanner shows manual name search. |

No external system calls into this app, so there is **no public API contract** to version.

---

## 11. Constraints & assumptions

### Constraints (fixed)
- One codebase: **TypeScript + Next.js**, hosted on **Vercel Hobby**; **Neon Postgres**; **Gmail SMTP**; **WhatsApp share links** (see spec §2).
- **KSh 0** running cost.
- Vercel Hobby is **personal / non-commercial** — fine for this wedding; reselling requires Pro.
- **Timeline:** invitations should go out between **17 and 31 October 2026** (6–8 weeks before 12 December). Phases 0–3 of the spec's build order come first.
- Built by one developer.
- Theme: burgundy, gold and white (spec §3).

### Assumptions to confirm

| ID | Assumption (default) |
|---|---|
| A1 | Every "Yes" needs the couple's approval — never automatic. |
| A2 | One invitation = one household/party; default seat allowance **0 extras** unless set. |
| A3 | RSVP deadline **14 November 2026**. |
| A4 | Ceremony and reception **[same venue / different venues?]** — the system supports both. |
| A5 | Couple and planner share **one admin login** in v1. |
| A6 | Ushers share **one gate PIN**; each scanner device is named (e.g. "Gate 1"). |
| A7 | Over-capacity approval = **warning, not block**. |
| A8 | Forwarded-link phone verification **off** by default. |
| A9 | Daily email cap **400**; reminders every **3 days** until the deadline. |
| A10 | Guest data deleted **30 days after** the wedding. |
| A11 | The public "request an invitation" form is **on**. |
| A12 | Gates open **11:30 AM**; ceremony **1:00 PM** (from the reference site). |
| A13 | Offline gate scanning (N3) is **nice-to-have**; a printed approved list is the guaranteed backup. |

---

## 12. Non-goals (v1)

- Multi-couple sign-up, theme editor, billing (v2).
- Payments or M-Pesa integration (contribution details can be shown as text only).
- Official WhatsApp API / automated WhatsApp sending.
- Guest accounts or passwords — the personal link is the identity.
- Seating plan editor (table number may be added as a field — N6).
- Gift registry, guest photo uploads, live streaming.
- Native mobile apps.
- Automatic email-bounce processing.
- Multiple languages (English only in v1). **[ASSUMPTION]**

---

## 13. Cross-cutting concerns

| Concern | Approach |
|---|---|
| **Authentication** | Guests: personal token (no login). Admin: password → signed cookie. Ushers: PIN → short-lived signed cookie per device. Cron: secret header. |
| **Authorization** | One function, `requireApproved(token)`, guards every route/action that returns locked content; `requireAdmin()` and `requireUsher()` guard their areas. No other code path returns locked data. |
| **Audit trail** | Every transition in §5 and every check-in is written to `activity_log` / `check_ins`, append-only. |
| **Validation** | All input validated on the server (Zod), regardless of what the browser checked. |
| **Testing the key rules** | Automated tests for: BR-1–4 (each state sees exactly the right data, including direct API calls), BR-5, BR-8, BR-9, BR-13–16 (including simultaneous scans), BR-17, BR-20/21. |
| **Observability** | Dashboard banner for failed emails and queue length; Vercel runtime logs for errors; scanner shows last-sync time. |
| **Sensitive data** | Phone numbers and emails never appear in URLs, QR codes, logs or usher screens; purge after the event; privacy note on forms. |

---

## 14. Ownership & seams

Built by one person, but split into modules so each can be finished and tested on its own. Build in this order — each depends on the ones above it.

| # | Module | Depends on | Produces (seam others rely on) |
|---|---|---|---|
| 1 | **Foundation** — DB schema, status enum, seed, theme tokens | — | Table definitions; the list of states in §5 |
| 2 | **Tokens & access** — token create/hash, `requireApproved`, `requireAdmin`, `requireUsher` | 1 | The single access check every other module calls |
| 3 | **Guest site** — teaser, personal card, RSVP, approved-only sections | 1, 2 | RSVP writes in the agreed shape; "viewed" events |
| 4 | **Admin** — guest list, approval queue, revoke/restore, content settings, exports | 1, 2 | State transitions, all logged |
| 5 | **Messaging** — email queue + templates, WhatsApp link builder, reminders cron | 1, 2, 4 | Queue records; "sent" timestamps |
| 6 | **Gate pass & scanner** — pass page, QR, verify endpoint, check-in, offline cache | 1, 2, 4 | Check-in records; arrived counts |

**Key seams to agree once and not change casually:**
- The **status enum** and allowed transitions (§5).
- The **token format** (invite token vs pass token, pass version).
- The **`requireApproved` contract** — input token, output invitation or "not allowed".
- The **email queue record** shape.

---

## 15. Deliverables & definition of done

### Deliverables
1. Deployed site on Vercel (`.vercel.app` or custom domain) with the burgundy/gold/white theme.
2. Admin dashboard and gate scanner.
3. Seeded wedding content (programme, venues, FAQ, dress code, story).
4. Email templates (invitation, response received, approval + pass, reminders).
5. README: setup, environment variables, password reset, wedding-day checklist.
6. Guest-list CSV template for import.

### Done when
- [ ] Each access level in the spec §4a sees **exactly** what it should — verified for public, invited, awaiting approval, approved, declined, not approved and revoked, including by calling routes directly.
- [ ] A full guest journey works end to end on Android and iPhone: send → view → respond → approve → pass → scan.
- [ ] Revoking makes the link and pass fail immediately (online).
- [ ] Simultaneous scans of one pass never over-admit.
- [ ] Party size can't exceed the seat allowance; adding a person after approval needs re-approval.
- [ ] Double submissions create one response.
- [ ] Email queue respects the daily cap and recovers from failures.
- [ ] Dashboard totals (headcount, adults/children, dietary) match the database.
- [ ] Gate-day dry run with two phones, including no-signal and manual-admit cases.
- [ ] Contrast, tap targets and reduced-motion checked.
- [ ] Post-wedding purge tested on a copy of the data.
- [ ] All assumptions in §11 confirmed or replaced.
