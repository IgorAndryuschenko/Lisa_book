import { getOwner, getStorage, unauthorized, unavailable, validId } from "../../../../db/storage";

export async function GET(request: Request, context: { params: Promise<{id:string}> }) {
  const owner = getOwner(request);
  if (!owner) return unauthorized();
  const { id } = await context.params;
  if (!validId(id)) return Response.json({ error: "Неверный идентификатор" }, { status: 400 });
  try {
    const { db, bucket } = getStorage();
    const row = await db.prepare("SELECT mime_type FROM stickers WHERE id = ? AND owner_id = ?").bind(id, owner).first<{mime_type:string}>();
    if (!row) return Response.json({ error: "Стикер не найден" }, { status: 404 });
    const object = await bucket.get(`stickers/${owner}/${id}`);
    if (!object) return Response.json({ error: "Файл стикера не найден" }, { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": row.mime_type, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { console.error("Sticker load failed", error); return unavailable(); }
}
