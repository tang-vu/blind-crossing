import { pairs, points, positions, totals, routes, best, pairKey } from "../src/simulation.mjs";
import { setupProof } from "./proof.mjs";

const $ = (id) => document.getElementById(id);
const names = (plan) => [...plan].join(" + ");
const busiest = [...points].sort((a, b) => totals[b] - totals[a]);
const baseline = pairKey(...busiest.slice(0, 2));
const params = new URL(location.href).searchParams;
const requested = [...(params.get("plan") || "").toUpperCase()].sort().join("");
const guards = [...(pairs.includes(requested) ? requested : baseline)];
const markers = new Map();
const cells = new Map();
let active = 1;
let drag;
let suppressClick = false;

function element(tag, content, cls) {
  const el = document.createElement(tag);
  if (content !== undefined) el.textContent = content;
  if (cls) el.className = cls;
  return el;
}

const studentDots = routes.map(() => element("i"));
$("marks").append(...studentDots);
$("size").textContent = routes.length;
$("pair-count").textContent = pairs.length;
$("baseline-name").textContent = names(baseline);

function choose(next, which = active) {
  if (!pairs.includes(pairKey(...next))) return;
  guards.splice(0, 2, ...next);
  active = which;
  const url = new URL(location.href);
  url.searchParams.set("plan", pairKey(...guards));
  history.replaceState(null, "", url);
  draw();
}

function move(which, point) {
  if (!points.includes(point) || guards.includes(point)) return;
  const next = [...guards];
  next[which] = point;
  choose(next, which);
}

function targetAt(event) {
  return document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-point]");
}

function endDrag() {
  if (!drag) return;
  drag.ghost?.remove();
  drag.source.classList.remove("lifted");
  for (const marker of markers.values()) marker.classList.remove("over");
  drag = undefined;
}

for (const [i, point] of points.entries()) {
  const marker = element("button", point, "point");
  marker.type = "button";
  marker.dataset.point = point;
  const [x, y] = positions[i];
  marker.style.left = x / 8 + "%";
  marker.style.top = y / 5.3 + "%";
  marker.append(element("span", "", "guardno"), element("span", totals[point], "footcount"));
  marker.onpointerdown = (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    const which = guards.indexOf(point);
    if (which < 0) return;
    active = which;
    drawMarkers();
    drag = { source: marker, x: event.clientX, y: event.clientY, id: event.pointerId };
    marker.setPointerCapture(event.pointerId);
  };
  marker.onpointermove = (event) => {
    if (drag?.id !== event.pointerId) return;
    if (!drag.ghost) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      drag.ghost = element("span", point, "drag-pin");
      drag.ghost.dataset.guard = active + 1;
      drag.ghost.setAttribute("aria-hidden", "true");
      document.body.append(drag.ghost);
      marker.classList.add("lifted");
    }
    drag.ghost.style.left = event.clientX + "px";
    drag.ghost.style.top = event.clientY + "px";
    const target = targetAt(event);
    for (const node of markers.values()) {
      node.classList.toggle("over", node === target && !guards.includes(node.dataset.point));
    }
  };
  marker.onpointerup = (event) => {
    if (drag?.id !== event.pointerId) return;
    if (drag.ghost) {
      suppressClick = true;
      const target = targetAt(event);
      if (target) move(active, target.dataset.point);
    }
    endDrag();
  };
  marker.onlostpointercapture = marker.onpointercancel = endDrag;
  marker.onclick = (event) => {
    if (suppressClick && event.detail !== 0) {
      suppressClick = false;
      return;
    }
    if (!guards.includes(point)) return move(active, point);
    active = guards.indexOf(point);
    drawMarkers();
    $("delta").textContent = "Guard " + (active + 1) + " selected. Choose an open crossing.";
  };
  markers.set(point, marker);
  $("markers").append(marker);
}

function drawMarkers() {
  for (const [point, marker] of markers) {
    const i = guards.indexOf(point);
    marker.classList.toggle("selected", i >= 0);
    marker.classList.toggle("active", i === active);
    marker.dataset.guard = i + 1;
    marker.querySelector(".guardno").textContent = i >= 0 ? i + 1 : "";
    const label = "Crossing " + point + ", " + totals[point] + " students" +
      (i < 0 ? "" : ", guard " + (i + 1) + (i === active ? " selected" : ""));
    marker.setAttribute("aria-label", label);
    marker.title = label;
  }
}

function buildMatrix() {
  const head = $("matrix").createTHead().insertRow();
  head.append(element("td"));
  for (const p of points.slice(1)) {
    const th = element("th", p);
    th.scope = "col";
    head.append(th);
  }
  const body = $("matrix").createTBody();
  for (const [i, p] of points.slice(0, -1).entries()) {
    const row = body.insertRow();
    const th = element("th", p);
    th.scope = "row";
    row.append(th);
    for (const [j, q] of points.slice(1).entries()) {
      const cell = row.insertCell();
      if (j < i) continue;
      const key = p + q;
      const btn = element("button", totals[key]);
      btn.type = "button";
      btn.setAttribute("aria-label", names(key) + ", " + totals[key] + " students");
      btn.style.setProperty("--weight", (10 + 85 * totals[key] / totals[best]) + "%");
      btn.classList.toggle("deep", totals[key] / totals[best] > 0.82);
      btn.onclick = () => choose([...key]);
      cell.append(btn);
      cells.set(key, btn);
    }
  }
}

function draw() {
  const key = pairKey(...guards);
  const count = totals[key];
  const delta = count - totals[baseline];
  $("pair-label").textContent = names(key);
  $("map-reach").textContent = names(key) + " · " + count + "/" + routes.length + " reached";
  $("score").textContent = count;
  $("difference").hidden = key === baseline;
  $("difference").textContent = (delta > 0 ? "+" : "") + delta + " vs " + names(baseline);
  $("difference").classList.toggle("negative", delta < 0);
  $("compare").textContent = (key === best ? "Return to " : "Try ") + names(key === best ? baseline : best);
  $("delta").textContent = names(key) + " reaches " + count + " of " + routes.length + " simulated students.";
  const grouped = { kept: 0, gained: 0, lost: 0, neither: 0 };
  routes.forEach((route, i) => {
    const before = [...baseline].some(p => route.includes(p));
    const now = guards.some(p => route.includes(p));
    const group = now ? (before ? "kept" : "gained") : (before ? "lost" : "neither");
    grouped[group]++;
    studentDots[i].className = group;
  });
  for (const [group, value] of Object.entries(grouped)) $(group).textContent = value;
  const overlap = totals[guards[0]] + totals[guards[1]] - count;
  $("detail").textContent = overlap + (overlap === 1 ? " student passes" : " students pass") +
    " through both " + names(key) + ". Subtract the overlap to count each student once.";
  const terms = [[totals[guards[0]], "Crossing " + guards[0]], [totals[guards[1]], "Crossing " + guards[1]], [overlap, "Both"], [count, "Reached"]];
  $("equation").replaceChildren();
  terms.forEach(([value, label], i) => {
    if (i) $("equation").append(element("span", ["+", "−", "="][i - 1], "operator"));
    const term = element("div");
    term.append(element("strong", value), element("span", label));
    $("equation").append(term);
  });
  const rank = 1 + pairs.filter(p => totals[p] > count).length;
  const tied = pairs.some(p => p !== key && totals[p] === count);
  $("rank").textContent = names(key) + " · " + (tied ? "Tied #" : "#") + rank + " of " + pairs.length;
  for (const [pair, btn] of cells) btn.setAttribute("aria-pressed", String(pair === key));
  guards.forEach((point, i) => {
    const select = $("g" + (i + 1));
    select.value = point;
    for (const opt of select.options) opt.disabled = opt.value === guards[1 - i];
  });
  drawMarkers();
}

guards.forEach((_, i) => {
  const select = $("g" + (i + 1));
  for (const point of points) select.add(new Option("Crossing " + point, point));
  select.onchange = () => move(i, select.value);
});
$("compare").onclick = () => choose([...(pairKey(...guards) === best ? baseline : best)], 1);
$("traffic").onclick = () => {
  const show = $("map").classList.toggle("show-counts");
  $("traffic").setAttribute("aria-pressed", String(show));
  $("traffic").textContent = show ? "Hide counts" : "Show counts";
};
buildMatrix();
draw();
setupProof();
