import type { Sql } from "../db/driver";
import { INGREDIENTS } from "@/core/catalog/ingredients";
import { PRODUCTS } from "@/core/catalog/products";
import { MOCK_PRODUCTS } from "@/core/grocery/mockCatalog";
import { cleanPhrase } from "@/core/services/normalization";

const REFERENCE_VERSION = "2026-09-28.1";

/** Upserts shared reference data (ingredients, products, mock retail catalogue). Idempotent. */
export async function seedReferenceData(sql: Sql): Promise<void> {
  await sql.exec("create table if not exists reference_data_version (id int primary key default 1, version text not null)");
  const current = await sql.one<{ version: string }>("select version from reference_data_version where id = 1");
  if (current?.version === REFERENCE_VERSION) return;

  await sql.query(
    `insert into ingredients (canonical_name, category, is_pantry_staple, typical_repurchase_days)
     select * from unnest($1::text[], $2::text[], $3::boolean[], $4::int[])
     on conflict (canonical_name) do update set category = excluded.category, is_pantry_staple = excluded.is_pantry_staple, typical_repurchase_days = excluded.typical_repurchase_days`,
    [INGREDIENTS.map((i) => i.name), INGREDIENTS.map((i) => i.category), INGREDIENTS.map((i) => (i.stapleness ?? 0) >= 0.5), INGREDIENTS.map((i) => i.repurchaseDays ?? null)],
  );
  const aliases = dedupe(INGREDIENTS.flatMap((i) => (i.aliases ?? []).map((a) => [cleanPhrase(a), i.name] as const)));
  await sql.query(
    `insert into ingredient_aliases (alias, ingredient_id)
     select a.alias, i.id from unnest($1::text[], $2::text[]) as a(alias, name) join ingredients i on i.canonical_name = a.name
     on conflict (alias) do update set ingredient_id = excluded.ingredient_id`,
    [aliases.map((a) => a[0]), aliases.map((a) => a[1])],
  );

  await sql.query(
    `insert into shopping_products (canonical_name, category, typical_repurchase_days)
     select * from unnest($1::text[], $2::text[], $3::int[])
     on conflict (canonical_name) do update set category = excluded.category, typical_repurchase_days = excluded.typical_repurchase_days`,
    [PRODUCTS.map((p) => p.name), PRODUCTS.map((p) => p.category), PRODUCTS.map((p) => p.repurchaseDays ?? null)],
  );
  const productAliases = dedupe(PRODUCTS.flatMap((p) => (p.aliases ?? []).map((a) => [cleanPhrase(a), p.name] as const)));
  await sql.query(
    `insert into shopping_product_aliases (alias, shopping_product_id)
     select a.alias, p.id from unnest($1::text[], $2::text[]) as a(alias, name) join shopping_products p on p.canonical_name = a.name
     on conflict (alias) do update set shopping_product_id = excluded.shopping_product_id`,
    [productAliases.map((a) => a[0]), productAliases.map((a) => a[1])],
  );

  await sql.query(
    `insert into retail_products (provider, external_id, name, brand, ingredient_id, shopping_product_id, pack_size, pack_unit, price, currency)
     select m.provider, m.external_id, m.name, m.brand, i.id, sp.id, m.pack_size, m.pack_unit, m.price, m.currency
     from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[], $7::text[], $8::numeric[], $9::text[])
       as m(provider, external_id, name, brand, item_name, pack_size, pack_unit, price, currency)
     left join ingredients i on i.canonical_name = m.item_name
     left join shopping_products sp on sp.canonical_name = m.item_name
     on conflict (provider, external_id) do update set name = excluded.name, brand = excluded.brand, ingredient_id = excluded.ingredient_id,
       shopping_product_id = excluded.shopping_product_id, pack_size = excluded.pack_size, pack_unit = excluded.pack_unit, price = excluded.price`,
    [
      MOCK_PRODUCTS.map((p) => p.provider),
      MOCK_PRODUCTS.map((p) => p.id),
      MOCK_PRODUCTS.map((p) => p.name),
      MOCK_PRODUCTS.map((p) => p.brand ?? null),
      MOCK_PRODUCTS.map((p) => p.itemName),
      MOCK_PRODUCTS.map((p) => p.packSize ?? null),
      MOCK_PRODUCTS.map((p) => p.packUnit ?? null),
      MOCK_PRODUCTS.map((p) => p.price ?? null),
      MOCK_PRODUCTS.map((p) => p.currency),
    ],
  );

  await sql.query("insert into reference_data_version (id, version) values (1, $1) on conflict (id) do update set version = excluded.version", [REFERENCE_VERSION]);
}

function dedupe(pairs: (readonly [string, string])[]): (readonly [string, string])[] {
  const seen = new Map<string, readonly [string, string]>();
  for (const p of pairs) if (!seen.has(p[0])) seen.set(p[0], p);
  return [...seen.values()];
}
