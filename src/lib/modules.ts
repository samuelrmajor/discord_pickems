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
];
