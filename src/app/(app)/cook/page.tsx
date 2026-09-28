import { asViewer } from "@/server/context";
import { recommendForViewer } from "@/server/services/recommend";
import { CookAssistant } from "./CookAssistant";

export const dynamic = "force-dynamic";
export const metadata = { title: "What should I cook?" };

export default async function CookPage({ searchParams }: { searchParams: Promise<{ q?: string; max?: string; mood?: string; useUp?: string }> }) {
  const sp = await searchParams;
  const maxMinutes = sp.max && /^\d+$/.test(sp.max) ? Number(sp.max) : undefined;
  const initial = await asViewer((ctx) => recommendForViewer(ctx, { query: sp.q ?? "", mood: sp.mood, maxMinutes, useUp: sp.useUp, exclude: [], limit: 3 }));
  return <CookAssistant initial={initial} initialQuery={sp.q ?? ""} initialMax={maxMinutes} initialMood={sp.mood} initialUseUp={sp.useUp ?? ""} />;
}
