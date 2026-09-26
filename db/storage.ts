import { env } from "cloudflare:workers";

export function getStorage() {
  const bindings = env as unknown as { DB?: D1Database; BUCKET?: R2Bucket };
  if (!bindings.DB || !bindings.BUCKET) throw new Error("Хранилище дневника недоступно");
  return { db: bindings.DB, bucket: bindings.BUCKET };
}

export function getOwner(request: Request) {
  const authenticatedOwner = request.headers.get("oai-authenticated-user-id");
  if (authenticatedOwner) return authenticatedOwner;

  // The standalone local server has no account provider. Reuse the ID that
  // the former local sign-in assigned so existing local entries stay visible.
  const hostname = new URL(request.url).hostname.replace(/^\[|\]$/g, "");
  return ["localhost", "127.0.0.1", "::1"].includes(hostname)
    ? "local_seedy"
    : null;
}

export const unavailable = () => Response.json({ error: "Не удалось связаться с хранилищем. Запись не потеряна — попробуйте ещё раз." }, { status: 503 });
export const unauthorized = () => Response.json({ error: "Для доступа к дневнику нужно войти в аккаунт." }, { status: 401 });
export const validId = (id: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(id);
