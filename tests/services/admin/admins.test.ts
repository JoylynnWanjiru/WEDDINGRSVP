import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readAdminSetup } from "@/server/auth/admins";
import { requireAdmin } from "@/server/auth/sessions";
import type { Db } from "@/server/db/client";
import { activityLog } from "@/server/db/schema";
import { addAdmin, listAdmins, removeAdmin, resetAdmin } from "@/server/services/admin/admins";
import { getAdminContext } from "@/server/services/admin/context";
import { adminCtx, sessionTokenOf, setupToken } from "../../helpers/admin";
import { createTestDb, createWedding } from "../../helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

describe("D26: who can sign in", () => {
  it("adds a named admin with a setup link; they show as waiting until set up", async () => {
    const wedding = await createWedding(db);
    const ctx = await adminCtx(db, wedding.id);
    const { id, setupLink } = await addAdmin(db, ctx, { name: " The Planner ", email: "Planner@Example.com" });
    expect(setupLink).toMatch(/^https:\/\/wedding\.test\/admin\/setup\//);
    expect((await readAdminSetup(db, setupToken(setupLink)))?.admin.id).toBe(id);

    const list = await listAdmins(db, ctx);
    expect(list).toEqual([
      expect.objectContaining({ name: "Test Admin", ready: true, isYou: true }),
      { id, name: "The Planner", email: "planner@example.com", ready: false, isYou: false },
    ]);
    const [log] = await db.select().from(activityLog).where(and(eq(activityLog.weddingId, wedding.id), eq(activityLog.action, "admin_added")));
    expect(log).toMatchObject({ actor: "admin", actorLabel: "Test Admin", meta: { name: "The Planner" } });
    expect(JSON.stringify(log.meta)).not.toContain("@"); // no emails in the log
  });

  it("refuses a duplicate email and invalid input", async () => {
    const wedding = await createWedding(db);
    const ctx = await adminCtx(db, wedding.id);
    await expect(addAdmin(db, ctx, { name: "Again", email: "ADMIN@example.com" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(addAdmin(db, ctx, { name: "", email: "x@example.com" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addAdmin(db, ctx, { name: "X", email: "not-an-email" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("removing an admin signs them out at once; nobody can remove themselves", async () => {
    const wedding = await createWedding(db);
    const bride = await adminCtx(db, wedding.id, { name: "Bride", email: "bride@example.com" });
    const planner = await adminCtx(db, wedding.id, { name: "Planner", email: "planner@example.com" });
    await expect(removeAdmin(db, bride, bride.session.adminId)).rejects.toMatchObject({ code: "VALIDATION" });

    const token = sessionTokenOf(wedding.id, "planner@example.com");
    await expect(requireAdmin(db, token)).resolves.toMatchObject({ label: "Planner" });
    await removeAdmin(db, bride, planner.session.adminId);
    await expect(requireAdmin(db, token)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect((await listAdmins(db, bride)).map((a) => a.name)).toEqual(["Bride"]);
  });

  it("E28: reset gives a new setup link and admins only manage their own wedding", async () => {
    const wedding = await createWedding(db);
    const other = await createWedding(db);
    const ctx = await adminCtx(db, wedding.id);
    const outsider = await adminCtx(db, other.id);
    const { id } = await addAdmin(db, ctx, { name: "Groom", email: "groom@example.com" });

    const { setupLink } = await resetAdmin(db, ctx, id);
    expect((await readAdminSetup(db, setupToken(setupLink)))?.admin.setupVersion).toBe(2);
    await expect(resetAdmin(db, outsider, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(removeAdmin(db, outsider, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a session for one wedding can't open another wedding's admin", async () => {
    const wedding = await createWedding(db);
    const other = await createWedding(db);
    await adminCtx(db, wedding.id);
    const token = sessionTokenOf(wedding.id, "admin@example.com");
    await expect(getAdminContext(db, token, wedding.slug)).resolves.toMatchObject({ weddingId: wedding.id });
    await expect(getAdminContext(db, token, other.slug)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
