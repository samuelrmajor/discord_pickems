import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { moduleByHref } from "@/lib/modules";
import { getCurrentUser } from "@/lib/session";
import { USERS } from "@/lib/users";
import { login } from "./actions";

type Props = { searchParams: Promise<{ next?: string }> };

/**
 * A link shared into Discord is fetched by a crawler that has no session, so
 * every deep link unfurls as whatever this page says. Borrowing the title of
 * the module the visitor was headed for is what makes a `/fantasy` link
 * preview as the Coach's Poll rather than as the site itself.
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const mod = moduleByHref((await searchParams).next);
  if (!mod) return {};
  return {
    title: mod.name,
    description: mod.tagline,
    // A page-level `openGraph` replaces the layout's outright rather than
    // merging into it, so the shared fields are restated here.
    openGraph: {
      type: "website",
      siteName: "FWL Fantasy",
      title: mod.name,
      description: mod.tagline,
      url: mod.href,
    },
  };
}

export default async function LoginPage({ searchParams }: Props) {
  const next = moduleByHref((await searchParams).next)?.href;
  if (await getCurrentUser()) redirect(next ?? "/");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-bold tracking-tight">FWL Fantasy</h1>
      <p className="mt-0.5 text-xs text-[var(--muted)]">Tap your name to get started.</p>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {USERS.map((name) => (
          <form key={name} action={login.bind(null, name)}>
            {next && <input type="hidden" name="next" value={next} />}
            <button
              type="submit"
              className="w-full rounded-xl bg-[var(--panel)] px-2 py-3.5 text-[13px] font-semibold
                         capitalize transition active:scale-[0.97] active:bg-[var(--panel-2)]"
            >
              {name.replace("_", " ")}
            </button>
          </form>
        ))}
      </div>

      <p className="mt-6 text-center text-[11px] text-[var(--muted)]">
        No passwords. We&apos;ll remember you on this device.
      </p>
    </main>
  );
}
