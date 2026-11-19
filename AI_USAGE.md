# How AI was used in Blind Crossing

Blind Crossing was built by solo entrant `tang-vu` with OpenAI Codex as a coding agent. The entrant supplied the school-crossing brief and the six groups that define the 100 fictional routes. On those routes, moving a guard from B to C had to reach 28 additional students. The brief also specified what families could disclose and what a judge should be able to verify after the website goes offline.

## From the brief to a working application

| Task | Work performed with Codex | Evidence |
| --- | --- | --- |
| Crossing planner | Implemented the route generator and counted each student once per placement. Built the fictional map, dragging and keyboard controls, then checked the 62 and 90 results against the supplied groups. | [Route generator](src/simulation.mjs) · [Planner tests](tests/round.test.mjs) |
| Private survey | Implemented the pairwise exchange using QoreSeal and the signed contributions using QoreSign. Wrote a separate verifier and checked what happens when a contribution is removed, duplicated or changed. | [Client](src/client.mjs) · [Verifier](src/verify.mjs) |
| QR room | Built the coordinator and participant screens. An early browser run stalled before participants could confirm the roster. After switching the PeerJS connection from JSON to binary serialization, three browser sessions completed the exchange. A separate test closed a participant after roster lock and checked that the coordinator aborted the round. | [Room](web/room.mjs) · [Browser test](tests/browser-smoke.mjs) |
| Judge materials | Produced the cover and recorded the working planner and verifier. Packaged the signed round, standalone verifier and seven public transaction receipts for offline use. | [Walkthrough](https://tang-vu.github.io/blind-crossing/planner-walkthrough.mp4) · [Verification kit](https://github.com/tang-vu/blind-crossing/releases/tag/diana-round-1) |

## Human actions and independent checks

The entrant obtained faucet funds, connected their own GitHub, X and QoreX accounts, and created the competition entry. Once the test wallet was funded, Codex ran the registration and anchoring scripts against Diana. The three client processes ran on one computer. A separate GitHub Actions runner checked the signatures, six key registrations and anchor transaction, and reproduced **AB = 1** and **AC = 2** for that three-member round. [Diana bundle](evidence/diana.json) · [Independent verification run](https://github.com/tang-vu/blind-crossing/actions/runs/44540435357)

The public planner uses 100 simulated routes. The browser tests used isolated sessions on one computer. At the time this record was written, the adult field trial on separate devices and the first-time-user comprehension test were still pending.
