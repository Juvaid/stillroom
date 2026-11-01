import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const still = `<div data-remotion-comp="HelloWorld" style="position:relative;width:960px;height:540px;background:#fff;font-family:Arial,sans-serif">
  <div style="position:absolute;top:0;left:0;right:0;bottom:0;width:100%;height:100%;display:flex;justify-content:center;align-items:center">
    <h1 style="font-size:64px;margin:0;color:#111">Welcome to Remotion</h1>
  </div>
  <div style="position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center">
    <div style="background:#0b84f3;color:#fff;padding:16px 28px;border-radius:12px">Get started</div>
  </div>
</div>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1100 } });
await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Source" }).click().catch(() => {});
const markup = page.getByRole("textbox", { name: /Markup/ });
await markup.fill(still);
await page.getByText("div type").waitFor({ timeout: 20000 });
await page.waitForFunction(() => !document.body.innerText.includes("pressing"));
await page.getByRole("button", { name: "Frame", exact: true }).click();

const title = page.frameLocator("iframe[title='Composition frame']").locator("h1");
const before = await title.boundingBox();
if (!before) throw new Error("The Remotion title is not on the frame.");
const overlay = page.locator("[data-edit-layer]");
const layer = await overlay.boundingBox();
if (!layer) throw new Error("The edit layer is not on the stage.");
await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
await page.mouse.down();
await page.mouse.move(before.x + before.width / 2 + 120, before.y + before.height / 2 + 70, { steps: 10 });
await page.mouse.up();
await page.waitForFunction(() => !document.body.innerText.includes("pressing"), undefined, { timeout: 20000 });
await page.waitForTimeout(500);
const after = await title.boundingBox();
const html = await markup.inputValue();
await browser.close();
const movedX = after && before ? after.x - before.x : 0;
const movedY = after && before ? after.y - before.y : 0;
const wrote = /data-layer="welcome-to-remotion"/.test(html) && /left:\d+px/.test(html);
console.log(JSON.stringify({ before, after, movedX, movedY, wrote }, null, 2));
if (!after || Math.abs(movedX - 120) > 20 || Math.abs(movedY - 70) > 20 || !wrote) {
  writeFileSync("/tmp/edit-live.html", html);
  process.exit(1);
}
