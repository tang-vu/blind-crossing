import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { addressFromPublicKey, deriveClassicalKey } from '@qorechain/qoresign';

export const slots = ['one', 'two', 'three'];
export async function wallet(slot, create = false) {
  if (!slots.includes(slot)) throw Error('Unknown client');
  const dir = '.private/diana';
  const path = dir + '/' + slot + '.txt';
  if (create) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    try {
      await writeFile(path, generateMnemonic(wordlist, 256) + '\n', { flag: 'wx', mode: 0o600 });
    } catch (err) { if (err.code !== 'EEXIST') throw err; }
  }
  const mnemonic = (await readFile(path, 'utf8')).trim();
  const classical = deriveClassicalKey({ mnemonic });
  const address = addressFromPublicKey(classical.publicKey, 'secp256k1').bech32;
  return { mnemonic, classical, address };
}
