import { addressFromPublicKey, deriveClassicalKey, deriveCanonicalPqKey, pqSign } from '@qorechain/qoresign';
import { deriveSealKeys, seal, open, signRecipientCard } from '@qorechain/qoreseal';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { base64, chainId, check, hash, payload } from './format.mjs';
import { recipient, validateRound, verifySignature } from './verify.mjs';

export function newClient(mnemonic = generateMnemonic(wordlist, 256)) {
  const classicalKey = deriveClassicalKey({mnemonic});
  const address = addressFromPublicKey(classicalKey.publicKey, 'secp256k1').bech32;
  const pqKey = deriveCanonicalPqKey({mnemonic,address});
  const keys = deriveSealKeys({mnemonic});
  const card = signRecipientCard({chainId,address,keys,classicalKey,pqKey});
  const member = {address,pq:base64.encode(pqKey.publicKey),kem:base64.encode(keys.mlkemPublicKey),card};
  const sign = (kind,body) => ({body, signature:base64.encode(pqSign(pqKey.secretKey,payload(kind,body)))});
  let round, digest, submitted = false;
  const secrets = new Map();
  function accept(manifest) {
    check(!round,'Client already belongs to a round');
    validateRound(manifest);
    check(manifest.members.some(m => hash(m) === hash(member)), 'Own identity missing or changed');
    round = manifest;
    digest = hash(round);
    return digest;
  }
  function start() {
    check(round && !submitted && secrets.size === 0,'Invalid exchange state');
    return round.members.filter(m => address < m.address).map(peer => {
      const seed = crypto.getRandomValues(new Uint8Array(32));
      const context = { round:digest, sender:address, receiver:peer.address };
      const envelope = seal({chainId, purpose:'blind-crossing/pair/v1', aad:payload('context',context),
        recipients:[recipient(peer)],plaintext:seed});
      secrets.set(peer.address,seed);
      return sign('envelope',{...context, envelope:base64.encode(envelope)});
    });
  }
  function receive({body,signature}) {
    check(round && !submitted && body.round === digest && body.receiver === address && body.sender < address, 'Misaddressed envelope');
    const peer = round.members.find(m => m.address === body.sender);
    check(peer && !secrets.has(peer.address),'Unknown or repeated envelope');
    verifySignature(peer,'envelope',body,signature);
    const {envelope,...context} = body;
    const seed = open({chainId,purpose:'blind-crossing/pair/v1',aad:payload('context',context),keys,envelope:base64.decode(envelope)});
    check(seed.length === 32,'Invalid pair secret');
    secrets.set(peer.address,seed);
  }
  function contribute(route) {
    check(round && !submitted && secrets.size === round.members.length-1,'Pair exchange incomplete or already submitted');
    check(Array.isArray(route) && route.every(p => /^[A-H]$/.test(p)), 'Invalid hypothetical crossing');
    const values = round.options.map(option => {
      let value = Number(route.some(point => option.includes(point)));
      for (const [peer,seed] of secrets) {
        const bytes = hmac(sha256,seed,payload('mask',[digest,option,...[address,peer].sort()]));
        const mask = new DataView(bytes.buffer,bytes.byteOffset).getUint32(0);
        value = (value + (address < peer ? mask : -mask)) >>> 0;
      }
      return value;
    });
    submitted = true;
    const signed = sign('contribution',{sender:address,round:digest,values});
    for (const seed of secrets.values()) seed.fill(0);
    secrets.clear();
    return signed;
  }
  return {member,accept,start,receive,contribute};
}
