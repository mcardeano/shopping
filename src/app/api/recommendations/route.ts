import { handler, api } from "@/server/context";
import { RecommendBody } from "@/core/domain/schemas";
import { recommendForViewer } from "@/server/services/recommend";

async function postHandler(req: Request) {
  const body = RecommendBody.parse(await req.json());
  return api((ctx) => recommendForViewer(ctx, body));
}

export const POST = handler(postHandler);
