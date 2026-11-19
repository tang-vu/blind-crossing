import { fetchKemKey } from '@qorechain/qoreseal/network';
import { fetchPqKeyStatus } from '@qorechain/qoresign/network';
import { base64, chainId, rest, check } from './format.mjs';
export const prefix = 'blind-crossing/v1/';
export const pqType = '/qorechain.pqc.v1.MsgRegisterPQCKeyV2';
export const kemType = '/qorechain.pqc.v1.MsgRegisterKEMKey';
export async function get(path) {
  const r = await fetch(rest + path, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw Error('Diana HTTP ' + r.status + ' at ' + path);
  return r.json();
}
export async function checkChain() {
  const info = await get('/cosmos/base/tendermint/v1beta1/node_info');
  check(info.default_node_info.network === chainId,'Unexpected chain ID');
}
export async function checkRegistry(member) {
  const {address} = member;
  const [kem,pq] = await Promise.all([fetchKemKey({rest,address}),fetchPqKeyStatus({rest,address})]);
  check(pq.registered && pq.possessionProven && base64.encode(pq.publicKey) === member.pq,'ML-DSA registry mismatch for ' + address);
  check(kem.registered && base64.encode(kem.publicKey) === member.kem,'ML-KEM registry mismatch for ' + address);
}
export async function receipt(id) {
  check(typeof id === 'string' && /^[0-9A-F]{64}$/.test(id),'Invalid transaction hash');
  const {tx,tx_response:r} = await get('/cosmos/tx/v1beta1/txs/' + id);
  check(r.txhash === id && Number(r.code) === 0 && BigInt(r.height) > 0n,'Unsuccessful transaction ' + id);
  return {body:tx.body,height:BigInt(r.height)};
}
export async function verifyEvidence(bundle) {
  check(bundle.round.mode === 'diana' && bundle.evidence,'Missing Diana chain evidence');
  await checkChain();
  const proof = bundle.evidence;
  const anchor = await receipt(proof.anchor);
  const tx = anchor.body;
  const [payment] = tx.messages;
  check(tx.messages.length === 1 && payment['@type'] === '/cosmos.bank.v1beta1.MsgSend' &&
    payment.from_address === payment.to_address && payment.amount.length === 1 &&
    payment.amount[0].amount === '1' && payment.amount[0].denom === 'uqor' &&
    bundle.round.members.some(m => m.address === payment.from_address) && tx.memo === prefix + bundle.commitment,
    'Anchor transaction does not bind this round');
  const hybrid = b => b.extension_options?.some(e => e['@type'] === '/qorechain.pqc.v1.PQCHybridSignature') ||
    b.non_critical_extension_options?.some(e => e['@type'] === '/qorechain.pqc.v1.PQCHybridSignature');
  check(hybrid(tx),'Missing hybrid signature on anchor');
  for (const member of bundle.round.members) {
    const ids = proof.registrations[member.address];
    check(ids,'Missing enrollment receipts for ' + member.address);
    const [pq,kem] = await Promise.all([receipt(ids.pq),receipt(ids.kem)]);
    for (const [result,type,key] of [[pq,pqType,member.pq],[kem,kemType,member.kem]]) {
      check(result.body.messages.some(m => m['@type'] === type && m.sender === member.address && m.public_key === key),
        'Registration transaction does not match ' + member.address);
    }
    check(pq.height <= kem.height && kem.height <= anchor.height && hybrid(kem.body),'Invalid registration history');
  }
  return proof.anchor;
}
