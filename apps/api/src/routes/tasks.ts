import type { FastifyInstance, FastifyReply } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { newId, nowIso, todayIso } from "@homeops/db";
import { addDays, calendarEvents, listTasks, syncTasks, todaySummary } from "../tasks.ts";
import type { AuthedRequest } from "./auth.ts";

const manualTaskSchema = z.object({
  title: z.string().min(1).max(120),
  kind: z.enum(["chore", "linked", "expiry", "purchase"]).default("purchase"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
  priority: z.number().int().min(0).max(9).default(1)
});
const templateSchema = z.object({
  title: z.string().min(1).max(120),
  cycleRule: z.string().min(3).max(120),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(300).nullable().optional()
});

function fail(reply: FastifyReply, err: unknown) {
  const msg = String((err as Error)?.message ?? err);
  return reply.code(msg.includes("not_found") ? 404 : 500).send({ ok: false, error: msg });
}

export function taskRoutes(app: FastifyInstance, db: DatabaseSync, requireAuth: unknown) {
  const auth = requireAuth as never;

  app.post("/api/tasks/sync", { preHandler: auth }, async (request) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    return { ok: true, today: todayIso(), ...syncTasks(db, homeId, todayIso()) };
  });

  app.get("/api/tasks", { preHandler: auth }, async (request) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const q = request.query as { from?: string; to?: string; done?: string; kind?: string };
    return { ok: true, tasks: listTasks(db, homeId, { from: q.from, to: q.to, includeDone: q.done === "1", kind: q.kind }) };
  });

  app.post("/api/tasks", { preHandler: auth }, async (request, reply) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const parsed = manualTaskSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", detail: parsed.error.issues });
    const id = newId();
    try {
      db.prepare(
        "INSERT INTO tasks (id, home_id, title, note, kind, source_type, source_id, template_id, item_id, location_id, due_date, remind_at, priority, done, done_at, created_at) " +
          "VALUES (?, ?, ?, ?, ?, 'manual', ?, NULL, NULL, NULL, ?, NULL, ?, 0, NULL, ?)",
      ).run(id, homeId, parsed.data.title, parsed.data.note ?? null, parsed.data.kind, id, parsed.data.dueDate ?? null, parsed.data.priority, nowIso());
    } catch (err) { return fail(reply, err); }
    return { ok: true, id };
  });

  app.post("/api/tasks/:id/done", { preHandler: auth }, async (request, reply) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const { id } = request.params as { id: string };
    const done = ((request.body ?? {}) as { done?: boolean }).done !== false;
    const row = db.prepare("SELECT id FROM tasks WHERE id = ? AND home_id = ?").get(id, homeId);
    if (!row) return reply.code(404).send({ ok: false, error: "task_not_found" });
    db.prepare("UPDATE tasks SET done = ?, done_at = ? WHERE id = ? AND home_id = ?")
      .run(done ? 1 : 0, done ? nowIso() : null, id, homeId);
    return { ok: true, done };
  });

  app.delete("/api/tasks/:id", { preHandler: auth }, async (request, reply) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const { id } = request.params as { id: string };
    const info = db.prepare("DELETE FROM tasks WHERE id = ? AND home_id = ?").run(id, homeId);
    if (Number(info.changes) === 0) return reply.code(404).send({ ok: false, error: "task_not_found" });
    return { ok: true };
  });

  /* ---------------- 周期家务模板 ---------------- */
  app.get("/api/task-templates", { preHandler: auth }, async (request) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    return { ok: true, templates: db.prepare("SELECT id, title, note, cycle_rule, next_due_date, active FROM task_templates WHERE home_id = ? ORDER BY active DESC, next_due_date").all(homeId) };
  });

  app.post("/api/task-templates", { preHandler: auth }, async (request, reply) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const parsed = templateSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", detail: parsed.error.issues });
    const id = newId();
    try {
      db.prepare("INSERT INTO task_templates (id, home_id, title, note, cycle_rule, next_due_date, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)")
        .run(id, homeId, parsed.data.title, parsed.data.note ?? null, parsed.data.cycleRule, parsed.data.nextDueDate, nowIso());
    } catch (err) { return fail(reply, err); }
    return { ok: true, id };
  });

  app.patch("/api/task-templates/:id", { preHandler: auth }, async (request, reply) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const { id } = request.params as { id: string };
    const b = (request.body ?? {}) as Record<string, unknown>;
    try {
      db.prepare(
        "UPDATE task_templates SET title = IFNULL(?, title), note = IFNULL(?, note), cycle_rule = IFNULL(?, cycle_rule), " +
          "next_due_date = IFNULL(?, next_due_date), active = IFNULL(?, active) WHERE id = ? AND home_id = ?",
      ).run((b.title as string) ?? null, (b.note as string) ?? null, (b.cycleRule as string) ?? null,
        (b.nextDueDate as string) ?? null, (b.active as number) ?? null, id, homeId);
    } catch (err) { return fail(reply, err); }
    return { ok: true };
  });

  /* ---------------- 日历 / 今日 ---------------- */
  app.get("/api/calendar", { preHandler: auth }, async (request) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const q = request.query as { from?: string; to?: string };
    const from = q.from ?? todayIso();
    const to = q.to ?? addDays(from, 30);
    const events = calendarEvents(db, homeId, from, to, todayIso());
    const byType: Record<string, number> = {};
    events.forEach((e) => { byType[e.type] = (byType[e.type] ?? 0) + 1; });
    return { ok: true, from, to, count: events.length, byType, events };
  });

  app.get("/api/today", { preHandler: auth }, async (request) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const today = todayIso();
    const sync = syncTasks(db, homeId, today);
    return { ok: true, sync, ...todaySummary(db, homeId, today) };
  });
}
