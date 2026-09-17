/**
 * The portal's tiles. Each entry is one "module" of the app; the hub at `/`
 * renders them in order, and anything that isn't `live` shows as a disabled
 * placeholder so the menu can advertise what's coming without routing to a 404.
 */
export type ModuleDef = {
  key: string;
  name: string;
  tagline: string;
  href: string;
  glyph: string;
  live: boolean;
  /**
   * Logins allowed to see and open this module. Omitted means everyone.
   *
   * This hides the tile *and* guards the routes behind it — it is a soft gate
   * for work in progress, not a security boundary (login here is a name and a
   * cookie, with no password behind it).
   */
  restrictedTo?: readonly string[];
};

export const MODULES: ModuleDef[] = [
  {
    key: "pickems",
    name: "Pick'em",
    tagline: "Weekly NFL picks, standings, and the consensus parlay",
    href: "/pickems",
    glyph: "P",
    live: true,
  },
  {
    key: "fantasy",
    name: "Power Rankings",
    tagline: "Rank the fantasy league each week; results open Thursday",
    href: "/fantasy",
    glyph: "☰",
    live: true,
    // Still being built out — open it to the league by deleting this line.
    restrictedTo: ["sam"],
  },
];

export function canSeeModule(user: string, key: string): boolean {
  const mod = MODULES.find((m) => m.key === key);
  if (!mod) return false;
  return !mod.restrictedTo || mod.restrictedTo.includes(user);
}

/** The tiles this user should be shown on the hub. */
export function modulesFor(user: string): ModuleDef[] {
  return MODULES.filter((m) => !m.restrictedTo || m.restrictedTo.includes(user));
}
