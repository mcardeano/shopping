import { z } from "zod";
import { handler, api } from "@/server/context";
import { addMember } from "@/server/repos/misc";

async function postHandler(req: Request) {
  const { name, role } = z.object({ name: z.string().trim().min(1).max(40), role: z.enum(["partner", "child", "other"]) }).parse(await req.json());
  return api(async (ctx) => {
    await addMember(ctx.sql, ctx.householdId, name, role);
    return { ok: true };
  });
}

export const POST = handler(postHandler);
