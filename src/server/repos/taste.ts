import type { Sql } from "../db/driver";
import type { TastePreference } from "@/core/domain/types";
import type { PreferenceSource, TasteEntityType } from "@/core/domain/schemas";
import { iso, num, str } from "./rows";

function map(r: Record<string, unknown>): TastePreference {
  return {
    id: String(r.id),
    memberId: str(r.household_member_id),
    entityType: r.entity_type as TasteEntityType,
    value: String(r.value),
    label: String(r.label),
    score: num(r.score) ?? 0,
    source: r.source as PreferenceSource,
    confidence: num(r.confidence) ?? 0.5,
    evidenceCount: Number(r.evidence_count ?? 1),
    status: r.status as TastePreference["status"],
    originalText: str(r.original_text),
    updatedAt: iso(r.updated_at),
  };
}

export async function listPreferences(sql: Sql): Promise<TastePreference[]> {
  const rows = await sql.query("select * from taste_preferences order by abs(score) * confidence desc");
  return rows.map(map);
}

/**
 * Writes an inferred preference. Never overrides something the user stated explicitly,
 * and never resurrects something the user dismissed (its score is refreshed, status kept).
 */
export async function upsertInferred(
  sql: Sql,
  owner: { householdId: string; userId: string },
  p: { memberId: string | null; entityType: TasteEntityType; value: string; label: string; score: number; confidence: number; evidenceCount: number; source: PreferenceSource },
): Promise<void> {
  const existing = await sql.one<{ id: string; source: string; status: string }>(
    "select id, source, status from taste_preferences where entity_type = $1 and value = $2 and household_member_id is not distinct from $3",
    [p.entityType, p.value, p.memberId],
  );
  if (existing) {
    if (existing.source === "explicit") return;
    await sql.query("update taste_preferences set score=$2, confidence=$3, evidence_count=$4, source=$5, label=$6, updated_at=now() where id=$1", [existing.id, p.score, p.confidence, p.evidenceCount, p.source, p.label]);
    return;
  }
  await sql.query(
    `insert into taste_preferences (household_id, user_id, household_member_id, entity_type, value, label, score, source, confidence, evidence_count)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [owner.householdId, owner.userId, p.memberId, p.entityType, p.value, p.label, p.score, p.source, p.confidence, p.evidenceCount],
  );
}

/** Removes inferred preferences that are no longer supported by evidence (keeps explicit/dismissed/confirmed). */
export async function pruneInferred(sql: Sql, keepKeys: Set<string>): Promise<void> {
  const rows = await sql.query<{ id: string; entity_type: string; value: string; household_member_id: string | null }>(
    "select id, entity_type, value, household_member_id from taste_preferences where source <> 'explicit' and source <> 'seed' and status = 'active'",
  );
  const stale = rows.filter((r) => !keepKeys.has(`${r.household_member_id ?? "self"}:${r.entity_type}:${r.value}`)).map((r) => r.id);
  if (stale.length) await sql.query("delete from taste_preferences where id = any($1::uuid[])", [stale]);
}

export async function upsertExplicit(
  sql: Sql,
  owner: { householdId: string; userId: string },
  p: { memberId: string | null; entityType: TasteEntityType; value: string; label: string; score: number; originalText?: string | null },
): Promise<void> {
  const existing = await sql.one<{ id: string }>(
    "select id from taste_preferences where entity_type = $1 and value = $2 and household_member_id is not distinct from $3",
    [p.entityType, p.value, p.memberId],
  );
  if (existing) {
    await sql.query(
      "update taste_preferences set score=$2, label=$3, source='explicit', confidence=1, status='confirmed', original_text=coalesce($4, original_text), updated_at=now() where id=$1",
      [existing.id, p.score, p.label, p.originalText ?? null],
    );
    return;
  }
  await sql.query(
    `insert into taste_preferences (household_id, user_id, household_member_id, entity_type, value, label, score, source, confidence, status, original_text)
     values ($1,$2,$3,$4,$5,$6,$7,'explicit',1,'confirmed',$8)`,
    [owner.householdId, owner.userId, p.memberId, p.entityType, p.value, p.label, p.score, p.originalText ?? null],
  );
}

export async function updatePreference(sql: Sql, id: string, patch: { status?: string; label?: string; score?: number }): Promise<void> {
  // Confirming an inferred preference turns it into something the user has stated.
  await sql.query(
    `update taste_preferences set
       status = coalesce($2, status),
       label = coalesce($3, label),
       score = coalesce($4, score),
       source = case when $2 = 'confirmed' or $3 is not null or $4 is not null then 'explicit' else source end,
       confidence = case when $2 = 'confirmed' then 1 else confidence end,
       updated_at = now()
     where id = $1`,
    [id, patch.status ?? null, patch.label ?? null, patch.score ?? null],
  );
}

export async function deletePreference(sql: Sql, id: string): Promise<void> {
  // Deleting an inferred preference is remembered as "dismissed" so inference won't bring it back.
  const row = await sql.one<{ source: string }>("select source from taste_preferences where id = $1", [id]);
  if (!row) return;
  if (row.source === "explicit") await sql.query("delete from taste_preferences where id = $1", [id]);
  else await sql.query("update taste_preferences set status = 'dismissed', updated_at = now() where id = $1", [id]);
}
