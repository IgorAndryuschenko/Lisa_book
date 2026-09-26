import { getOwner, getStorage, unavailable, unauthorized, validId } from "../../../db/storage";

type EntryInput = { id: string; date: string; time: string; kind: "text"|"voice"; text: string; transcript?: string; audioId?: string; duration?: number; sticker?: string };
type TodoInput = { id: string; text: string; done: boolean };

export async function GET(request: Request) {
  const owner = getOwner(request);
  if (!owner) return unauthorized();
  try {
    const { db } = getStorage();
    const [entries, todos, stickers] = await Promise.all([
      db.prepare("SELECT id, date, time, kind, text, transcript, audio_key AS audioId, duration, sticker FROM entries WHERE owner_id = ? ORDER BY date, time").bind(owner).all(),
      db.prepare("SELECT id, text, done FROM todos WHERE owner_id = ? ORDER BY rowid").bind(owner).all(),
      db.prepare("SELECT id FROM stickers WHERE owner_id = ? ORDER BY rowid").bind(owner).all(),
    ]);
    return Response.json({ entries: entries.results, todos: todos.results.map(todo => ({ ...todo, done: Boolean(todo.done) })), stickers: stickers.results.map(s => `/api/stickers/${s.id}`) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("Diary load failed", error); return unavailable(); }
}

export async function POST(request: Request) {
  const owner = getOwner(request);
  if (!owner) return unauthorized();
  let payload: { op?: string; entry?: EntryInput; todo?: TodoInput; id?: string };
  try { payload = await request.json(); } catch { return Response.json({ error: "Неверный формат данных" }, { status: 400 }); }
  try {
    const { db, bucket } = getStorage();
    if (payload.op === "entry-upsert" && payload.entry) {
      const e = payload.entry;
      if (!validId(e.id) || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !/^\d{2}:\d{2}$/.test(e.time) || !["text","voice"].includes(e.kind) || typeof e.text !== "string" || e.text.length > 100_000 || (e.transcript?.length ?? 0) > 100_000 || (e.sticker?.length ?? 0) > 500) return Response.json({ error: "Проверьте поля записи" }, { status: 400 });
      const audioKey = e.kind === "voice" && e.audioId === e.id ? e.id : null;
      await db.prepare("INSERT INTO entries (id,owner_id,date,time,kind,text,transcript,audio_key,duration,sticker) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET date=excluded.date,time=excluded.time,kind=excluded.kind,text=excluded.text,transcript=excluded.transcript,audio_key=excluded.audio_key,duration=excluded.duration,sticker=excluded.sticker WHERE owner_id=excluded.owner_id").bind(e.id, owner, e.date, e.time, e.kind, e.text, e.transcript ?? null, audioKey, e.duration ?? null, e.sticker ?? null).run();
      return Response.json({ ok: true });
    }
    if (payload.op === "entry-delete" && payload.id && validId(payload.id)) {
      const id = payload.id;
      const entry = await db.prepare("SELECT audio_key FROM entries WHERE id = ? AND owner_id = ?").bind(id, owner).first<{audio_key:string|null}>();
      await db.prepare("DELETE FROM entries WHERE id = ? AND owner_id = ?").bind(id, owner).run();
      if (entry?.audio_key) await bucket.delete(`audio/${owner}/${id}`);
      return Response.json({ ok: true });
    }
    if (payload.op === "todo-upsert" && payload.todo) {
      const todo = payload.todo;
      if (!validId(todo.id) || typeof todo.text !== "string" || !todo.text.trim() || todo.text.length > 120 || typeof todo.done !== "boolean") return Response.json({ error: "Проверьте текст дела" }, { status: 400 });
      await db.prepare("INSERT INTO todos (id,owner_id,text,done) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET text=excluded.text,done=excluded.done WHERE owner_id=excluded.owner_id").bind(todo.id, owner, todo.text.trim(), todo.done ? 1 : 0).run();
      return Response.json({ ok: true });
    }
    if (payload.op === "todo-delete" && payload.id && validId(payload.id)) {
      await db.prepare("DELETE FROM todos WHERE id = ? AND owner_id = ?").bind(payload.id, owner).run();
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Неизвестная операция" }, { status: 400 });
  } catch (error) { console.error("Diary write failed", error); return unavailable(); }
}
