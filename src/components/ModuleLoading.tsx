/**
 * What a module shows the instant it's tapped, while its server render is
 * still running. Used by each module's `loading.tsx`, which is also what lets
 * Next prefetch these dynamic routes at all: without one, a tap on the hub
 * shows nothing until the whole page is ready, and the app looks frozen.
 */
export default function ModuleLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-8 text-center"
    >
      <span
        aria-hidden
        className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--line)]
                   border-t-[var(--accent)]"
      />
      <p className="mt-4 text-[13px] font-semibold">Loading {label}</p>
    </div>
  );
}
