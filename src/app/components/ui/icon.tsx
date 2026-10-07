/**
 * One icon set, one stroke weight, one grid.
 *
 * These replace the emoji an earlier pass used. Emoji are drawn by the operating system, so the
 * same character is a flat pictogram on one phone and a glossy 3D bauble on another: the app cannot
 * look deliberate when a third of its glyphs are outside its control. These are drawn here, on a
 * 24-unit grid at 1.75 stroke, and inherit `currentColor` so a mark always matches the text it sits
 * beside.
 *
 * Every icon is decorative. The label is always in the text next to it, so each renders
 * `aria-hidden` and adds nothing to the accessible name.
 */

const PATHS = {
  arrowRight: "M5 12h14m-5-5 5 5-5 5",
  shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-4 9 3 3 5-6",
  /** A bowl of rice: the app's own mark. */
  bowl: "M3.5 11h17a8.5 8.5 0 0 1-17 0Zm2.2-2.2c.9-1.6 3.2-2.8 6.3-2.8s5.4 1.2 6.3 2.8M12 6V4M2 21h20",
  basket:
    "M4.5 9h15l-1.4 9.2a2 2 0 0 1-2 1.8H7.9a2 2 0 0 1-2-1.8L4.5 9Zm4-.4 2-4.6m5 4.6-2-4.6M9.5 13v3.5m5-3.5v3.5",
  cart: "M3 4h2.2l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.2L21 8H6M10 20.5h.01M17 20.5h.01",
  leaf: "M20 4c0 8.5-4.7 13-10.5 13A4.5 4.5 0 0 1 5 12.5C5 7.4 11 4 20 4ZM4 20c2.5-4.3 5.5-7 9-9",
  pan: "M3 12h13a0 0 0 0 1 0 0v2.5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V12Zm13 1h5M7.5 8.5c0-1.2 1-1.8 1-3s-1-1.8-1-3m4 6c0-1.2 1-1.8 1-3s-1-1.8-1-3",
  soup: "M4 11h16a8 8 0 0 1-8 8 8 8 0 0 1-8-8ZM2 21h20M9 7.5c0-1.2 1-1.8 1-3m4 3c0-1.2 1-1.8 1-3",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13.5V12l3 2",
  chevronDown: "m6 9 6 6 6-6",
  flame:
    "M12 22c3.9 0 6.5-2.5 6.5-6 0-4.5-4-6-4-9.5C14.5 4 12 2 12 2S9.5 4 9.5 6.5C9.5 10 5.5 11.5 5.5 16c0 3.5 2.6 6 6.5 6Zm0-3.5c1.4 0 2.3-.9 2.3-2.2 0-1.6-1.6-2.3-1.6-3.8 0 0-1 .8-1.4 1.8-.4 1-1.6 1.3-1.6 2.6 0 1 .9 1.6 2.3 1.6Z",
  thermometer: "M10 13.5V5.5a2 2 0 1 1 4 0v8a4 4 0 1 1-4 0Zm2 2.5v-2.5M16.5 6H19m-2.5 3.5H19",
  check: "m5 13 4.5 4.5L19 7",
  speaker: "M11 5 6 9H2v6h4l5 4V5Zm4.5 3.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14",
  sun: "M12 3v2m0 14v2M3 12h2m14 0h2m-3.5-6.5-1.4 1.4M6.9 17.1l-1.4 1.4m11.6 0-1.4-1.4M6.9 6.9 5.5 5.5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  note: "M4 4h16v16H4V4Zm4 4h8m-8 4h8m-8 4h5",
  expand: "M15 3h6v6m0-6-7 7M9 21H3v-6m0 6 7-7",
  heart:
    "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",
  calendar:
    "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  refresh: "M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4m-4 4a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4",
  share: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8m-4-6-4-4-4 4m4-4v13",
  printer:
    "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2m-12 0v4h12v-4"
} as const

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  className = "size-4"
}: Readonly<{ name: IconName; className?: string }>) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d={PATHS[name]}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </svg>
  )
}
