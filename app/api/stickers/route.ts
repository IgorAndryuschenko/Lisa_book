import { getOwner, getStorage, unauthorized, unavailable } from "../../../db/storage";

export async function POST(request: Request) {
  const owner = getOwner(request);
  if (!owner) return unauthorized();
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || !file.size || file.size > 600_000) return Response.json({ error: "Выберите PNG, JPG, WebP или GIF до 600 КБ" }, { status: 400 });
    const { db, bucket } = getStorage();
    const id = crypto.randomUUID();
    await bucket.put(`stickers/${owner}/${id}`, file, { httpMetadata: { contentType: file.type } });
    try { await db.prepare("INSERT INTO stickers (id,owner_id,mime_type) VALUES (?,?,?)").bind(id, owner, file.type).run(); }
    catch (error) { await bucket.delete(`stickers/${owner}/${id}`); throw error; }
    return Response.json({ id, url: `/api/stickers/${id}` }, { status: 201 });
  } catch (error) { console.error("Sticker upload failed", error); return unavailable(); }
}
