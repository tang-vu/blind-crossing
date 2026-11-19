import { manifest, hash, checksum } from "../src/format.mjs";
import { verifyBundle } from "../src/verify.mjs";
import { points } from "../src/simulation.mjs";

const $ = (id) => document.getElementById(id);
const walletLabels = document.querySelectorAll(".households code");
let workers = [];
let round;
let downloadURL;
let generation = 0;

function stopWorkers() {
  for (const worker of workers) worker.terminate();
  workers = [];
}

function revokeDownload() {
  if (downloadURL) URL.revokeObjectURL(downloadURL);
  downloadURL = undefined;
  $("lab-download").removeAttribute("href");
}

// Each wallet processes one request at a time. A failure invalidates the whole round.
function request(worker, command, data) {
  return new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      clearTimeout(timer);
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      callback(value);
    };
    const timer = setTimeout(() => finish(reject, Error("A wallet timed out.")), 60000);
    worker.onerror = worker.onmessageerror = () => finish(reject, Error("A wallet could not complete the operation."));
    worker.onmessage = ({ data: reply }) =>
      reply.error ? finish(reject, Error(reply.error)) : finish(resolve, reply.result);
    worker.postMessage({ command, data });
  });
}

function reset() {
  generation++;
  stopWorkers();
  revokeDownload();
  round = undefined;
  $("lab-result").hidden = $("lab-picker").hidden = true;
  $("prepare").hidden = $("prepare").disabled = $("sign").disabled = false;
  $("lab-status").textContent = "";
  $("phase").textContent = "Ready";
  for (const input of $("options").querySelectorAll("input")) input.checked = false;
  for (const label of walletLabels) {
    label.textContent = "";
    label.removeAttribute("title");
  }
}

function fail(error) {
  reset();
  $("phase").textContent = "Round stopped";
  $("lab-status").textContent = error.message + " Start again to create fresh wallets.";
}

for (const point of points) {
  const label = document.createElement("label");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.value = point;
  label.append(box, point);
  $("options").append(label);
}

$("prepare").onclick = async () => {
  const run = generation;
  $("prepare").disabled = true;
  $("phase").textContent = "Creating wallets";
  $("lab-status").textContent = "Generating fresh signing and encryption keys in each worker…";
  try {
    for (let i = 0; i < walletLabels.length; i++) {
      workers.push(new Worker(new URL("./lab-client.js", document.baseURI), { type: "module" }));
    }
    const members = await Promise.all(workers.map((w, i) => request(w, "create", i)));
    round = manifest(members, "rehearsal");
    const digest = hash(round);
    const accepted = await Promise.all(workers.map(w => request(w, "accept", round)));
    if (!accepted.every(d => d === digest)) throw Error("Wallets disagree on the round.");
    $("phase").textContent = "Exchanging secrets";
    const packets = (await Promise.all(workers.map(w => request(w, "exchange")))).flat();
    await Promise.all(workers.map((w, i) =>
      request(w, "receive", packets.filter(p => p.body.receiver === members[i].address))));
    members.forEach(({ address }, i) => {
      walletLabels[i].textContent = address.slice(0, 7) + "…" + address.slice(-6);
      walletLabels[i].title = address;
    });
    $("phase").textContent = "Ready to sign";
    $("lab-status").textContent = "All three wallets agreed on the questions and exchanged encrypted pair secrets.";
    $("lab-picker").hidden = false;
    $("prepare").hidden = true;
    $("options").querySelector("input").focus({ preventScroll: true });
  } catch (error) {
    if (generation === run) fail(error);
  }
};

$("sign").onclick = async () => {
  const run = generation;
  $("sign").disabled = true;
  $("phase").textContent = "Signing";
  $("lab-status").textContent = "Checking each signed contribution…";
  try {
    const route = Array.from($("options").querySelectorAll(":checked"), box => box.value);
    const contributions = await Promise.all(workers.map((w, i) => request(w, "sign", i === 0 ? route : undefined)));
    contributions.sort((a, b) => a.body.sender < b.body.sender ? -1 : 1);
    const bundle = { round, contributions };
    bundle.commitment = checksum(bundle);
    const totals = verifyBundle(bundle);
    const blob = new Blob([JSON.stringify(bundle) + "\n"], { type: "application/json" });
    downloadURL = URL.createObjectURL(blob);
    $("lab-download").href = downloadURL;
    $("lab-ab").textContent = totals.AB;
    $("lab-ac").textContent = totals.AC;
    $("lab-result").hidden = false;
    $("lab-picker").hidden = true;
    $("phase").textContent = "Verified";
    $("lab-status").textContent = "Verified three signed contributions. Round " + round.id + ".";
    stopWorkers();
    $("lab-download").focus({ preventScroll: true });
  } catch (error) {
    if (generation === run) fail(error);
  }
};

$("reset").onclick = () => { reset(); $("prepare").focus(); };
window.addEventListener("pagehide", reset);
