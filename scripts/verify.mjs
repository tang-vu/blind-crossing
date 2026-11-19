import { readFile } from "node:fs/promises";
import { verifyBundle } from "../src/verify.mjs";
import { verifyEvidence } from "../src/network.mjs";
import { check, canonical } from "../src/format.mjs";
import { points, pairs, tally } from "../src/simulation.mjs";

const [file, ...flags] = process.argv.slice(2);
try {
  if (
    !file ||
    flags.some((f) => f !== "--chain" && !/^--expect=[0-9a-f]{64}$/.test(f))
  )
    throw Error("Usage: npm run verify -- FILE [--chain] [--expect=SHA256]");
  const bundle = JSON.parse(await readFile(file, "utf8"));
  if (bundle.kind === "synthetic-routes/v1") {
    check(!flags.length, "Chain and digest flags apply to signed rounds");
    check(
      canonical(bundle.points) === canonical(points) &&
        canonical(bundle.options) === canonical([...points, ...pairs]),
      "Unexpected simulation questions",
    );
    check(
      Array.isArray(bundle.routes) &&
        bundle.routes.length === 100 &&
        bundle.routes.every(
          (route) => typeof route === "string" && /^[A-H]+$/.test(route),
        ),
      "Invalid synthetic routes",
    );
    const totals = tally(bundle.routes, bundle.options);
    check(
      canonical(totals) === canonical(bundle.totals),
      "Simulation totals differ from the routes",
    );
    console.log(
      "Recomputed all 36 totals from the supplied 100 synthetic routes.",
    );
    console.log(JSON.stringify(totals, null, 2));
  } else {
    const counts = verifyBundle(
      bundle,
      flags.find((f) => f.startsWith("--expect="))?.slice(9),
    );
    if (flags.includes("--chain"))
      console.log("Diana receipts verified:", await verifyEvidence(bundle));
    else
      console.log(
        "Offline signature and commitment verification. Chain receipts require --chain.",
      );
    console.log(
      JSON.stringify(
        {
          mode: bundle.round.mode,
          round: bundle.round.id,
          members: bundle.round.members.length,
          counts,
          commitment: bundle.commitment,
        },
        null,
        2,
      ),
    );
  }
} catch (e) {
  console.error("Verification refused:", e.message);
  process.exitCode = 1;
}
