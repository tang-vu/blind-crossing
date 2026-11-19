import Peer from "peerjs";
import QRCode from "qrcode";
import { newClient, clientFromDevice } from "../src/client.mjs";
import { checkRegistry } from "../src/network.mjs";
import { check, checksum, hash, manifest } from "../src/format.mjs";
import { recipient, verifyBundle } from "../src/verify.mjs";

const $ = (id) => document.getElementById(id);
const status = (text) => {
  $("status").textContent = text;
};
const target = new URLSearchParams(location.hash.slice(1)).get("room");
let mode =
  new URLSearchParams(location.hash.slice(1)).get("network") === "diana"
    ? "diana"
    : "rehearsal";
const registry = location.origin + "/registry";
function showMode() {
  $("roommode").textContent =
    mode === "diana"
      ? "Live room · Diana registered wallets"
      : "Live room · unanchored rehearsal";
  if (target && mode === "diana")
    $("intro").textContent =
      "Open your own dedicated .bc-device file from this device. Your browser checks each participant’s public keys against the Diana registry.";
}
const clients = new Map();
let peer,
  server,
  local,
  round,
  phase = "idle",
  deadline,
  heartbeat,
  fileUrl;
const locked = () => phase !== "lobby";
const show = (id, visible) => {
  $(id).hidden = !visible;
};
function stop(reason) {
  if (phase === "done" || phase === "aborted") return;
  phase = "aborted";
  clearTimeout(deadline);
  clearInterval(heartbeat);
  for (const c of clients.values()) {
    if (!c.link.open) continue;
    try {
      c.link.send({ type: "abort", reason });
    } catch {
      // A failed channel cannot receive the notice. Continue notifying the group.
    }
  }
  status("Round closed. " + reason);
  for (const id of ["accept", "submit", "lock", "picker", "invite", "begin"])
    show(id, false);
  show("restart", true);
  local = null;
  setTimeout(() => peer?.destroy(), 500);
}
function timeout(ms = 300000) {
  clearTimeout(deadline);
  deadline = setTimeout(
    () => stop("The room timed out. Start again with fresh secrets."),
    ms,
  );
}
// Count unanswered probes, so pausing the coordinator's own timer for a while
// does not immediately expire healthy devices when its tab resumes.
function monitorParticipants() {
  const watched = [...clients.values()].filter((c) => c.supportsHeartbeat);
  if (!watched.length) return;
  heartbeat = setInterval(
    handle(() => {
      for (const c of watched) {
        if (c.unanswered >= 4) {
          stop("A participant stopped responding. Create a new round.");
          return;
        }
        c.unanswered++;
        c.link.send({ type: "ping" });
      }
    }),
    4000,
  );
}
function handle(fn) {
  return (...args) => {
    try {
      Promise.resolve(fn(...args)).catch((e) => stop(e.message));
    } catch (e) {
      stop(e.message);
    }
  };
}
function roster(members) {
  show("roster", true);
  $("members").replaceChildren(
    ...members.map((m) => {
      const li = document.createElement("li");
      li.textContent = m.address;
      return li;
    }),
  );
  if (round)
    $("fingerprint").textContent =
      "Round " +
      round.id +
      " · compare this fingerprint on every screen: " +
      hash(round);
}
function finish(bundle) {
  const counts = verifyBundle(bundle);
  check(
    round &&
      bundle.commitment === checksum(bundle) &&
      hash(bundle.round) === hash(round),
    "Unexpected final manifest",
  );
  phase = "done";
  clearTimeout(deadline);
  clearInterval(heartbeat);
  status(
    "Verified " +
      bundle.contributions.length +
      " signed contributions. A + B reached " +
      counts.AB +
      "; A + C reached " +
      counts.AC +
      ".",
  );
  if (round.mode === "diana")
    $("status").textContent +=
      " Registry checked. Download the round and run the anchor command to publish its commitment.";
  if (fileUrl) URL.revokeObjectURL(fileUrl);
  fileUrl = URL.createObjectURL(
    new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }),
  );
  $("download").href = fileUrl;
  show("download", true);
  show("restart", true);
  show("picker", false);
  show("invite", false);
}
function broadcast(message) {
  for (const c of clients.values()) c.link.send(message);
}
function refresh() {
  const ready = [...clients.values()].filter((c) => c.member);
  roster(ready.map((c) => c.member));
  status(
    ready.length +
      " participant browser" +
      (ready.length === 1 ? "" : "s") +
      " joined. At least three are needed.",
  );
  show("lock", true);
  $("lock").disabled = ready.length < 3 || ready.length !== clients.size;
}
function hostMessage(c, message) {
  if (phase === "aborted" || phase === "done") return;
  const { type, data } = message;
  if (type === "hello") {
    check(phase === "lobby" && !c.member, "Unexpected enrollment");
    recipient(data);
    check(
      ![...clients.values()].some((p) => p.member?.address === data.address),
      "Repeated wallet",
    );
    c.member = data;
    c.supportsHeartbeat = message.supportsHeartbeat === true;
    c.unanswered = 0;
    refresh();
    return;
  }
  check(c.member && round, "Round has not been locked");
  if (type === "pong" && c.supportsHeartbeat) {
    c.unanswered = 0;
    return;
  }
  if (type === "accept") {
    check(
      phase === "confirm" && !c.accepted && data === hash(round),
      "Manifest confirmation differs",
    );
    c.accepted = true;
    if ([...clients.values()].every((p) => p.accepted)) {
      phase = "exchange";
      broadcast({ type: "exchange" });
      timeout();
    }
  } else if (type === "packets") {
    check(
      phase === "exchange" &&
        !c.packets &&
        Array.isArray(data) &&
        data.length ===
          round.members.filter((m) => c.member.address < m.address).length,
      "Invalid exchange",
    );
    check(
      data.every((p) => p.body.sender === c.member.address),
      "Unexpected envelope sender",
    );
    c.packets = data;
    if ([...clients.values()].every((p) => p.packets)) {
      phase = "collect";
      const all = [...clients.values()].flatMap((p) => p.packets);
      for (const p of clients.values())
        p.link.send({
          type: "pick",
          data: all.filter((x) => x.body.receiver === p.member.address),
        });
      status("Waiting for masked contributions.");
      timeout();
    }
  } else if (type === "vote") {
    check(
      phase === "collect" && !c.vote && data.body.sender === c.member.address,
      "Unexpected contribution",
    );
    c.vote = data;
    const votes = [...clients.values()].map((p) => p.vote).filter(Boolean);
    status(votes.length + " of " + clients.size + " contributions received.");
    if (votes.length === clients.size) {
      const bundle = {
        round,
        contributions: votes.sort((a, b) =>
          a.body.sender < b.body.sender ? -1 : 1,
        ),
      };
      bundle.commitment = checksum(bundle);
      finish(bundle);
      broadcast({ type: "done", data: bundle });
    }
  } else throw Error("Unrecognized room message");
}
function connectGuest() {
  server = peer.connect(target, { reliable: true, serialization: "binary" });
  server.on(
    "open",
    handle(() => {
      server.send({ type: "hello", data: local.member, supportsHeartbeat: true });
      status("Joined. Waiting for the coordinator to lock the roster.");
      timeout();
    }),
  );
  server.on(
    "data",
    handle(async ({ type, data, reason }) => {
      if (phase === "aborted" || phase === "done") return;
      if (type === "ping" && round) {
        server.send({ type: "pong" });
        return;
      }
      if (type === "abort") {
        stop(reason);
        return;
      }
      if (type === "manifest") {
        check(
          local && !round && phase === "lobby" && data.mode === mode,
          "Unexpected manifest",
        );
        local.accept(data);
        round = data;
        phase = "checking";
        if (mode === "diana")
          await Promise.all(
            round.members.map((m) => checkRegistry(m, registry)),
          );
        if (phase === "aborted") return;
        phase = "confirm";
        roster(round.members);
        show("accept", true);
        status(
          "Check your group size, wallets and fingerprint against the coordinator before continuing. Questions: A + B and A + C.",
        );
        timeout();
      } else if (type === "exchange") {
        check(phase === "accepted", "Manifest not confirmed");
        phase = "exchange";
        server.send({ type: "packets", data: local.start() });
      } else if (type === "pick") {
        check(phase === "exchange", "Unexpected route request");
        for (const p of data) local.receive(p);
        phase = "collect";
        show("picker", true);
        status(
          "Choose a fictional route. Leaving all crossings clear represents a different route.",
        );
        timeout();
      } else if (type === "done") {
        check(phase === "sent", "Contribution missing");
        finish(data);
      } else throw Error("Unrecognized coordinator message");
    }),
  );
  server.on("close", () => stop("The coordinator disconnected."));
  server.on("error", () => stop("The coordinator connection failed."));
}
async function begin() {
  if (target && mode === "diana" && !$("device").files.length) {
    status("Select your own .bc-device file.");
    return;
  }
  show("begin", false);
  show("networkchoice", false);
  status("Connecting to room signaling…");
  phase = "connecting";
  timeout(30000);
  if (mode === "diana")
    check(
      globalThis.BC_LOCAL_SIGNAL,
      "Registered rooms require the Diana registry relay on the self-hosted site.",
    );
  if (target) {
    if (mode === "diana") {
      const file = $("device").files[0];
      check(file.size < 100000, "Invalid device file size");
      local = clientFromDevice(JSON.parse(await file.text()));
      $("device").value = "";
      show("devicechoice", false);
      await checkRegistry(local.member, registry);
    } else local = newClient();
  }
  // Local builds can use the bundled same-origin PeerServer. GitHub Pages uses PeerJS Cloud.
  const config = globalThis.BC_LOCAL_SIGNAL
    ? {
        host: location.hostname,
        port:
          Number(location.port) || (location.protocol === "https:" ? 443 : 80),
        path: "/signal",
        secure: location.protocol === "https:",
      }
    : {};
  peer = new Peer(crypto.randomUUID(), config);
  peer.on("error", (e) => stop("Connection failed (" + e.type + ")."));
  peer.on("disconnected", () => stop("Signaling disconnected."));
  peer.on(
    "open",
    handle((id) => {
      phase = "lobby";
      timeout();
      if (target) {
        connectGuest();
        return;
      }
      const url = new URL(location.href);
      url.hash = new URLSearchParams({ room: id, network: mode }).toString();
      $("join").href = url.href;
      QRCode.toDataURL(url.href, { width: 220, margin: 2 })
        .then((src) => {
          $("qr").src = src;
        })
        .catch(() => status("Share the participant link to join."));
      show("invite", true);
      refresh();
    }),
  );
  peer.on("connection", (link) => {
    if (target || locked() || clients.size >= 12) {
      link.on("open", () => {
        link.send({ type: "abort", reason: "This room is locked or full." });
        setTimeout(() => link.close(), 300);
      });
      return;
    }
    const c = { link };
    clients.set(link.peer, c);
    refresh();
    link.on(
      "data",
      handle((m) => hostMessage(c, m)),
    );
    link.on("close", () => {
      if (phase === "lobby") {
        clients.delete(link.peer);
        refresh();
      } else stop("A participant disconnected. Create a new round.");
    });
    link.on("error", () => stop("A participant connection failed."));
  });
}
$("begin").onclick = handle(begin);
$("lock").onclick = handle(() => {
  check(
    phase === "lobby" &&
      clients.size >= 3 &&
      [...clients.values()].every((c) => c.member),
    "Roster is incomplete",
  );
  round = manifest(
    [...clients.values()].map((c) => c.member),
    mode,
  );
  phase = "confirm";
  roster(round.members);
  show("lock", false);
  show("invite", false);
  status("Ask everyone to compare the fingerprint and confirm.");
  broadcast({ type: "manifest", data: round });
  monitorParticipants();
  timeout();
});
$("accept").onclick = handle(() => {
  check(phase === "confirm", "Already confirmed");
  phase = "accepted";
  server.send({ type: "accept", data: hash(round) });
  show("accept", false);
  status("Waiting for all confirmations.");
});
$("submit").onclick = handle(() => {
  check(phase === "collect", "Room is not collecting");
  const route = [...$("choices").querySelectorAll("input:checked")].map(
    (b) => b.value,
  );
  const vote = local.contribute(route);
  phase = "sent";
  server.send({ type: "vote", data: vote });
  show("picker", false);
  $("choices").replaceChildren();
  status("Contribution sent. Waiting for the complete signed round.");
});
if (target) {
  $("heading").textContent = "Join the survey";
  $("intro").textContent =
    "A temporary wallet will be created on this device. Compare the roster before you choose your route.";
  $("begin").textContent = "Join room";
  for (const p of "ABCDEFGH") {
    const l = document.createElement("label"),
      b = document.createElement("input");
    b.type = "checkbox";
    b.value = p;
    l.append(b, " " + p);
    $("choices").append(l);
  }
  show("devicechoice", mode === "diana");
} else if (globalThis.BC_LOCAL_SIGNAL) {
  show("networkchoice", true);
  $("registered").checked = mode === "diana";
  $("registered").onchange = () => {
    mode = $("registered").checked ? "diana" : "rehearsal";
    showMode();
  };
}
showMode();
addEventListener("pagehide", () => {
  clearTimeout(deadline);
  clearInterval(heartbeat);
  peer?.destroy();
  if (fileUrl) URL.revokeObjectURL(fileUrl);
});
