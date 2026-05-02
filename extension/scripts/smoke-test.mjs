// Smoke test: generate a deterministic keypair from a fixed mnemonic and verify
// that address derivation, canonical JSON, and signing round-trip cleanly.
import * as ed from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2';
import { hmac } from '@noble/hashes/hmac';
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import bs58 from 'bs58';

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const te = new TextEncoder();

function deriveAddress(pk) {
  const h = sha256(pk);
  let b58 = bs58.encode(h);
  while (b58.length < 44) b58 = '1' + b58;
  return 'oct' + b58;
}

function deriveHdSeed(masterSeed, index, hdVersion) {
  if (hdVersion === 1 && index === 0) return masterSeed.slice(0, 32);
  const key = te.encode('Octra seed');
  if (hdVersion === 2 && index === 0) return hmac(sha512, key, masterSeed).slice(0, 32);
  const data = new Uint8Array(68);
  data.set(masterSeed, 0);
  data[64] = index & 0xff;
  data[65] = (index >> 8) & 0xff;
  data[66] = (index >> 16) & 0xff;
  data[67] = (index >> 24) & 0xff;
  return hmac(sha512, key, data).slice(0, 32);
}

function jsonEscape(s) {
  let r = '';
  for (const c of s) {
    switch (c) {
      case '"':  r += '\\"';  break;
      case '\\': r += '\\\\'; break;
      case '\b': r += '\\b';  break;
      case '\f': r += '\\f';  break;
      case '\n': r += '\\n';  break;
      case '\r': r += '\\r';  break;
      case '\t': r += '\\t';  break;
      default:   r += c;
    }
  }
  return r;
}

function canonicalJson(tx) {
  let s = '{"from":"' + jsonEscape(tx.from) + '"'
    + ',"to_":"' + jsonEscape(tx.to_) + '"'
    + ',"amount":"' + jsonEscape(tx.amount) + '"'
    + ',"nonce":' + (tx.nonce | 0)
    + ',"ou":"' + jsonEscape(tx.ou) + '"'
    + ',"timestamp":' + JSON.stringify(tx.timestamp)
    + ',"op_type":"' + jsonEscape(tx.op_type ?? 'standard') + '"';
  if (tx.encrypted_data) s += ',"encrypted_data":"' + jsonEscape(tx.encrypted_data) + '"';
  if (tx.message) s += ',"message":"' + jsonEscape(tx.message) + '"';
  s += '}';
  return s;
}

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
console.log('mnemonic valid:', validateMnemonic(MNEMONIC, wordlist));

const masterSeed = mnemonicToSeedSync(MNEMONIC);
const seed32 = deriveHdSeed(masterSeed, 0, 2);
const pk = ed.getPublicKey(seed32);
const addr = deriveAddress(pk);

console.log('derived address:', addr);
console.log('  length:', addr.length, '(expect 47)');
console.log('  starts with oct:', addr.startsWith('oct'));

const tx = {
  from: addr,
  to_: addr,
  amount: '1000000',
  nonce: 1,
  ou: '10000',
  timestamp: 1714603200.5,
  op_type: 'standard',
};
const canonical = canonicalJson(tx);
console.log('canonical json:', canonical);

const sig = ed.sign(te.encode(canonical), seed32);
const sigB64 = Buffer.from(sig).toString('base64');
console.log('signature (b64):', sigB64);
console.log('signature length:', sig.length, '(expect 64)');

const verified = ed.verify(sig, te.encode(canonical), pk);
console.log('verifies:', verified);

if (!verified || addr.length !== 47 || !addr.startsWith('oct')) {
  console.error('SMOKE TEST FAILED');
  process.exit(1);
}
console.log('SMOKE TEST OK');
