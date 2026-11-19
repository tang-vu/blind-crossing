// Run against a built site. Set TEST_URL to check the public deployment.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { verifyBundle } from "../src/verify.mjs";
import { pairs, routes, totals } from "../src/simulation.mjs";

const base = (process.env.TEST_URL || "http://127.0.0.1:4173").replace(
  /\/?$/,
  "/",
);
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || undefined,
});
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "?plan=CA");
  await page.waitForFunction(
    () => document.querySelector("#score").textContent === "90",
  );
  assert.equal(await page.locator("#gained").textContent(), "30");
  assert.equal(await page.locator("#lost").textContent(), "2");
  assert.equal(await page.locator("#kept").textContent(), "60");
  await page.locator("#compare").click();
  assert.equal(await page.locator("#score").textContent(), "62");
  await page.locator("#traffic").click();
  assert.equal(await page.locator(".footcount:visible").count(), 8);
  await page.locator("#all-plans summary").click();
  assert.equal(await page.locator("#matrix button").count(), pairs.length);
  for (const pair of pairs) {
    const button = page.getByRole("button", {
      name: [...pair].join(" + ") + ", " + totals[pair] + " students",
      exact: true,
    });
    await button.click();
    assert.equal(new URL(page.url()).searchParams.get("plan"), pair);
    assert.equal(
      await page.locator("#score").textContent(),
      String(totals[pair]),
    );
    assert.equal(await button.getAttribute("aria-pressed"), "true");
    const stats = await page
      .locator("#marks i")
      .evaluateAll((dots) => dots.map((d) => d.className));
    assert.equal(stats.length, routes.length);
    stats.forEach((state, i) => {
      const baseline = /[AB]/.test(routes[i]);
      const covered = [...pair].some((p) => routes[i].includes(p));
      assert.equal(
        state,
        covered
          ? baseline
            ? "kept"
            : "gained"
          : baseline
            ? "lost"
            : "neither",
      );
    });
  }
  await page.setViewportSize({ width: 320, height: 740 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.locator("#inspect").click();
  await page.waitForSelector('#inspection[data-state="verified"]');
  assert.deepEqual(await page.locator("#proof-totals td").allTextContents(), [
    "1",
    "2",
  ]);
  await page.locator("#omit").click();
  await page.waitForSelector('#inspection[data-state="refused"]');
  assert.match(
    await page.locator("#checks").textContent(),
    /Missing contribution: qor1/,
  );
  assert.equal(await page.locator("#proof-totals").isVisible(), false);
  assert.equal(await page.locator("#proof-ac").textContent(), "");
  await page.locator("#omit").click();
  await page.waitForSelector('#inspection[data-state="verified"]');
  assert.equal(await page.locator("#wallets tr").count(), 3);

  await page.goto(base + "lab.html");
  let lastId;
  for (const [route, expected] of [
    [["B"], { AB: 1, AC: 1 }],
    [["A", "C"], { AB: 1, AC: 2 }],
  ]) {
    await page.locator("#prepare").click();
    await page.waitForSelector("#lab-picker:visible", { timeout: 65000 });
    for (const point of route)
      await page.getByRole("checkbox", { name: point, exact: true }).check();
    await page.locator("#sign").click();
    await page.waitForSelector("#lab-result:visible");
    const download = page.waitForEvent("download");
    await page.locator("#lab-download").click();
    const chunks = [];
    for await (const chunk of await (await download).createReadStream())
      chunks.push(chunk);
    const bundle = JSON.parse(Buffer.concat(chunks));
    assert.equal(bundle.round.mode, "rehearsal");
    assert.deepEqual(verifyBundle(bundle), expected);
    assert.equal(
      await page.locator("#lab-ab").textContent(),
      String(expected.AB),
    );
    assert.equal(
      await page.locator("#lab-ac").textContent(),
      String(expected.AC),
    );
    assert.notEqual(bundle.round.id, lastId);
    lastId = bundle.round.id;
    await page.locator("#reset").click();
  }
  assert.deepEqual(errors, []);
  console.log(
    "All 28 plans and 2,800 route states, negative and restored Diana verification, and two fresh signed worker rounds passed.",
  );
} finally {
  await browser.close();
}
