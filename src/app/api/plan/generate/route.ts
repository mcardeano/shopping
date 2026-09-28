import { handler, api } from "@/server/context";
import { PlanWeekBody } from "@/core/domain/schemas";
import { generateWeek } from "@/server/services/plan";

async function postHandler(req: Request) {
  const { weekStart, count, brief } = PlanWeekBody.parse(await req.json());
  return api((ctx) => generateWeek(ctx, weekStart, count, brief));
}

export const POST = handler(postHandler);
