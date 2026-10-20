@AGENTS.md

# Project guidelines

Two documents define this project. Read the relevant sections before building a feature.

- `docs/PROJECT_SPEC.md`: **what to build with**. Stack, theme and colours, pages and routes, data fields, free-tier limits, build phases.
- `docs/BLUEPRINT.md`: **how it must behave**. Actors, the invitation lifecycle (§5), business rules BR-1 to BR-23 (§6), edge cases E1 to E25 (§7), definition of done (§15).

Where they disagree, **the blueprint wins on behaviour**: status names and transitions, rules and edge cases. The spec wins on stack, styling and layout. Each fact lives in one document only; the other links to it.

When a design choice changes or refines a rule, record it in the blueprint's **Decisions log (§16)** as D6, D7, … and update the affected sections. Never silently edit a rule. Cite decisions in code like rules (`// D2`).

## How the code is built: backend first

- All logic lives in `server/` as plain TypeScript with no React or Next.js imports. Services take a `db: Db` argument so tests can pass in a PGlite database.
- Every rule (BR-x) and edge case (E-x) gets a test in `tests/` before it is considered done. Run `npm test`.
- `app/` pages, server actions and API routes stay thin: parse input, call a service, map `AppError.status` to the response (`server/http.ts`).
- Route handlers read the request (headers, params, body) **before** any `try/catch`. With Cache Components, Next.js leaves prerendering by throwing when the request is first read; catching that breaks it.
- Schema changes: edit `server/db/schema.ts`, then `npm run db:generate`, and commit the generated migration.
- **One clock.** Services take an optional `now` and pass it on (e.g. `scheduledFor: now`). Business logic never depends on a database `defaultNow()` value, and tests always pass fixed dates. Otherwise tests start failing as the real date moves past the dates they pretend it is.
- Scripts run with `tsx` wrap their code in `async function main()`: `.ts` runs as CommonJS here, so top-level `await` crashes.

## Never commit

- Secrets of any kind: `.env.local`, API keys, Gmail app password, `DATABASE_URL`, `TOKEN_SECRET`, password hashes, PINs. They go in `.env.local` locally and in Vercel environment variables in production. `.env.example` holds empty placeholders only.
- Real guest data: names, phones, emails, guest-list CSVs, exports, database dumps. Seed data and tests use obviously fake values (`0700000000`, `@example.com`).
- Before every commit, review `git diff --cached` for the above. CI runs gitleaks on every push.

## Non-negotiables

- Locked content (story, photos, programme, venues, coordinates, dress code, FAQ, contacts, pass, day-of) is fetched only after `requireApproved(token)` in `server/services/access.ts` passes (BR-1 to BR-4). This applies to pages, server actions, API routes and emails.
- Every invitation status change gets its new status from `nextStatus()` in `server/domain/status.ts` and is written to `activity_log` in the same transaction. Admin and gate actions use `applyTransition()` in `server/services/transitions.ts`.
- Admin services take an `AdminCtx` (from `getAdminContext()`, which calls `requireAdmin()`) and scope every query to `ctx.weddingId`. Server actions must build it themselves: a layout does not protect them.
- Nothing couple-specific is hard-coded in components. It comes from the database or seed.
- All input is validated on the server with Zod.
- Use the theme tokens in `app/globals.css`. Gold `#C9AB66` is never text on ivory; use `gold-deep` instead.
- Times are Africa/Nairobi, labelled EAT.
- When code references a rule, cite it (`// BR-14`, `// E5`).
