import { AddRecipe } from "./AddRecipe";

export const metadata = { title: "Save a recipe" };

export default async function AddPage({ searchParams }: { searchParams: Promise<{ method?: string; url?: string; text?: string; title?: string; edit?: string }> }) {
  const sp = await searchParams;
  // `url`/`text` arrive from the Web Share Target (and, later, native share extensions).
  const shared = sp.url || sp.text ? { url: sp.url, text: [sp.title, sp.text].filter(Boolean).join("\n") } : undefined;
  return <AddRecipe initialMethod={sp.method} shared={shared} editId={sp.edit} />;
}
