import { chromium } from "playwright";
const S = process.env.S;
const pages = (process.argv[2] ?? "/,/saved,/cook,/plan,/shopping,/profile").split(",");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text()));
await page.goto("http://localhost:3000/login");
await page.getByRole("button", { name: /demo household/i }).click();
await page.waitForURL("http://localhost:3000/");
for (const p of pages) {
  await page.goto("http://localhost:3000" + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const name = p.replace(/[^a-z0-9]+/gi, "_") || "home";
  await page.screenshot({ path: `${S}/shot${name}.png`, fullPage: process.env.FULL === "1" });
  console.log("shot", name);
}
await browser.close();
