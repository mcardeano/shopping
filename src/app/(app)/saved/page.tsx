import { asViewer } from "@/server/context";
import { searchLibrary } from "@/server/services/recipes";
import { SavedLibrary } from "./SavedLibrary";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved" };

export default async function SavedPage({ searchParams }: { searchParams: Promise<{ q?: string; chip?: string }> }) {
  const { q = "", chip = "all" } = await searchParams;
  const result = await asViewer((ctx) => searchLibrary(ctx, q, chip === "all" ? undefined : chip));
  return <SavedLibrary initialQuery={q} initialChip={chip} result={result} />;
}
