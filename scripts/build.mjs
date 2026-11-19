import { mkdir, copyFile, writeFile, readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";
import { points, pairs, routes, totals } from "../src/simulation.mjs";
import { verifyBundle } from "../src/verify.mjs";
import { verifyEvidence } from "../src/network.mjs";

await mkdir("dist", { recursive: true });
const out = await build({
  entryPoints: ["web/planner.mjs", "web/room.mjs"],
  outdir: "dist",
  bundle: true,
  format: "esm",
  splitting: true,
  entryNames: "[name]",
  chunkNames: "shared-[hash]",
  minify: true,
  metafile: true,
  target: "es2022",
  legalComments: "linked",
});
for (const name of [
  "index.html",
  "room.html",
  "mark.svg",
  "map.svg",
  "style.css",
])
  await copyFile("web/" + name, "dist/" + name);
await copyFile("evidence/rehearsal.json", "dist/rehearsal.json");
for (const name of ["cover.png", "planner-walkthrough.mp4"]) {
  await copyFile("media/" + name, "dist/" + name);
}
let status = { anchor: null };
let archived;
try {
  archived = await readFile("evidence/diana.json", "utf8");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
if (archived) {
  const round = JSON.parse(archived);
  verifyBundle(round);
  if (round.evidence) {
    status = { anchor: await verifyEvidence(round), members: round.round.members.length };
    await writeFile("dist/diana.json", archived);
  }
}
await writeFile("dist/status.json", JSON.stringify(status));
await writeFile(
  "dist/simulation.json",
  JSON.stringify(
    {
      kind: "synthetic-routes/v1",
      points,
      options: [...points, ...pairs],
      routes,
      totals,
    },
    null,
    2,
  ) + "\n",
);
// Ship the full licenses for packages actually embedded in the browser bundle.
const names = new Set(
  Object.keys(out.metafile.inputs)
    .map((s) => s.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1])
    .filter(Boolean),
);
let credits =
  "Blind Crossing is MIT licensed. Browser dependency notices follow.\n" +
  (await readFile("LICENSE", "utf8"));
for (const name of [...names].sort()) {
  const root = "node_modules/" + name + "/";
  const { version } = JSON.parse(await readFile(root + "package.json", "utf8"));
  const licenses = (await readdir(root)).filter((f) =>
    /^(licen[sc]e|copying|notice)([.-].*)?$/i.test(f),
  );
  for (const f of licenses)
    credits +=
      "\n\n" +
      name +
      " " +
      version +
      " — " +
      f +
      "\n" +
      (await readFile(root + f, "utf8"));
}
await writeFile("dist/THIRD-PARTY.txt", credits);
await build({
  entryPoints: ["scripts/verify.mjs"],
  outfile: "dist/verify-round.mjs",
  platform: "node",
  target: "node22",
  format: "esm",
  bundle: true,
  minify: true,
  legalComments: "eof",
});
