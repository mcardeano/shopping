import type { SVGProps } from "react";

const PATHS = {
  home: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z",
  bookmark: "M6.5 4h11a.5.5 0 0 1 .5.5V20l-6-3.8L6 20V4.5a.5.5 0 0 1 .5-.5Z",
  calendar: "M4.5 7.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-11ZM4.5 10h15M8.5 3.5v3M15.5 3.5v3",
  bag: "M5.5 8h13l-1 11.2a1 1 0 0 1-1 .8h-9a1 1 0 0 1-1-.8L5.5 8ZM9 8V6.5a3 3 0 0 1 6 0V8",
  plus: "M12 5v14M5 12h14",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 20 20",
  heart: "M12 19.5s-7-4.3-7-9.6A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.3-7 9.6-7 9.6Z",
  check: "m5 12.5 4.2 4.2L19 7",
  clock: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 8v4.3l2.8 1.7",
  flame: "M12 20c3.3 0 5.5-2.2 5.5-5.4 0-3.9-3.6-5.8-4.2-9.6-2 1.4-3.3 3.6-3.3 5.8-1-.6-1.6-1.6-1.8-2.6C6.7 9.7 6.5 12 6.5 14.6 6.5 17.8 8.7 20 12 20Z",
  close: "M6 6l12 12M18 6 6 18",
  chevronRight: "m9.5 6 6 6-6 6",
  chevronLeft: "m14.5 6-6 6 6 6",
  chevronDown: "m6 9.5 6 6 6-6",
  lock: "M7 11V8.5a5 5 0 0 1 10 0V11M6 11h12v8.5H6V11Z",
  unlock: "M7 11V8.5a5 5 0 0 1 9.6-2M6 11h12v8.5H6V11Z",
  swap: "M7 7.5h11l-3-3M17 16.5H6l3 3",
  trash: "M5.5 7h13M10 7V5h4v2M7 7l.8 12.2a1 1 0 0 0 1 .8h6.4a1 1 0 0 0 1-.8L17 7",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1",
  image: "M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-11ZM4.5 16l4.5-4.5 4 4 2.5-2.5 4 4M15 9.5h.01",
  text: "M5 6.5h14M5 11h14M5 15.5h9",
  pencil: "M15.5 5.5 18.5 8.5 9 18l-4 1 1-4 9.5-9.5Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  more: "M6 12h.01M12 12h.01M18 12h.01",
  leaf: "M5 19c0-8 5-13 14-14-1 9-6 14-14 14ZM5 19l7-7",
  sparkle: "M12 4.5 13.6 10.4 19.5 12l-5.9 1.6L12 19.5l-1.6-5.9L4.5 12l5.9-1.6L12 4.5Z",
  undo: "M9 14 4.5 9.5 9 5M5 9.5h9.5a5 5 0 0 1 0 10H11",
  share: "M12 4v11M7.5 8.5 12 4l4.5 4.5M5.5 13.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-5.5",
  mic: "M12 15a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3ZM6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3",
  external: "M14 5h5v5M19 5l-8 8M17 14v4.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H10",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3.5 19.5c.7-3.2 2.9-5 5.5-5s4.8 1.8 5.5 5M16 11a3 3 0 1 0-.8-5.9M17.5 14.6c1.8.5 3 2 3.5 4.9",
  refresh: "M19 12a7 7 0 1 1-2.1-5M19 4.5v4h-4",
  basket: "M4.5 10h15l-1.6 8.3a1 1 0 0 1-1 .7H7.1a1 1 0 0 1-1-.7L4.5 10ZM8 10l3-5.5M16 10l-3-5.5M9.5 13.5v2.5M14.5 13.5v2.5",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, strokeWidth = 1.6, filled = false, ...rest }: { name: IconName; size?: number; strokeWidth?: number; filled?: boolean } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
