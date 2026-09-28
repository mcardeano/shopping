import { asViewer } from "@/server/context";
import { getShoppingView } from "@/server/services/shopping";
import { ShoppingScreen } from "./ShoppingScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shopping" };

export default async function ShoppingPage() {
  const view = await asViewer((ctx) => getShoppingView(ctx));
  return <ShoppingScreen view={view} />;
}
