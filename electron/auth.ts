import type { NextFunction, Request, Response } from "express";

export type AuthenticatedIdentity = { id: string; role: "admin" | "customer" };
type Options = { url?: string; anonKey?: string; adminUserIds?: string[]; fetcher?: typeof fetch };

export function createSupabaseAuth(options: Options = {}) {
  const url = (options.url ?? process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const anonKey = (options.anonKey ?? process.env.SUPABASE_ANON_KEY ?? "").trim();
  const source = options.adminUserIds ?? (process.env.ADMIN_USER_IDS ?? "").split(",");
  const admins = new Set(source.map((value) => value.trim()).filter(Boolean));
  const fetcher = options.fetcher ?? fetch;

  async function authenticate(request: Request, response: Response, next: NextFunction) {
    if (!url || !anonKey) return response.status(503).json({ error: "auth_not_configured" });
    const match = /^Bearer\s+([^\s]+)$/i.exec(request.header("authorization") ?? "");
    if (!match) return response.status(401).json({ error: "authentication_required" });
    try {
      const result = await fetcher(`${url}/auth/v1/user`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${match[1]}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (!result.ok) return response.status(401).json({ error: "invalid_or_expired_token" });
      const user = await result.json() as { id?: unknown };
      if (typeof user.id !== "string" || !user.id.trim()) return response.status(401).json({ error: "invalid_identity" });
      response.locals.authIdentity = { id: user.id, role: admins.has(user.id) ? "admin" : "customer" } satisfies AuthenticatedIdentity;
      return next();
    } catch {
      return response.status(503).json({ error: "identity_provider_unavailable" });
    }
  }

  function requireAdmin(_request: Request, response: Response, next: NextFunction) {
    const identity = response.locals.authIdentity as AuthenticatedIdentity | undefined;
    if (!identity) return response.status(401).json({ error: "authentication_required" });
    if (identity.role !== "admin") return response.status(403).json({ error: "admin_required" });
    return next();
  }

  return { authenticate, requireAdmin };
}
