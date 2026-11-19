import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { newClient } from "../src/client.mjs";
import { checksum, manifest } from "../src/format.mjs";
import { verifyBundle } from "../src/verify.mjs";
import { verifyEvidence } from "../src/network.mjs";
import { best, pairs, routes, totals } from "../src/simulation.mjs";
const source = JSON.parse(
  readFileSync(new URL("../evidence/rehearsal.json", import.meta.url)),
);
test("all 36 simulation totals come from 100 disjoint fictional routes", () => {
  assert.equal(routes.length, 100);
  assert.equal(Object.keys(totals).length, 36);
  assert.equal(pairs.length, 28);
  assert.deepEqual(
    ["A", "B", "C", "AB", "AC"].map((k) => totals[k]),
    [60, 55, 40, 62, 90],
  );
  assert.equal(best, "AC");
  assert.ok(pairs.filter((q) => q !== best).every((q) => totals[q] < 90));
});
test("published rehearsal verifies with its independently pinned digest", () => {
  assert.deepEqual(
    verifyBundle(
      source,
      "e14194d716ca214aeb34d2e0be50e223cd2e411cc7ab61a44ef7039c17b30fce",
    ),
    { AB: 1, AC: 2 },
  );
});
test("Diana packet reproduces the published counts and identifies a missing signer", () => {
  const packet = JSON.parse(
    readFileSync(new URL("../evidence/diana.json", import.meta.url)),
  );
  assert.deepEqual(verifyBundle(packet), { AB: 1, AC: 2 });
  packet.contributions.pop();
  assert.throws(
    () => verifyBundle(packet),
    { message: "Missing contribution: qor1vnh8z6ppwg4v0w26cl3vhd9e8lnt05p5ach03e" },
  );
});
test("member omissions and repeats are reported even if the bundle is rehashed", () => {
  const missing = structuredClone(source);
  const removed = missing.contributions.pop();
  missing.commitment = checksum(missing);
  assert.throws(() => verifyBundle(missing), new RegExp(removed.body.sender));
  const duplicate = structuredClone(source);
  duplicate.contributions[1] = duplicate.contributions[0];
  assert.throws(() => verifyBundle(duplicate), /Duplicate contribution/);
});
test("changed masked input, manifest replay, and swapped public keys fail", () => {
  const forged = structuredClone(source);
  forged.contributions[0].body.values[0] ^= 1;
  forged.commitment = checksum(forged);
  assert.throws(() => verifyBundle(forged), /signature/);
  const replay = structuredClone(source);
  replay.round.id = crypto.randomUUID();
  assert.throws(() => verifyBundle(replay), /different round/);
  const swap = structuredClone(source);
  swap.round.members[0].kem = swap.round.members[1].kem;
  assert.throws(() => verifyBundle(swap));
  assert.throws(() => verifyBundle(source, "0".repeat(64)), /commitment/);
});
test("unanchored rehearsal cannot pass Diana verification", async () => {
  await assert.rejects(() => verifyEvidence(source), /Missing Diana/);
});
test("exchange binds sender, recipient, round and proposals; a client contributes once", () => {
  const clients = Array.from({ length: 3 }, () => newClient());
  const round = manifest(
    clients.map((c) => c.member),
    "rehearsal",
  );
  clients.forEach((c) => c.accept(round));
  const envelopes = clients.flatMap((c) => c.start());
  const recipient = clients.find(
    (c) => c.member.address === envelopes[0].body.receiver,
  );
  assert.throws(() => recipient.contribute(["A"]), /incomplete/);
  const changed = structuredClone(envelopes[0]);
  changed.body.round = "x";
  assert.throws(() => recipient.receive(changed), /Misaddressed/);
  for (const c of clients)
    for (const p of envelopes.filter(
      (p) => p.body.receiver === c.member.address,
    ))
      c.receive(p);
  assert.throws(() => recipient.receive(envelopes[0]), /repeated/);
  const contributions = clients
    .map((c) => c.contribute([]))
    .sort((a, b) => a.body.sender.localeCompare(b.body.sender));
  const bundle = { round, contributions };
  bundle.commitment = checksum(bundle);
  assert.deepEqual(verifyBundle(bundle), { AB: 0, AC: 0 });
  assert.throws(() => clients[0].contribute(["B"]), /already submitted/);
});
