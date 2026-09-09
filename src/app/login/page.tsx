import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { USERS } from "@/lib/users";
import { login } from "./actions";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Pick&apos;em</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Tap your name to get started.</p>

      <div className="mt-8 grid grid-cols-2 gap-3">
        {USERS.map((name) => (
          <form key={name} action={login.bind(null, name)}>
            <button
              type="submit"
              className="w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-3 py-5 text-lg
                         font-semibold capitalize transition active:scale-[0.97] active:bg-[var(--panel-2)]"
            >
              {name.replace("_", " ")}
            </button>
          </form>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-[var(--muted)]">
        No passwords. We&apos;ll remember you on this device.
      </p>
    </main>
  );
}
