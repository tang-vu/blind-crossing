import http from "node:http";
import { readFile } from "node:fs/promises";
import { ExpressPeerServer } from "peer";
import express from "express";
import { rest } from "../src/format.mjs";
const app = express(),
  server = http.createServer(app);
const port = Number(process.env.PORT || 4173);
app.use("/signal", ExpressPeerServer(server, { path: "/" }));
// Fixed, read-only Diana registry routes let mobile browsers check keys despite upstream CORS.
app.get("/registry/qorechain/pqc/v1/:kind/:address", async (req, res) => {
  const { kind, address } = req.params;
  if (!["account", "kem"].includes(kind) || !/^qor1[a-z0-9]{38}$/.test(address))
    return res.sendStatus(400);
  try {
    const r = await fetch(rest + "/qorechain/pqc/v1/" + kind + "/" + address, {
      signal: AbortSignal.timeout(15000),
    });
    res.status(r.status).json(await r.json());
  } catch {
    res.sendStatus(502);
  }
});
app.get("/room.html", async (_req, res, next) => {
  try {
    const html = await readFile("dist/room.html", "utf8");
    res
      .type("html")
      .send(
        html.replace(
          '<script type="module"',
          '<script>globalThis.BC_LOCAL_SIGNAL=true</script><script type="module"',
        ),
      );
  } catch (e) {
    next(e);
  }
});
app.use(express.static("dist"));
server.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(
    "Blind Crossing at http://" +
      (process.env.HOST || "127.0.0.1") +
      ":" +
      port,
  ),
);
