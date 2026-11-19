import { base64, hex } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
export const chainId = 'qorechain-diana';
export const rest = 'https://api-testnet.qore.host';
export const encode = (text) => new TextEncoder().encode(text);
export { base64 };
export function check(ok, message) { if (!ok) throw new Error(message); }
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  check(value === null || typeof value === 'string' || typeof value === 'boolean' || Number.isSafeInteger(value), 'Unsupported field');
  return JSON.stringify(value);
}
export const hash = value => hex.encode(sha256(encode(canonical(value))));
export const payload = (kind, body) => encode(canonical(['blind-crossing/v1', kind, body]));
export const liveOptions = ['AB', 'AC'];
export function manifest(members, mode) {
  return { version: 1, chainId, id: crypto.randomUUID(), mode, options: [...liveOptions],
    members: [...members].sort((a,b) => a.address < b.address ? -1 : 1) };
}
export const checksum = ({round, contributions}) => hash({round, contributions});
