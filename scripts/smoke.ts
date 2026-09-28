import { createPgliteDatabase } from "../src/server/db/driver";
import { runMigrations } from "../src/server/db";
import { seedReferenceData } from "../src/server/seed/reference";
import { seedDemoAccount } from "../src/server/seed/demo";

const t0 = Date.now();
const db = await createPgliteDatabase("memory://");
await runMigrations(db);
await db.asService((sql) => seedReferenceData(sql));
console.log("migrated", Date.now() - t0);
await seedDemoAccount(db);
console.log("seeded", Date.now() - t0);
const uid = (await db.asService((sql) => sql.one<{ id: string }>("select id from auth.users")))!.id;
await db.asUser(uid, async (sql) => {
  console.log(await sql.query("select count(*)::int n from recipes"));
  console.log(await sql.query("select label, score, source, confidence, household_member_id is null as self from taste_preferences order by score desc"));
  console.log(await sql.query("select display_name, status, category from shopping_list_items"));
});
// RLS: another user sees nothing
const other = (await db.asService((sql) => sql.one<{ id: string }>("insert into auth.users (email, encrypted_password) values ('x@y.z','x') returning id")))!.id;
await db.asUser(other, async (sql) => console.log("other sees recipes:", await sql.query("select count(*)::int n from recipes"), await sql.query("select count(*)::int n from purchase_items")));
