import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { USERS } from "@/lib/users";
import { login } from "./actions";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Pick&apos;em</h1>
      <p className="mt-0.5 text-xs text-[var(--muted)]">Tap your name to get started.</p>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {USERS.map((name) => (
          <form key={name} action={login.bind(null, name)}>
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
