import { z } from "zod";
import { handler, api } from "@/server/context";
import { RecipeDraft } from "@/core/domain/schemas";
import { confirmImport } from "@/server/services/imports";

const Body = z.object({ importId: z.string().uuid().nullable().optional(), draft: RecipeDraft });

async function postHandler(req: Request) {
  const { importId, draft } = Body.parse(await req.json());
  return api(async (ctx) => ({ id: await confirmImport(ctx, importId ?? null, draft) }));
}

export const POST = handler(postHandler);
