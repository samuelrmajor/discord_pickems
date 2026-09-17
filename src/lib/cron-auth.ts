import { timingSafeEqual } from "node:crypto";

/**
 * Shared-secret check for scheduled routes.
 *
 * The header format matches what Vercel Cron sends automatically when
 * `CRON_SECRET` is set, so the same route works whether it is triggered by a
 * GitHub Actions workflow or by Vercel's own scheduler.
 *
 * Returns false when no secret is configured: an unguarded endpoint that posts
 * to Discord is worse than one that never fires.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const offered = header.startsWith("Bearer ") ? header.slice(7) : "";

  const a = Buffer.from(offered);
  const b = Buffer.from(secret);
  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  return a.length === b.length && timingSafeEqual(a, b);
}
