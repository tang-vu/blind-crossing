import { checksum, hash, manifest } from "../src/format.mjs";
import { verifyBundle } from "../src/verify.mjs";

const $ = (id) => document.getElementById(id);
const phase = $("phase");
const status = $("lab-status");
const cards = [...document.querySelectorAll(".households li")];
let households = [];
let fileUrl;

for (const point of "ABCDEFGH") {
  const label = document.createElement("label");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.value = point;
  label.className = "choice";
  label.append(box, point);
  $("options").append(label);
}

function setPhase(text, state) {
  phase.textContent = text;
  phase.dataset.state = state;
}

function openHousehold() {
  const worker = new Worker(new URL("./lab-client.mjs", import.meta.url), {
    type: "module",
  });
  const inbox = [];
  let pending = null;
  worker.onmessage = (event) => {
    if (pending) {
      const current = pending;
      pending = null;
      if (event.data.error) current.reject(Error(event.data.error));
      else current.resolve(event.data.result);
    } else inbox.push(event.data);
  };
  worker.onerror = () => {
    pending?.reject(Error("A household worker stopped."));
    pending = null;
  };
  return {
    worker,
    member: null,
    call(message) {
      return new Promise((resolve, reject) => {
        const deliver = (data) => {
          if (data.error) reject(Error(data.error));
          else resolve(data.result);
        };
        if (!message && inbox.length) {
          deliver(inbox.shift());
          return;
        }
        if (pending) {
          reject(Error("Household is busy"));
          return;
        }
        pending = { resolve, reject };
        if (message) worker.postMessage(message);
      });
    },
  };
}

function closeHouseholds() {
  for (const household of households) household.worker.terminate();
  households = [];
}

function shorten(address) {
  return address.slice(0, 8) + "…" + address.slice(-4);
}

$("prepare").onclick = async () => {
  $("prepare").disabled = true;
  setPhase("Creating wallets", "working");
  status.textContent = "Creating three wallets on this device. This takes a few seconds.";
  try {
    households = [openHousehold(), openHousehold(), openHousehold()];
    const members = await Promise.all(households.map((household) => household.call()));
    members.forEach((member, index) => {
      households[index].member = member;
      const code = cards[index].querySelector("code");
      code.textContent = shorten(member.address);
      code.title = member.address;
    });
    $("prepare").hidden = true;
    $("lab-picker").hidden = false;
    setPhase("Choose a route", "ready");
    status.textContent = "Your wallet is ready. The sample households stay on C and D.";
  } catch (error) {
    closeHouseholds();
    $("prepare").disabled = false;
    setPhase("Stopped", "failed");
    status.textContent = error.message;
  }
};

$("sign").onclick = async () => {
  const route = [...$("options").querySelectorAll("input:checked")].map((box) => box.value);
  const routes = [route, ["C"], ["D"]];
  $("sign").disabled = true;
  setPhase("Counting", "working");
  status.textContent = "The three workers are exchanging masks and signing.";
  try {
    const round = manifest(
      households.map((household) => household.member),
      "rehearsal",
    );
    const digests = await Promise.all(
      households.map((household) => household.call({ cmd: "accept", round })),
    );
    if (!digests.every((digest) => digest === hash(round))) {
      throw Error("The workers committed to different rounds.");
    }
    const packets = (
      await Promise.all(households.map((household) => household.call({ cmd: "exchange" })))
    ).flat();
    const contributions = await Promise.all(
      households.map((household, index) =>
        household.call({
          cmd: "contribute",
          route: routes[index],
          packets: packets.filter(
            (packet) => packet.body.receiver === household.member.address,
          ),
        }),
      ),
    );
    contributions.sort((a, b) => (a.body.sender < b.body.sender ? -1 : 1));
    const bundle = { round, contributions };
    bundle.commitment = checksum(bundle);
    const counts = verifyBundle(bundle);
    $("lab-ab").textContent = counts.AB;
    $("lab-ac").textContent = counts.AC;
    cards[0].querySelector("span").textContent = route.length
      ? "Route through " + route.join(" ")
      : "Route passes none of these crossings";
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    fileUrl = URL.createObjectURL(
      new Blob([JSON.stringify(bundle, null, 2) + "\n"], { type: "application/json" }),
    );
    $("lab-download").href = fileUrl;
    $("lab-picker").hidden = true;
    $("lab-result").hidden = false;
    setPhase("Verified", "done");
    status.textContent =
      "Verified 3 signed contributions. A + B reached " +
      counts.AB +
      "; A + C reached " +
      counts.AC +
      ".";
  } catch (error) {
    $("sign").disabled = false;
    setPhase("Stopped", "failed");
    status.textContent = error.message;
  }
};

$("reset").onclick = () => location.reload();
addEventListener("pagehide", () => {
  closeHouseholds();
  if (fileUrl) URL.revokeObjectURL(fileUrl);
});
