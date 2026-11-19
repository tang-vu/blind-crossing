import { newClient } from "../src/client.mjs";

let client;
let sampleRoute;
self.onmessage = ({ data: { command, data } }) => {
  try {
    let result;
    switch (command) {
      case "create":
        client = newClient();
        sampleRoute = [undefined, ["C"], ["D"]][data];
        result = client.member;
        break;
      case "accept":
        result = client.accept(data);
        break;
      case "exchange":
        result = client.start();
        break;
      case "receive":
        for (const envelope of data) client.receive(envelope);
        break;
      case "sign":
        result = client.contribute(sampleRoute ?? data);
        break;
      default:
        throw Error("Unknown wallet operation");
    }
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
