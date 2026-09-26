import { getOwner, getStorage, unauthorized, unavailable, validId } from "../../../../db/storage";

export async function PUT(request: Request, context: { params: Promise<{id:string}> }) {
  const owner = getOwner(request);
  if (!owner) return unauthorized();
  const { id } = await context.params;
  if (!validId(id)) return Response.json({ error: "Неверный идентификатор" }, { status: 400 });
  const type = request.headers.get("content-type") ?? "";
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!type.startsWith("audio/") || length > 24 * 1024 * 1024) return Response.json({ error: "Нужна аудиозапись до 24 МБ" }, { status: 400 });
  try {
    const blob = await request.blob();
    if (!blob.size || blob.size > 24 * 1024 * 1024) return Response.json({ error: "Нужна аудиозапись до 24 МБ" }, { status: 400 });
    const { bucket } = getStorage();
    await bucket.put(`audio/${owner}/${id}`, blob.stream(), { httpMetadata: { contentType: type } });
    return Response.json({ ok: true });
  } catch (error) { console.error("Audio upload failed", error); return unavailable(); }
}

export async function GET(request: Request, context: { params: Promise<{id:string}> }) {
  const owner = getOwner(request);
  if (!owner) return unauthorized();
  const { id } = await context.params;
  if (!validId(id)) return Response.json({ error: "Неверный идентификатор" }, { status: 400 });
  try {
    const { db, bucket } = getStorage();
    const entry = await db.prepare("SELECT id FROM entries WHERE id = ? AND owner_id = ? AND audio_key = ?").bind(id, owner, id).first();
    if (!entry) return Response.json({ error: "Запись не найдена" }, { status: 404 });
    const object = await bucket.get(`audio/${owner}/${id}`);
    if (!object) return Response.json({ error: "Аудиофайл не найден" }, { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "audio/webm", "Cache-Control": "private, no-store", "Accept-Ranges": "none" } });
  } catch (error) { console.error("Audio load failed", error); return unavailable(); }
}
