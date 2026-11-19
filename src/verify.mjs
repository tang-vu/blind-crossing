import { verifyRecipientCard } from '@qorechain/qoreseal';
import { pqVerify } from '@qorechain/qoresign';
import { base64, canonical, chainId, check, checksum, hash, liveOptions, payload } from './format.mjs';

export function recipient(member) {
  return verifyRecipientCard({ card: member.card, address: member.address, chainId,
    pqPublicKey: base64.decode(member.pq), mlkemPublicKey: base64.decode(member.kem) });
}

export function validateRound(round) {
  check(round.version === 1 && round.chainId === chainId, 'Unsupported protocol or chain');
  check(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(round.id), 'Invalid round ID');
  check(['rehearsal','diana'].includes(round.mode), 'Unknown round mode');
  check(canonical(round.options) === canonical(liveOptions), 'Unexpected survey questions');
  const roster = round.members;
  check(Array.isArray(roster) && roster.length >= 3 && roster.length <= 12, 'A room requires 3–12 members');
  check(roster.every((m,i) => i === 0 || roster[i-1].address < m.address), 'Duplicate or unordered member');
  for (const m of roster) recipient(m);
}

export function verifySignature(member, kind, body, signature) {
  check(pqVerify(base64.decode(member.pq), payload(kind,body), base64.decode(signature)), 'Invalid ' + kind + ' signature for ' + member.address);
}

export function verifyBundle(bundle, expectedCommitment) {
  const { round, contributions, commitment } = bundle;
  validateRound(round);
  const digest = hash(round);
  const seen = new Set();
  const totals = round.options.map(() => 0);
  check(Array.isArray(contributions) && contributions.length <= round.members.length, 'Unexpected number of contributions');
  for (const {body, signature} of contributions) {
    const member = round.members.find(m => m.address === body.sender);
    check(member, 'Unknown member ' + body.sender);
    check(!seen.has(body.sender), 'Duplicate contribution from ' + body.sender);
    check(body.round === digest, 'Contribution belongs to a different round');
    check(Array.isArray(body.values) && body.values.length === totals.length, 'Unexpected vector length');
    verifySignature(member,'contribution',body,signature);
    body.values.forEach((x,i) => {
      check(Number.isSafeInteger(x) && x >= 0 && x <= 0xffffffff, 'Invalid masked value');
      totals[i] = (totals[i] + x) >>> 0;
    });
    seen.add(body.sender);
  }
  const missing = round.members.filter(m => !seen.has(m.address));
  check(missing.length === 0, 'Missing contribution: ' + missing.map(m => m.address).join(', '));
  check(contributions.every((c,i) => c.body.sender === round.members[i].address), 'Noncanonical contribution order');
  check(totals.every(x => x <= seen.size), 'Aggregate outside member count');
  check(commitment === checksum(bundle), 'Bundle hash mismatch');
  if (expectedCommitment !== undefined) check(expectedCommitment === commitment,'Expected commitment differs');
  return Object.fromEntries(round.options.map((q,i) => [q,totals[i]]));
}
