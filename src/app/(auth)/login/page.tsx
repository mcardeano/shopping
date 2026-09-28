import { env } from "@/server/env";
import { AuthForm } from "../AuthForm";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return <AuthForm mode="login" demoAvailable={!env.DATABASE_URL} />;
}
