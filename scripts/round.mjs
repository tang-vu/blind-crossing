import { fork } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { check, checksum, hash, manifest } from "../src/format.mjs";
import { verifyBundle } from "../src/verify.mjs";
import { slots } from "./wallets.mjs";

const [mode = "rehearsal", out = "round.json"] = process.argv.slice(2);
check(["rehearsal", "diana"].includes(mode), "Choose rehearsal or diana");
const clients = slots.map((slot) =>
  fork(new URL("./client-process.mjs", import.meta.url), [slot, mode], {
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  }),
);
function request(child, cmd, data) {
  return new Promise((resolve, reject) => {
    const finish = (fn, arg) => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
      child.off("error", onError);
      fn(arg);
    };
    const timer = setTimeout(
      () => finish(reject, Error("Client timed out")),
      60000,
    );
    const onError = (e) => finish(reject, e);
    const onExit = () =>
      finish(reject, Error("Client disconnected; restart with a fresh round"));
    const onMessage = (m) =>
      m.error ? finish(reject, Error(m.error)) : finish(resolve, m.result);
    child
      .once("error", onError)
      .once("exit", onExit)
      .once("message", onMessage);
    if (cmd) child.send({ cmd, data });
  });
}
try {
  const members = await Promise.all(clients.map((c) => request(c)));
  const round = manifest(members, mode);
  const accepted = await Promise.all(
    clients.map((c) => request(c, "accept", round)),
  );
  check(
    accepted.every((x) => x === hash(round)),
    "Clients committed to different manifests",
  );
  const packets = (
    await Promise.all(clients.map((c) => request(c, "exchange")))
  ).flat();
  const contributions = await Promise.all(
    clients.map((c, i) =>
      request(
        c,
        "contribute",
        packets.filter((p) => p.body.receiver === members[i].address),
      ),
    ),
  );
  contributions.sort((a, b) => (a.body.sender < b.body.sender ? -1 : 1));
  const bundle = { round, contributions };
  bundle.commitment = checksum(bundle);
  console.log(verifyBundle(bundle));
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(bundle, null, 2) + "\n", { flag: "wx" });
  console.log("3 client processes, 1 computer.", out, bundle.commitment);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  for (const c of clients) c.kill();
}
