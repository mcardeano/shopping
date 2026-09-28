import { handler, api } from "@/server/context";
import { getWeek } from "@/server/services/plan";
import { mondayOf } from "@/server/time";

async function getHandler(req: Request) {
  const week = new URL(req.url).searchParams.get("week");
  return api((ctx) => getWeek(ctx, week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : mondayOf(new Date())));
}

export const GET = handler(getHandler);
