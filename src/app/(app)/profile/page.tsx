import { asViewer } from "@/server/context";
import { getTasteView } from "@/server/services/taste";
import { env } from "@/server/env";
import { TasteScreen } from "./TasteScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your Taste" };

export default async function ProfilePage() {
  const data = await asViewer(async (ctx) => {
    const view = await getTasteView(ctx);
    const email = await ctx.sql.one<{ email: string | null }>("select email from profiles where user_id = $1", [ctx.userId]);
    return { view, name: ctx.displayName, email: email?.email ?? null };
  });
  return <TasteScreen {...data} aiProvider={env.ANTHROPIC_API_KEY ? "Claude" : "On-device rules"} />;
}
