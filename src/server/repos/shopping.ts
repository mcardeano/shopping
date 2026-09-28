import type { Sql } from "../db/driver";
import type { ShoppingCategory } from "@/core/domain/categories";
import type { ItemSourceType, ItemStatus } from "@/core/domain/schemas";
import type { ShoppingItemSource } from "@/core/domain/types";
import { iso, isoOrNull, num, str } from "./rows";

export type ItemRow = {
  id: string;
  rawText: string;
  normalizedName: string;
  displayName: string;
  ingredientId: string | null;
  shoppingProductId: string | null;
  preferredRetailProductId: string | null;
  category: ShoppingCategory;
  note: string | null;
  status: ItemStatus;
  statusOverridden: boolean;
  checked: boolean;
  checkedAt: string | null;
  createdAt: string;
  sources: ShoppingItemSource[];
  quantityOverride: number | null;
  unitOverride: string | null;
};

export async function activeListId(sql: Sql, householdId: string): Promise<string> {
  const row = await sql.one<{ id: string }>("select id from shopping_lists where household_id = $1 and is_active", [householdId]);
  if (row) return String(row.id);
  const created = await sql.one<{ id: string }>("insert into shopping_lists (household_id, name, is_active) values ($1, 'Shopping', true) returning id", [householdId]);
  return String(created!.id);
}

export async function listItems(sql: Sql, listId: string): Promise<ItemRow[]> {
  const items = await sql.query("select * from shopping_list_items where shopping_list_id = $1 order by created_at", [listId]);
  if (!items.length) return [];
  const sources = await sql.query("select * from shopping_list_item_sources where shopping_list_item_id = any($1::uuid[]) order by created_at", [items.map((i) => i.id)]);
  const by = new Map<string, ShoppingItemSource[]>();
  for (const s of sources) {
    const k = String(s.shopping_list_item_id);
    by.set(k, [
      ...(by.get(k) ?? []),
      { id: String(s.id), type: s.source_type as ItemSourceType, sourceId: str(s.source_id), label: str(s.label), quantity: num(s.quantity), unit: str(s.unit) },
    ]);
  }
  return items.map((i) => ({
    id: String(i.id),
    rawText: String(i.raw_text),
    normalizedName: String(i.normalized_name),
    displayName: String(i.display_name),
    ingredientId: str(i.ingredient_id),
    shoppingProductId: str(i.shopping_product_id),
    preferredRetailProductId: str(i.preferred_retail_product_id),
    category: i.category as ShoppingCategory,
    note: str(i.note),
    status: i.status as ItemStatus,
    statusOverridden: Boolean(i.status_overridden),
    checked: Boolean(i.checked),
    checkedAt: isoOrNull(i.checked_at),
    createdAt: iso(i.created_at),
    sources: by.get(String(i.id)) ?? [],
    quantityOverride: num(i.quantity_override),
    unitOverride: str(i.unit_override),
  }));
}

export async function insertItem(
  sql: Sql,
  listId: string,
  householdId: string,
  i: { rawText: string; normalizedName: string; displayName: string; category: ShoppingCategory; note?: string | null; status: ItemStatus; ingredientName?: string; productName?: string },
): Promise<string> {
  const row = await sql.one<{ id: string }>(
    `insert into shopping_list_items (shopping_list_id, household_id, raw_text, normalized_name, display_name, category, note, status, ingredient_id, shopping_product_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,
       (select id from ingredients where canonical_name = $9),
       (select id from shopping_products where canonical_name = $10))
     on conflict (shopping_list_id, normalized_name) do update set updated_at = now()
     returning id`,
    [listId, householdId, i.rawText, i.normalizedName, i.displayName, i.category, i.note ?? null, i.status, i.ingredientName ?? null, i.productName ?? null],
  );
  return String(row!.id);
}

export async function addSource(sql: Sql, itemId: string, s: { type: ItemSourceType; sourceId?: string | null; label?: string | null; quantity?: number | null; unit?: string | null }): Promise<void> {
  await sql.query("insert into shopping_list_item_sources (shopping_list_item_id, source_type, source_id, label, quantity, unit) values ($1,$2,$3,$4,$5,$6)", [
    itemId,
    s.type,
    s.sourceId ?? null,
    s.label ?? null,
    s.quantity ?? null,
    s.unit ?? null,
  ]);
}

/** Adds to an existing manual source's quantity ("get another Greek yogurt"). */
export async function bumpManualSource(sql: Sql, itemId: string, delta: number, unit: string | null): Promise<boolean> {
  const src = await sql.one<{ id: string; quantity: string | null; unit: string | null }>(
    "select id, quantity, unit from shopping_list_item_sources where shopping_list_item_id = $1 and source_type = 'manual' order by created_at limit 1",
    [itemId],
  );
  if (!src) return false;
  if (src.unit && unit && src.unit !== unit) return false;
  const base = src.quantity != null ? Number(src.quantity) : 1;
  await sql.query("update shopping_list_item_sources set quantity = $2, unit = coalesce(unit, $3) where id = $1", [src.id, base + delta, unit]);
  return true;
}

export async function setQuantityOverride(sql: Sql, itemId: string, quantity: number | null, unit: string | null): Promise<void> {
  await sql.query("update shopping_list_items set quantity_override = $2, unit_override = $3, updated_at = now() where id = $1", [itemId, quantity, unit]);
}

/**
 * Removes every source that came from a recipe / plan item and deletes items left with
 * no sources. Manual sources are never touched — manual items survive plan changes.
 */
export async function removeSourcesFor(sql: Sql, listId: string, type: "recipe" | "meal_plan", sourceIds: string[]): Promise<void> {
  if (!sourceIds.length) return;
  await sql.query(
    `delete from shopping_list_item_sources s using shopping_list_items i
     where s.shopping_list_item_id = i.id and i.shopping_list_id = $1 and s.source_type = $2 and s.source_id = any($3::uuid[])`,
    [listId, type, sourceIds],
  );
  await deleteOrphans(sql, listId);
}

export async function deleteOrphans(sql: Sql, listId: string): Promise<void> {
  await sql.query(
    `delete from shopping_list_items i where i.shopping_list_id = $1 and not i.checked
       and not exists (select 1 from shopping_list_item_sources s where s.shopping_list_item_id = i.id)`,
    [listId],
  );
}

export async function sourceIdsOfType(sql: Sql, listId: string, type: ItemSourceType): Promise<string[]> {
  const rows = await sql.query<{ source_id: string }>(
    `select distinct s.source_id from shopping_list_item_sources s join shopping_list_items i on i.id = s.shopping_list_item_id
     where i.shopping_list_id = $1 and s.source_type = $2 and s.source_id is not null`,
    [listId, type],
  );
  return rows.map((r) => String(r.source_id));
}

export async function updateItem(
  sql: Sql,
  id: string,
  patch: { displayName?: string; note?: string | null; category?: string; status?: ItemStatus; statusOverridden?: boolean; checked?: boolean; preferredRetailProductId?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  const set = (col: string, v: unknown) => {
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.displayName !== undefined) set("display_name", patch.displayName);
  if (patch.note !== undefined) set("note", patch.note);
  if (patch.category !== undefined) set("category", patch.category);
  if (patch.status !== undefined) set("status", patch.status);
  if (patch.statusOverridden !== undefined) set("status_overridden", patch.statusOverridden);
  if (patch.preferredRetailProductId !== undefined) set("preferred_retail_product_id", patch.preferredRetailProductId);
  if (patch.checked !== undefined) {
    set("checked", patch.checked);
    sets.push(patch.checked ? "checked_at = now()" : "checked_at = null");
  }
  if (!sets.length) return;
  await sql.query(`update shopping_list_items set ${sets.join(", ")}, updated_at = now() where id = $1`, params);
}

export async function deleteItem(sql: Sql, id: string): Promise<void> {
  await sql.query("delete from shopping_list_items where id = $1", [id]);
}

export async function clearChecked(sql: Sql, listId: string): Promise<void> {
  await sql.query("delete from shopping_list_items where shopping_list_id = $1 and checked", [listId]);
}

export async function appendNote(sql: Sql, itemId: string, note: string): Promise<void> {
  await sql.query(
    "update shopping_list_items set note = case when note is null or note = '' then $2 when position(lower($2) in lower(note)) > 0 then note else note || '; ' || $2 end, updated_at = now() where id = $1",
    [itemId, note],
  );
}
