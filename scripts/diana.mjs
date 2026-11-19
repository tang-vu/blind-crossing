import { readFile, writeFile, rename } from 'node:fs/promises';
import { encodeSecp256k1Pubkey } from '@cosmjs/amino';
import { encodePubkey, makeAuthInfoBytes } from '@cosmjs/proto-signing';
import { MsgSend } from 'cosmjs-types/cosmos/bank/v1beta1/tx';
import { TxBody } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { deriveSealKeys, buildRegisterKemKeyMessage } from '@qorechain/qoreseal';
import { fetchKemKey } from '@qorechain/qoreseal/network';
import { buildRegisterPqKeyMessage, deriveCanonicalPqKey, signHybrid } from '@qorechain/qoresign';
import { broadcastTx, fetchPqKeyStatus, resolveSignBytesVersion, simulateTx, submitWithSignBytesFallback } from '@qorechain/qoresign/network';
import { base64, chainId, rest, check } from '../src/format.mjs';
import { checkChain, get, kemType, pqType, prefix, verifyEvidence } from '../src/network.mjs';
import { verifyBundle } from '../src/verify.mjs';
import { slots, wallet } from './wallets.mjs';

const [command, file] = process.argv.slice(2);
const book = '.private/diana/receipts.json';
async function readBook() {
  try { return JSON.parse(await readFile(book,'utf8')); } catch(e) { if (e.code === 'ENOENT') return {}; throw e; }
}
async function save(path, data) {
  await writeFile(path+'.tmp', JSON.stringify(data,null,2)+'\n');
  await rename(path+'.tmp',path);
}
function transfer(fromAddress,toAddress,amount) {
  return {typeUrl:'/cosmos.bank.v1beta1.MsgSend',value:MsgSend.encode({fromAddress,toAddress,
    amount:[{denom:'uqor',amount:String(amount)}]}).finish()};
}
async function send(w, messages, memo='', mode='hybrid') {
  const {info} = await get('/cosmos/auth/v1beta1/account_info/'+w.address);
  const bodyBytes = TxBody.encode(TxBody.fromPartial({messages,memo})).finish();
  const pqKey = deriveCanonicalPqKey({mnemonic:w.mnemonic,address:w.address});
  const sign = (limit,version) => signHybrid({chainId,accountNumber:BigInt(info.account_number),bodyBytes,
    authInfoBytes:makeAuthInfoBytes([{pubkey:encodePubkey(encodeSecp256k1Pubkey(w.classical.publicKey)),sequence:BigInt(info.sequence)}],
      [{denom:'uqor',amount:String((limit+9n)/10n)}],Number(limit),undefined,undefined,1),
    classicalKey:w.classical,pqKey,mode,signBytesVersion:version}).txBytes;
  const version = await resolveSignBytesVersion({rest,chainId});
  const sim = await simulateTx({rest,txBytes:sign(700000n,version)});
  const res = mode === 'hybrid' ? await submitWithSignBytesFallback({rest,chainId,signBytesVersion:version,sign:v=>sign(sim.suggestedGasLimit,v)})
    : await broadcastTx({rest,txBytes:sign(sim.suggestedGasLimit,version)});
  check(res.code === 0,'Diana rejected transaction: ' + res.log);
  console.log('Submitted',res.txhash);
  for (let i=0;i<50;i++) {
    const r = await fetch(rest+'/cosmos/tx/v1beta1/txs/'+res.txhash,{signal:AbortSignal.timeout(15000)});
    if (r.ok) {
      const {tx_response:tx} = await r.json();
      check(Number(tx.code) === 0 && BigInt(tx.height)>0n,'Transaction failed: '+tx.raw_log);
      return res.txhash;
    }
    if (r.status !== 404) throw Error('Receipt lookup HTTP '+r.status+' for '+res.txhash);
    await new Promise(done => setTimeout(done,1500));
  }
  throw Error('Commit pending: '+res.txhash);
}
async function recover(address,type,key) {
  const params = new URLSearchParams({query:"message.sender='" + address + "' AND message.action='" + type + "'",order_by:'ORDER_BY_DESC',limit:'100'});
  const page = await get('/cosmos/tx/v1beta1/txs?'+params);
  const row = page.txs.findIndex((tx,i) => Number(page.tx_responses[i].code) === 0 && tx.body.messages.some(m => m['@type'] === type && m.sender === address && m.public_key === key));
  check(row >= 0,'Missing registration receipt for '+address);
  return page.tx_responses[row].txhash;
}
async function register(w, records) {
  const {address,mnemonic,classical} = w;
  const pq = deriveCanonicalPqKey({mnemonic,address});
  const kem = deriveSealKeys({mnemonic});
  const status = await fetchPqKeyStatus({rest,address});
  const entry = records[address] ??= {};
  if (status.registered) {
    check(base64.encode(status.publicKey) === base64.encode(pq.publicKey),'Conflicting ML-DSA key');
    entry.pq ??= await recover(address,pqType,base64.encode(pq.publicKey));
  } else {
    entry.pq = await send(w,[buildRegisterPqKeyMessage({chainId,account:address,pqKey:pq,classicalPublicKey:classical.publicKey})],'','classicalOnly');
  }
  await save(book,records);
  const current = await fetchKemKey({rest,address});
  if (current.registered) {
    check(base64.encode(current.publicKey) === base64.encode(kem.mlkemPublicKey),'Conflicting ML-KEM key');
    entry.kem ??= await recover(address,kemType,base64.encode(kem.mlkemPublicKey));
  } else {
    entry.kem = await send(w,[buildRegisterKemKeyMessage({sender:address,mlkemPublicKey:kem.mlkemPublicKey})]);
  }
  await save(book,records);
}
async function balance(address) {
  return BigInt((await get('/cosmos/bank/v1beta1/balances/'+address)).balances.find(c=>c.denom==='uqor')?.amount ?? 0);
}
async function main() {
  const wallets = await Promise.all(slots.map(s=>wallet(s,command === 'wallets')));
  if (command === 'wallets') { for (const w of wallets) console.log(w.address); return; }
  await checkChain();
  const records = await readBook();
  if (command === 'register') {
    const [first,...others] = wallets;
    check(await balance(first.address)>0n,'Fund Diana wallet '+first.address+' at https://dashboard.qorechain.io/faucet');
    await register(first,records);
    for (const w of others) {
      const available = await balance(w.address);
      if (available < 500000n && !records[w.address]?.kem) await send(first,[transfer(first.address,w.address,1000000n-available)]);
      await register(w,records);
    }
  } else if (command === 'anchor') {
    check(file,'Specify a public Diana round JSON file');
    const bundle = JSON.parse(await readFile(file,'utf8'));
    verifyBundle(bundle);
    check(bundle.round.mode === 'diana','Rehearsal bundles cannot be anchored');
    const w = wallets[0];
    check(bundle.round.members.some(m=>m.address===w.address) && bundle.round.members.every(m=>records[m.address]?.kem),'Unknown registered roster');
    if (!bundle.evidence) {
      const memo = prefix + bundle.commitment;
      const query = new URLSearchParams({query:"message.sender='"+w.address+"' AND message.action='/cosmos.bank.v1beta1.MsgSend'",limit:'100',order_by:'ORDER_BY_DESC'});
      const page = await get('/cosmos/tx/v1beta1/txs?'+query);
      const index = page.txs.findIndex((tx,i)=>tx.body.memo === memo && Number(page.tx_responses[i].code) === 0);
      const anchor = index >= 0 ? page.tx_responses[index].txhash : await send(w,[transfer(w.address,w.address,1)],memo);
      bundle.evidence = {anchor,registrations:Object.fromEntries(bundle.round.members.map(m=>[m.address,records[m.address]]))};
    }
    await verifyEvidence(bundle);
    await save(file,bundle);
    console.log('Verified on Diana',bundle.evidence.anchor);
  } else throw Error('Choose wallets, register or anchor');
}
main().catch(e => { console.error(e.message); process.exitCode=1; });
