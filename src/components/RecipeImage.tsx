"use client";

import { useState } from "react";
import { cuisineFamily } from "@/core/domain/categories";

/**
 * Recipe photography, with an editorial generated cover when there's no photo (or it fails
 * to load): a top-down "plate" whose colours come from the recipe's actual ingredients.
 */

type Props = {
  id: string;
  title: string;
  imageUrl?: string | null;
  cuisine?: string | null;
  ingredients?: string[];
  className?: string;
  /** width / height */
  aspect?: number;
  priority?: boolean;
  rounded?: string;
};

const BACKGROUNDS: Record<string, string[]> = {
  asian: ["#E7D8C6", "#DCCDB7", "#E9DFD0", "#D9C8B2"],
  mediterranean: ["#E4E2D1", "#E8DCC6", "#DCDDC9", "#EADFC9"],
  "middle eastern": ["#EBD8C2", "#E5D0BA", "#EDDCC8", "#E3CDB5"],
  other: ["#E6DDCF", "#E2D8C8", "#E9E0D2"],
};

const PLATES = ["#F8F4EC", "#F3EEE4", "#2F3431", "#EFE7DA", "#FBF8F2"];

const INGREDIENT_COLORS: [RegExp, string, "blob" | "dots" | "leaf" | "slice" | "base"][] = [
  [/salmon/, "#E48B72", "blob"],
  [/tuna/, "#C65B5B", "blob"],
  [/prawn/, "#EE9D78", "blob"],
  [/chicken/, "#DDB988", "blob"],
  [/beef|steak|mince/, "#8A4B3B", "blob"],
  [/tofu|halloumi/, "#EFE0BB", "blob"],
  [/egg/, "#F2C94C", "slice"],
  [/avocado/, "#A6B868", "slice"],
  [/cucumber/, "#A2BE83", "slice"],
  [/courgette/, "#7F9B4D", "slice"],
  [/tomato/, "#D8573E", "slice"],
  [/red pepper/, "#D1553A", "slice"],
  [/lemon/, "#EFD36A", "slice"],
  [/lime/, "#B6C85A", "slice"],
  [/radish/, "#D66A7A", "slice"],
  [/carrot|sweet potato/, "#E58A42", "slice"],
  [/cauliflower/, "#EEE3CB", "blob"],
  [/broccoli|pak choi|spinach|kale|rocket|salad leaves/, "#5F7F43", "leaf"],
  [/cabbage/, "#8B5A86", "leaf"],
  [/aubergine/, "#5B3B5A", "blob"],
  [/mushroom/, "#A68B6E", "blob"],
  [/chickpea/, "#E0B574", "dots"],
  [/edamame/, "#8CB25B", "dots"],
  [/pomegranate/, "#B63543", "dots"],
  [/olive/, "#4E4B37", "dots"],
  [/coriander|parsley|mint|basil|dill/, "#6C8C4A", "leaf"],
  [/spring onion/, "#8DAA5B", "dots"],
  [/sesame/, "#F4EAD4", "dots"],
  [/chilli/, "#C8412E", "dots"],
  [/peanut/, "#C99356", "dots"],
  [/feta|burrata|mozzarella|greek yogurt|labneh/, "#FAF6EE", "blob"],
  [/tahini/, "#D8BE92", "blob"],
  [/rice|orzo|couscous|quinoa|bulgur/, "#FBF7EE", "base"],
  [/noodle|pasta|spaghetti|penne/, "#EAD39F", "base"],
  [/pitta|flatbread/, "#E3C38E", "base"],
];

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function composition(id: string, cuisine: string | null | undefined, ingredients: string[]) {
  const rand = rng(id);
  const family = cuisineFamily(cuisine) ?? "other";
  const bgs = BACKGROUNDS[family] ?? BACKGROUNDS.other!;
  const bg = bgs[Math.floor(rand() * bgs.length)]!;
  const plate = rand() < 0.18 ? PLATES[2]! : PLATES[Math.floor(rand() * 2)]!;
  const found: { color: string; kind: "blob" | "dots" | "leaf" | "slice" | "base" }[] = [];
  for (const name of ingredients) {
    const hit = INGREDIENT_COLORS.find(([re]) => re.test(name));
    if (hit && !found.some((f) => f.color === hit[1])) found.push({ color: hit[1], kind: hit[2] });
  }
  const base = found.find((f) => f.kind === "base");
  const toppings = found.filter((f) => f.kind !== "base").slice(0, 6);
  if (!toppings.length) toppings.push({ color: "#C9866B", kind: "blob" }, { color: "#68735B", kind: "leaf" });
  return { rand, bg, plate, base, toppings };
}

export function GeneratedCover({ id, cuisine, ingredients = [], className }: { id: string; cuisine?: string | null; ingredients?: string[]; className?: string }) {
  const { rand, bg, plate, base, toppings } = composition(id, cuisine, ingredients);
  const W = 400;
  const H = 500;
  const cx = W / 2 + (rand() - 0.5) * 60;
  const cy = H / 2 + (rand() - 0.5) * 70;
  const R = 150 + rand() * 25;
  const dark = plate === PLATES[2];
  const shapes: React.ReactNode[] = [];
  const n = toppings.length;
  toppings.forEach((t, i) => {
    const angle = (i / n) * Math.PI * 2 + rand() * 0.6;
    const dist = R * (0.28 + rand() * 0.3);
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    const rot = rand() * 180;
    if (t.kind === "blob") {
      shapes.push(<ellipse key={`b${i}`} cx={x} cy={y} rx={R * 0.3} ry={R * 0.19} fill={t.color} transform={`rotate(${rot} ${x} ${y})`} />);
      shapes.push(<ellipse key={`bh${i}`} cx={x - 6} cy={y - 5} rx={R * 0.18} ry={R * 0.06} fill="#fff" opacity={0.18} transform={`rotate(${rot} ${x} ${y})`} />);
    } else if (t.kind === "slice") {
      for (let k = 0; k < 4; k++) {
        const sx = x + (k - 1.5) * R * 0.1;
        const sy = y + (rand() - 0.5) * 12;
        shapes.push(<circle key={`s${i}${k}`} cx={sx} cy={sy} r={R * 0.1} fill={t.color} stroke="#fff" strokeOpacity={0.35} strokeWidth={3} />);
      }
    } else if (t.kind === "leaf") {
      for (let k = 0; k < 5; k++) {
        const lx = x + (rand() - 0.5) * R * 0.5;
        const ly = y + (rand() - 0.5) * R * 0.5;
        shapes.push(<ellipse key={`l${i}${k}`} cx={lx} cy={ly} rx={R * 0.085} ry={R * 0.035} fill={t.color} transform={`rotate(${rand() * 180} ${lx} ${ly})`} />);
      }
    } else {
      for (let k = 0; k < 14; k++) {
        const a = rand() * Math.PI * 2;
        const d = rand() * R * 0.75;
        shapes.push(<circle key={`d${i}${k}`} cx={cx + Math.cos(a) * d} cy={cy + Math.sin(a) * d} r={2 + rand() * 4} fill={t.color} />);
      }
    }
  });
  const filterId = `grain-${Math.floor(rng(id + "#id")() * 1e9).toString(36)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-hidden="true">
      <defs>
        <filter id={filterId}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0.07" />
          </feComponentTransfer>
          <feBlend mode="multiply" in2="SourceGraphic" />
        </filter>
        <radialGradient id={`${filterId}-shade`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.08" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={bg} />
      {/* napkin & cutlery for a flat-lay feel */}
      <rect x={cx + R * 0.9} y={cy - R * 1.25} width={R * 0.55} height={R * 2.1} rx={6} fill="#fff" opacity={0.35} transform={`rotate(${8 + rand() * 6} ${cx} ${cy})`} />
      <circle cx={cx + 8} cy={cy + 14} r={R + 6} fill="#000" opacity={0.08} />
      <circle cx={cx} cy={cy} r={R} fill={plate} />
      <circle cx={cx} cy={cy} r={R * 0.8} fill="none" stroke={dark ? "#ffffff" : "#000000"} strokeOpacity={0.06} strokeWidth={2} />
      {base && <circle cx={cx + (rand() - 0.5) * 20} cy={cy + (rand() - 0.5) * 20} r={R * 0.62} fill={base.color} />}
      {shapes}
      <circle cx={cx} cy={cy} r={R} fill={`url(#${filterId}-shade)`} />
      <rect width={W} height={H} filter={`url(#${filterId})`} fill="transparent" />
    </svg>
  );
}

export function RecipeImage({ id, title, imageUrl, cuisine, ingredients, className = "", aspect = 4 / 5, priority, rounded = "rounded-[20px]" }: Props) {
  const [failed, setFailed] = useState(false);
  const showPhoto = !!imageUrl && !failed;
  return (
    <div className={`relative overflow-hidden bg-sand ${rounded} ${className}`} style={{ aspectRatio: String(aspect) }}>
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl!}
          alt={title}
          loading={priority ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <GeneratedCover id={id} cuisine={cuisine} ingredients={ingredients} className="absolute inset-0 h-full w-full" />
      )}
    </div>
  );
}
