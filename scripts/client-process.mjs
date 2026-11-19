import { newClient } from "../src/client.mjs";
import { checkRegistry } from "../src/network.mjs";
import { wallet } from "./wallets.mjs";

const [slot, mode] = process.argv.slice(2);
const client = newClient(
  mode === "diana" ? (await wallet(slot)).mnemonic : undefined,
);
const imaginary = { one: ["A", "B"], two: ["C"], three: ["D", "H"] };
process.on("message", async ({ cmd, data }) => {
  try {
    let result;
    if (cmd === "accept") {
      if (mode === "diana")
        for (const m of data.members) await checkRegistry(m);
      result = client.accept(data);
    } else if (cmd === "exchange") result = client.start();
    else if (cmd === "contribute") {
      for (const packet of data) client.receive(packet);
      result = client.contribute(imaginary[slot]);
    } else throw Error("Unknown protocol command");
    process.send({ result });
  } catch (e) {
    process.send({ error: e.message });
  }
});
process.send({ result: client.member });
