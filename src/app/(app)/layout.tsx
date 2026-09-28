import { BottomNavigation } from "@/components/BottomNavigation";
import { Toaster } from "@/components/Toaster";
import { asViewer } from "@/server/context";
import { getShoppingView } from "@/server/services/shopping";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const openCount = await asViewer(async (ctx) => (await getShoppingView(ctx)).totalOpen);
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[480px] bg-bg shadow-[0_0_0_1px_var(--color-line),0_30px_80px_-40px_rgb(33_33_31/0.35)]">
      <main className="pb-[96px]">{children}</main>
      <BottomNavigation shoppingCount={openCount} />
      <Toaster />
    </div>
  );
}
