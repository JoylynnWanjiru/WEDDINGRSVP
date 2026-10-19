@AGENTS.md

# Project guidelines

Two documents define this project. Read the relevant sections before building a feature.

- `docs/PROJECT_SPEC.md`: **what to build with**. Stack, theme and colours, pages and routes, data fields, free-tier limits, build phases.
- `docs/BLUEPRINT.md`: **how it must behave**. Actors, the invitation lifecycle (§5), business rules BR-1 to BR-23 (§6), edge cases E1 to E25 (§7), definition of done (§15).

Where they disagree, **the blueprint wins on behaviour**: status names and transitions, rules and edge cases. The spec wins on stack, styling and layout.

## Non-negotiables

- Locked content (story, photos, programme, venues, coordinates, dress code, FAQ, contacts, pass, day-of) is fetched only after `requireApproved(token)` in `lib/access.ts` passes (BR-1 to BR-4). This applies to pages, server actions, API routes and emails.
- Invitation status changes only through `lib/status.ts`, and every change is written to `activity_log`.
- Server actions call `requireAdmin()` / `requireUsher()` themselves. A layout does not protect them.
- Nothing couple-specific is hard-coded in components. It comes from the database or seed.
- All input is validated on the server with Zod.
- Use the theme tokens in `app/globals.css`. Gold `#C9AB66` is never text on ivory; use `gold-deep` instead.
- Times are Africa/Nairobi, labelled EAT.
- When code references a rule, cite it (`// BR-14`, `// E5`).
