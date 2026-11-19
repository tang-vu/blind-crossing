import assert from 'node:assert/strict';
import {test} from 'node:test';
import {verifyEvidence, pqType, kemType, prefix} from '../src/network.mjs';

// These deliberately mocked receipts exercise the verifier. They are never published as evidence.
test('Diana receipts bind network, commitment, signer, registered keys and execution result',async t=>{
  const address='member';
  const member={address,pq:'public-signing-key',kem:'public-encryption-key'};
  const [anchor,pq,kem]=['1','2','3'].map(c=>c.repeat(64));
  const bundle={round:{mode:'diana',members:[member]},commitment:'digest',evidence:{anchor,registrations:{[address]:{pq,kem}}}};
  const ext=[{'@type':'/qorechain.pqc.v1.PQCHybridSignature'}];
  const make=(id,body,height)=>({tx:{body},tx_response:{txhash:id,height,code:0}});
  const reg=(type,key)=>({messages:[{'@type':type,sender:address,public_key:key}],extension_options:ext});
  const payment={'@type':'/cosmos.bank.v1beta1.MsgSend',from_address:address,to_address:address,amount:[{amount:'1',denom:'uqor'}]};
  const chain={default_node_info:{network:'qorechain-diana'}};
  const receipts={
    [pq]:make(pq,reg(pqType,member.pq),'10'),
    [kem]:make(kem,reg(kemType,member.kem),'11'),
    [anchor]:make(anchor,{messages:[payment],memo:prefix+'digest',extension_options:ext},'13'),
  };
  t.mock.method(globalThis,'fetch',async url=>{
    const data=url.endsWith('node_info')?chain:receipts[url.split('/').at(-1)];
    return Response.json(data??{},{status:data?200:404});
  });
  assert.equal(await verifyEvidence(bundle),anchor);
  for(const [object,key,bad,pattern] of [
    [chain.default_node_info,'network','wrong',/chain ID/],
    [receipts[anchor].tx.body,'memo','different',/does not bind/],
    [payment,'from_address','other',/does not bind/],
    [receipts[kem].tx_response,'code',7,/Unsuccessful/],
    [receipts[pq].tx.body.messages[0],'public_key','different',/does not match/],
    [receipts[kem].tx_response,'height','14',/history/],
    [receipts[anchor].tx.body,'extension_options',[],/Missing hybrid/],
  ]){
    const original=object[key];object[key]=bad;
    await assert.rejects(()=>verifyEvidence(bundle),pattern);
    object[key]=original;
  }
});
