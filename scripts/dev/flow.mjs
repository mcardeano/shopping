import { chromium } from "playwright";
const S = process.env.S ?? "./.data/screenshots";
import fs from "node:fs";
fs.mkdirSync(S, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text()));
const shot = async (n) => { await page.waitForTimeout(500); await page.screenshot({ path: `${S}/flow_${n}.png` }); console.log("shot", n); };
const B = "http://localhost:3000";

await page.goto(B + "/login");
await page.getByRole("button", { name: /demo household/i }).click();
await page.waitForURL(B + "/");

// 1. Ask
await page.getByLabel("Ask about dinner").fill("Something Asian with salmon under 30 minutes");
await page.getByLabel("Ask about dinner").press("Enter");
await page.waitForURL(/\/cook/);
await page.waitForLoadState("networkidle");
await shot("1_cook");
const titles = await page.locator("article h3").allTextContents();
console.log("recs:", titles);

// 2. Open miso salmon bowl, add to Thursday
await page.goto(B + "/saved?q=miso");
await page.locator("a[href^='/recipes/']").first().click();
await page.waitForURL(/\/recipes\//);
await shot("2_recipe");
await page.getByRole("button", { name: /add to plan/i }).click();
await page.getByRole("dialog").getByRole("button", { name: /thursday/i }).first().click();
await page.waitForTimeout(1200);
await shot("3_planned");

// 3. Shawarma → Friday
await page.goto(B + "/saved?q=shawarma");
await page.locator("a[href^='/recipes/']").first().click();
await page.waitForURL(/\/recipes\//);
await page.getByRole("button", { name: /add to plan/i }).click();
await page.getByRole("dialog").getByRole("button", { name: /friday/i }).first().click();
await page.waitForTimeout(1200);

// 4. Shopping + quick add
await page.goto(B + "/shopping");
await page.getByLabel("Add to shopping list").fill("Dishwasher tablets, bananas and toothpaste");
await page.getByLabel("Add to shopping list").press("Enter");
await page.waitForTimeout(1500);
await shot("4_shopping");
await page.screenshot({ path: `${S}/flow_4b_shopping_full.png`, fullPage: true });

// 5. Open an item sheet
await page.getByRole("button", { name: /^Greek yogurt/ }).first().click().catch(() => console.log("no yogurt row"));
await page.waitForTimeout(900);
await shot("5_item");
await page.keyboard.press("Escape");

// 6. Plan page
await page.goto(B + "/plan");
await shot("6_plan");

// 7. Add recipe via text
await page.goto(B + "/add");
await page.getByRole("button", { name: /paste text/i }).click();
await page.locator("textarea").fill(`Crispy gochujang chicken rice bowl 🔥\nServes 2 · 25 mins\n\nIngredients\n- 400g chicken thighs\n- 2 tbsp gochujang\n- 1 tbsp soy sauce\n- 1 tbsp honey\n- 2 tbsp cornflour\n- 150g jasmine rice\n- 1 cucumber\n- 2 spring onions\n- sesame seeds\n\nMethod\n1. Toss the chicken in cornflour and fry until crisp, about 8 minutes.\n2. Mix gochujang, soy and honey and toss with the chicken.\n3. Serve over rice with cucumber, spring onions and sesame.\n#dinner #korean`);
await page.getByRole("button", { name: /find the recipe/i }).click();
await page.getByText(/we found this recipe/i).waitFor({ timeout: 15000 });
await shot("7_review");
await page.getByRole("button", { name: /^save$/i }).click();
await page.waitForURL(/\/recipes\//);
await shot("8_saved_recipe");

// 8. Taste
await page.goto(B + "/profile");
await page.getByLabel("Tell me a preference").fill("I don't really like blue cheese");
await page.getByRole("button", { name: /tell me/i }).click();
await page.waitForTimeout(1500);
await shot("9_taste");

// 9. Home after
await page.goto(B + "/");
await page.screenshot({ path: `${S}/flow_10_home_full.png`, fullPage: true });
await browser.close();
