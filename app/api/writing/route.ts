import { getOwner, getStorage, unavailable, unauthorized, validId } from "../../../db/storage";

const colors = ["sage", "teal", "blue", "rose", "amber"];
const validMonth = (value: unknown): value is string => typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const validDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
};
const integerIn = (value: unknown, min: number, max: number) => Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
const invalid = (message: string) => Response.json({ error: message }, { status: 400 });

export async function GET(request: Request) {
  const owner = getOwner(request);
  if (!owner) return unauthorized();
  try {
    const { db } = getStorage();
    const [books, months, days] = await Promise.all([
      db.prepare("SELECT id, title, color, created_at AS createdAt FROM writing_books WHERE owner_id = ? ORDER BY created_at, rowid").bind(owner).all(),
      db.prepare("SELECT book_id AS bookId, month, target_chars AS targetChars, work_days AS workDays FROM writing_months WHERE owner_id = ?").bind(owner).all(),
      db.prepare("SELECT book_id AS bookId, date, actual_chars AS actualChars, worked FROM writing_days WHERE owner_id = ?").bind(owner).all(),
    ]);
    return Response.json({ books: books.results, months: months.results, days: days.results.map(day => ({ ...day, worked: Boolean(day.worked) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("Writing load failed", error); return unavailable(); }
}

export async function POST(request: Request) {
  const owner = getOwner(request);
  if (!owner) return unauthorized();
  let payload: Record<string, unknown>;
  try { payload = await request.json(); } catch { return invalid("Неверный формат данных"); }
  try {
    const { db } = getStorage();
    if (payload.op === "book-create") {
      const id = payload.id;
      const title = typeof payload.title === "string" ? payload.title.trim() : "";
      if (typeof id !== "string" || !validId(id) || !title || title.length > 80 || !colors.includes(String(payload.color))) return invalid("Укажите название книги");
      const createdAt = new Date().toISOString();
      await db.prepare("INSERT INTO writing_books (id, owner_id, title, color, created_at) VALUES (?,?,?,?,?)").bind(id, owner, title, payload.color, createdAt).run();
      return Response.json({ book: { id, title, color: payload.color, createdAt } });
    }
    const bookId = payload.bookId;
    if (typeof bookId !== "string" || !validId(bookId)) return invalid("Книга не найдена");
    const book = await db.prepare("SELECT id FROM writing_books WHERE id = ? AND owner_id = ?").bind(bookId, owner).first();
    if (!book) return Response.json({ error: "Книга не найдена" }, { status: 404 });
    if (payload.op === "book-update") {
      const title = typeof payload.title === "string" ? payload.title.trim() : "";
      if (!title || title.length > 80 || !colors.includes(String(payload.color))) return invalid("Проверьте название и цвет книги");
      await db.prepare("UPDATE writing_books SET title = ?, color = ? WHERE id = ? AND owner_id = ?").bind(title, payload.color, bookId, owner).run();
      return Response.json({ ok: true });
    }
    if (payload.op === "book-delete") {
      await db.batch([
        db.prepare("DELETE FROM writing_days WHERE book_id = ? AND owner_id = ?").bind(bookId, owner),
        db.prepare("DELETE FROM writing_months WHERE book_id = ? AND owner_id = ?").bind(bookId, owner),
        db.prepare("DELETE FROM writing_books WHERE id = ? AND owner_id = ?").bind(bookId, owner),
      ]);
      return Response.json({ ok: true });
    }
    if (payload.op === "month-upsert") {
      if (!validMonth(payload.month) || !integerIn(payload.targetChars, 0, 100_000_000) || !integerIn(payload.workDays, 0, 31)) return invalid("Проверьте месячный план");
      await db.prepare("INSERT INTO writing_months (book_id, owner_id, month, target_chars, work_days) VALUES (?,?,?,?,?) ON CONFLICT(book_id, month) DO UPDATE SET target_chars=excluded.target_chars, work_days=excluded.work_days WHERE owner_id=excluded.owner_id")
        .bind(bookId, owner, payload.month, payload.targetChars, payload.workDays).run();
      return Response.json({ ok: true });
    }
    if (payload.op === "day-upsert") {
      if (!validDate(payload.date) || (payload.actualChars !== null && !integerIn(payload.actualChars, 0, 100_000_000)) || typeof payload.worked !== "boolean") return invalid("Проверьте запись за день");
      const worked = payload.actualChars !== null || payload.worked;
      if (!worked) {
        await db.prepare("DELETE FROM writing_days WHERE book_id = ? AND date = ? AND owner_id = ?").bind(bookId, payload.date, owner).run();
      } else {
        await db.prepare("INSERT INTO writing_days (book_id, owner_id, date, actual_chars, worked) VALUES (?,?,?,?,?) ON CONFLICT(book_id, date) DO UPDATE SET actual_chars=excluded.actual_chars, worked=excluded.worked WHERE owner_id=excluded.owner_id")
          .bind(bookId, owner, payload.date, payload.actualChars, 1).run();
      }
      return Response.json({ ok: true });
    }
    return invalid("Неизвестная операция");
  } catch (error) { console.error("Writing save failed", error); return unavailable(); }
}
