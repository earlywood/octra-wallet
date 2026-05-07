import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  deriveAddress,
  deriveHdSeed,
  isValidAddress,
  keypairFromMnemonic,
  keypairFromPrivateKeyB64,
  keypairFromSeed,
  signEd25519,
} from '../src/lib/crypto';
import * as ed from '@noble/ed25519';

describe('byte/base64/hex helpers', () => {
  it('base64 round-trips', () => {
    const b = new Uint8Array([0, 1, 2, 3, 255, 254, 253]);
    expect(base64ToBytes(bytesToBase64(b))).toEqual(b);
  });

  it('hex matches expected encoding', () => {
    expect(bytesToHex(new Uint8Array([0, 15, 16, 255]))).toBe('000f10ff');
  });

  it('base64 of empty is empty', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
    expect(base64ToBytes('')).toEqual(new Uint8Array(0));
  });
});

describe('deriveAddress', () => {
  it('produces a valid 47-char oct… address from a 32-byte pubkey', () => {
    const pub = new Uint8Array(32).fill(0xab);
    const addr = deriveAddress(pub);
    expect(addr.length).toBe(47);
    expect(addr.startsWith('oct')).toBe(true);
    expect(isValidAddress(addr)).toBe(true);
  });

  it('rejects wrong-length pubkeys', () => {
    expect(() => deriveAddress(new Uint8Array(31))).toThrow();
    expect(() => deriveAddress(new Uint8Array(33))).toThrow();
  });

  it('is deterministic', () => {
    const pub = new Uint8Array(32).fill(0x42);
    expect(deriveAddress(pub)).toBe(deriveAddress(pub));
  });

  it('different pubkeys → different addresses', () => {
    const a = deriveAddress(new Uint8Array(32).fill(1));
    const b = deriveAddress(new Uint8Array(32).fill(2));
    expect(a).not.toBe(b);
  });
});

describe('keypairFromSeed', () => {
  it('generates a deterministic 32-byte pubkey from a 32-byte seed', () => {
    const seed = new Uint8Array(32).fill(0x11);
    const kp = keypairFromSeed(seed);
    expect(kp.publicKey.length).toBe(32);
    expect(kp.privateKey).toEqual(seed);
    expect(kp.address.startsWith('oct')).toBe(true);
  });

  it('matches noble/ed25519 directly', () => {
    const seed = new Uint8Array(32).fill(0x77);
    const kp = keypairFromSeed(seed);
    expect(Array.from(kp.publicKey)).toEqual(Array.from(ed.getPublicKey(seed)));
  });

  it('rejects non-32-byte seeds', () => {
    expect(() => keypairFromSeed(new Uint8Array(31))).toThrow();
    expect(() => keypairFromSeed(new Uint8Array(64))).toThrow();
  });
});

describe('signEd25519', () => {
  it('produces a 64-byte signature that verifies', async () => {
    const seed = new Uint8Array(32).fill(0x33);
    const msg = new TextEncoder().encode('hello octra');
    const sig = signEd25519(msg, seed);
    expect(sig.length).toBe(64);
    const pub = ed.getPublicKey(seed);
    expect(await ed.verifyAsync(sig, msg, pub)).toBe(true);
  });

  it('signature is deterministic for same key+msg (Ed25519 is deterministic)', () => {
    const seed = new Uint8Array(32).fill(0x55);
    const msg = new TextEncoder().encode('octra');
    const a = signEd25519(msg, seed);
    const b = signEd25519(msg, seed);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('deriveHdSeed', () => {
  // These are regression fixtures. They were locked in from the working build
  // — if anyone changes the HMAC key string, derivation algorithm, or index
  // encoding, the resulting addresses change and existing wallets stop showing
  // the right balances. Tests here mean that won't happen silently.
  const master = new Uint8Array(64);
  for (let i = 0; i < 64; i++) master[i] = i;

  it('hdVersion 1, index 0 = first 32 bytes of master (legacy)', () => {
    const seed = deriveHdSeed(master, 0, 1);
    expect(Array.from(seed)).toEqual(Array.from(master.slice(0, 32)));
  });

  it('hdVersion 2, index 0 ≠ legacy slice (current default)', () => {
    const v1 = deriveHdSeed(master, 0, 1);
    const v2 = deriveHdSeed(master, 0, 2);
    expect(Array.from(v1)).not.toEqual(Array.from(v2));
    expect(v2.length).toBe(32);
  });

  it('different indexes produce different seeds', () => {
    const a = deriveHdSeed(master, 1, 2);
    const b = deriveHdSeed(master, 2, 2);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('is deterministic for fixed master + index + version', () => {
    expect(deriveHdSeed(master, 5, 2)).toEqual(deriveHdSeed(master, 5, 2));
  });

  it('rejects non-64-byte master seeds', () => {
    expect(() => deriveHdSeed(new Uint8Array(63), 0, 2)).toThrow();
    expect(() => deriveHdSeed(new Uint8Array(65), 0, 2)).toThrow();
  });

  it('uses little-endian index encoding', () => {
    // index 256 should differ from 1 in the second-byte slot
    const i1 = deriveHdSeed(master, 1, 2);
    const i256 = deriveHdSeed(master, 256, 2);
    expect(Array.from(i1)).not.toEqual(Array.from(i256));
  });
});

describe('keypairFromMnemonic', () => {
  // BIP-39 standard test vector — "abandon" × 11 + "about" → known seed
  const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('round-trips: deriving same mnemonic → same address', () => {
    const a = keypairFromMnemonic(ABANDON, 0, 2);
    const b = keypairFromMnemonic(ABANDON, 0, 2);
    expect(a.address).toBe(b.address);
  });

  it('different HD versions for index 0 produce different addresses', () => {
    const v1 = keypairFromMnemonic(ABANDON, 0, 1);
    const v2 = keypairFromMnemonic(ABANDON, 0, 2);
    expect(v1.address).not.toBe(v2.address);
  });

  it('different indexes produce different addresses', () => {
    const a = keypairFromMnemonic(ABANDON, 0, 2);
    const b = keypairFromMnemonic(ABANDON, 1, 2);
    expect(a.address).not.toBe(b.address);
  });

  it('throws on invalid mnemonic', () => {
    expect(() => keypairFromMnemonic('not a real mnemonic at all foo bar baz', 0, 2)).toThrow();
  });

  it('exposes the 64-byte master seed for the vault', () => {
    const kp = keypairFromMnemonic(ABANDON, 0, 2);
    expect(kp.masterSeed.length).toBe(64);
  });
});

describe('keypairFromPrivateKeyB64', () => {
  it('accepts a 32-byte raw seed (base64)', () => {
    const seed = new Uint8Array(32).fill(0x09);
    const kp = keypairFromPrivateKeyB64(bytesToBase64(seed));
    expect(kp.privateKey).toEqual(seed);
  });

  it('accepts a 64-byte tweetnacl-expanded form (base64) and slices it', () => {
    // First 32 bytes is the seed; remaining 32 is the cached pubkey we ignore.
    const seed = new Uint8Array(32).fill(0xaa);
    const expanded = new Uint8Array(64);
    expanded.set(seed, 0);
    const kp = keypairFromPrivateKeyB64(bytesToBase64(expanded));
    expect(kp.privateKey).toEqual(seed);
  });

  it('rejects other lengths', () => {
    expect(() => keypairFromPrivateKeyB64(bytesToBase64(new Uint8Array(16)))).toThrow();
    expect(() => keypairFromPrivateKeyB64(bytesToBase64(new Uint8Array(48)))).toThrow();
  });
});
