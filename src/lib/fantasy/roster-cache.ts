"use client";

import type { ProfileRosters } from "./profiles";

/**
 * Client-side store for the lazily fetched rosters.
 *
 * Two layers, both keyed by the roster content version: a module-level map so
 * reopening a sheet in the same session is instant, and localStorage so it
 * survives a reload. Rosters only change on a waiver or lineup edit, so in
 * practice this is downloaded once and then not again for days.
 *
 * Every storage access is guarded — private windows and blocked site data both
 * throw — and a miss simply means we fetch again.
 */

const PREFIX = "fantasy:rosters:";

type Rosters = Record<string, ProfileRosters>;

let memory: { version: string; rosters: Rosters } | null = null;
let inFlight: Promise<Rosters | null> | null = null;

function readStored(version: string): Rosters | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + version);
    return raw ? (JSON.parse(raw) as Rosters) : null;
  } catch {
    return null;
  }
}

function writeStored(version: string, rosters: Rosters): void {
  try {
    // Only one version is ever useful; drop the others so this can't grow.
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(PREFIX) && key !== PREFIX + version) {
        window.localStorage.removeItem(key);
      }
    }
    window.localStorage.setItem(PREFIX + version, JSON.stringify(rosters));
  } catch {
    // Quota or a private window — the in-memory copy still serves this session.
  }
}

/** Cached rosters for this version, without touching the network. */
export function peekRosters(version: string): Rosters | null {
  if (memory?.version === version) return memory.rosters;
  const stored = readStored(version);
  if (stored) memory = { version, rosters: stored };
  return stored;
}

/**
 * Rosters for this version, fetching only if we don't already hold them.
 * Concurrent callers share one request.
 */
export async function loadRosters(version: string): Promise<Rosters | null> {
  const cached = peekRosters(version);
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch(`/api/fantasy/rosters?v=${encodeURIComponent(version)}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { version: string; rosters: Rosters };
      // Trust the version the server answered with, not the one we asked for:
      // the snapshot may have moved on between render and fetch.
      memory = { version: data.version, rosters: data.rosters };
      writeStored(data.version, data.rosters);
      return data.rosters;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
