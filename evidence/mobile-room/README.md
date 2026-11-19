# Mobile QR rehearsal

On November 19, 2026, three mobile profiles joined the public Blind Crossing room. Each ran in its own Chromium browser process on one Windows computer. A fourth browser coordinated. The test decoded the QR image displayed on the coordinator’s screen. Each participant confirmed the same three wallets and round fingerprint, then used touch controls to select a fictional route. [Public room](https://tang-vu.github.io/blind-crossing/room.html) · [Tested version](https://github.com/tang-vu/blind-crossing/commit/87fc6ec214ecba1d73809bd11859ec82da1af49c)

| Run | Pixel 7 | Galaxy S24 | Galaxy Tab S9 | Observed outcome |
| --- | --- | --- | --- | --- |
| Complete | A, B | C | D, H | A+B reached 1 and A+C reached 2. All four downloads matched byte for byte. |
| Disconnect after two submissions | A | C | Browser process closed before submitting | All three remaining screens closed the round within 19.5 seconds and withheld the download. |
| Fresh room | Empty route | B | A, C | A+B reached 2 and A+C reached 1. All four downloads matched again. |

The first group stayed connected with the route picker open for 22 seconds before sending. Each new room used a different round ID and three fresh wallet addresses. Each finished round passed the downloadable standalone verifier. Removing one contribution from either packet produced exit code 1 and the missing wallet address. The disconnected run produced no signed packet. [Recorded observations and file hashes](results.json)

The same computer ran an additional iPhone 15 viewport check using Playwright WebKit 27.2. The planner returned 62 and 90, and the archived Diana ledger verified totals of 1 and 2. This Windows WebKit build lacked the WebRTC API needed for the QR room. These rehearsals involved **0 physical participant devices** and published **0 testnet transactions**.

## Verify the two completed rounds

Download the two JSON packets and the standalone verifier into one folder. Run with Node 24. [First packet](complete.json) · [Fresh-room packet](fresh-retry.json) · [Standalone verifier](https://tang-vu.github.io/blind-crossing/verify-round.mjs)

```sh
node verify-round.mjs complete.json --expect=a41d65c2d2c5360c07a0cb1a9452f9dfd7562b85679d65052acdaa31b03317d3
node verify-round.mjs fresh-retry.json --expect=581b51f0ae5e7bcd90c6540af0088534c5cc42994767c347a4c6b414255f7383
```
