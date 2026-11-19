import { readFile } from 'node:fs/promises';
import { verifyBundle } from '../src/verify.mjs';
import { verifyEvidence } from '../src/network.mjs';

const [file,...flags] = process.argv.slice(2);
try {
  if (!file || flags.some(f=>f !== '--chain' && !/^--expect=[0-9a-f]{64}$/.test(f))) throw Error('Usage: npm run verify -- FILE [--chain] [--expect=SHA256]');
  const bundle = JSON.parse(await readFile(file,'utf8'));
  const counts = verifyBundle(bundle,flags.find(f=>f.startsWith('--expect='))?.slice(9));
  if (flags.includes('--chain')) console.log('Diana receipts verified:',await verifyEvidence(bundle));
  else console.log('Offline signature and commitment verification. Chain receipts require --chain.');
  console.log(JSON.stringify({mode:bundle.round.mode,round:bundle.round.id,members:bundle.round.members.length,counts,commitment:bundle.commitment},null,2));
} catch(e) { console.error('Verification refused:',e.message); process.exitCode=1; }
