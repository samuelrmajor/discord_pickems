import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/login/actions";
import { MODULES } from "@/lib/modules";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg px-3 pb-10 pt-4">
      <header className="flex items-end justify-between px-1">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Signed in as</p>
          <h1 className="text-xl font-bold capitalize tracking-tight">
            {user.replace("_", " ")}
          </h1>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg bg-[var(--panel)] px-2.5 py-1.5 text-[11px] font-semibold
                       text-[var(--muted)] transition active:scale-95 active:bg-[var(--panel-2)]"
          >
            Switch
          </button>
        </form>
      </header>

      <nav className="mt-4 grid gap-2">
        {MODULES.map((mod) => {
          const body = (
            <>
              <span
                aria-hidden
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg
                            font-bold ${
                              mod.live
                                ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                                : "bg-[var(--panel-2)] text-[var(--muted)]"
                            }`}
              >
                {mod.glyph}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">
                  {mod.name}
                  {!mod.live && (
                    <span className="ml-1.5 align-middle text-[9px] font-semibold uppercase text-[var(--muted)]">
                      soon
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[12px] leading-snug text-[var(--muted)]">
                  {mod.tagline}
                </span>
              </span>
            </>
          );

          const cls =
            "flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3 text-left";

          return mod.live ? (
            <Link key={mod.key} href={mod.href} className={`${cls} transition active:scale-[0.99] active:bg-[var(--panel-2)]`}>
              {body}
            </Link>
          ) : (
            <div key={mod.key} aria-disabled className={`${cls} opacity-50`}>
              {body}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
