import { handler, api } from "@/server/context";
import { FeedbackBody } from "@/core/domain/schemas";
import { submitFeedback } from "@/server/services/recipes";
import { ai } from "@/server/ai";

async function postHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = FeedbackBody.parse(await req.json());
  // Interpret the free text before opening the transaction (may call a model).
  const signals = body.comment?.trim() ? await ai().interpretFeedback({ comment: body.comment, reaction: body.reaction }) : null;
  return api(async (ctx) => {
    await submitFeedback(ctx, id, body, signals);
    return { ok: true, signals };
  });
}

export const POST = handler(postHandler);
