export function setupProof() {
  const $ = (id) => document.getElementById(id);
  const button = $("inspect");
  const omit = $("omit");
  const fmt = new Intl.NumberFormat("en-US");
  let archive;
  let omitted = false;

  function showRows(packet) {
    const rows = packet.round.members.map(({ address }) => {
      const row = document.createElement("tr");
      const member = document.createElement("th");
      member.scope = "row";
      member.textContent = address.slice(0, 7) + "…" + address.slice(-6);
      member.title = address;
      member.setAttribute("aria-label", address);
      row.append(member);
      const contribution = packet.contributions.find(c => c.body.sender === address);
      for (const [i] of packet.round.options.entries()) {
        const cell = row.insertCell();
        cell.textContent = contribution ? fmt.format(contribution.body.values[i]) : "Missing";
        if (!contribution) row.classList.add("missing");
      }
      return row;
    });
    $("wallets").replaceChildren(...rows);
    $("ledger-data").hidden = false;
  }

  async function check(removeMember) {
    button.disabled = omit.disabled = true;
    $("checks").textContent = "Checking the signed round…";
    $("proof-state").textContent = "Checking";
    $("proof-totals").hidden = true;
    $("proof-ab").textContent = $("proof-ac").textContent = "";
    $("inspection").dataset.state = "checking";
    try {
      const { verifyBundle } = await import("../src/verify.mjs");
      let downloaded = archive;
      if (!downloaded) {
        const response = await fetch($("bundle").href);
        if (!response.ok) throw Error("The signed JSON could not be downloaded (HTTP " + response.status + ").");
        downloaded = await response.json();
      }
      const packet = removeMember ? { ...downloaded, contributions: downloaded.contributions.slice(0, -1) } : downloaded;
      omitted = removeMember;
      if (removeMember) showRows(packet);
      const totals = verifyBundle(packet, $("bundle").dataset.commitment);
      archive = downloaded;
      showRows(packet);
      $("proof-ab").textContent = totals.AB;
      $("proof-ac").textContent = totals.AC;
      $("proof-totals").hidden = false;
      $("proof-state").textContent = "Verified";
      $("inspection").dataset.state = "verified";
      $("checks").textContent = "All " + packet.round.members.length +
        " wallet signatures and the pinned round commitment verified.";
    } catch (err) {
      $("proof-state").textContent = "Refused";
      $("inspection").dataset.state = "refused";
      $("checks").textContent = "Verification refused. " + err.message;
    } finally {
      button.disabled = omit.disabled = false;
      omit.textContent = omitted ? "Restore contribution and verify" : "Omit one contribution";
      button.textContent = archive ? "Verify complete round" : "Retry verification";
    }
  }
  button.onclick = () => check(false);
  omit.onclick = () => check(!omitted);
}
