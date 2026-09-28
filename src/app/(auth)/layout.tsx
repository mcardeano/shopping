import { redirect } from "next/navigation";
import { sessionUserId } from "@/server/auth/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await sessionUserId()) redirect("/");
  return <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-bg">{children}</div>;
}
