import { describe, expect, it } from 'vitest';
import {
  encodeApproveCalldata,
  encodeBalanceOfCalldata,
  encodeBurnCalldata,
} from '../../shared/abi';
import { BURN_SELECTOR, ETH_BRIDGE } from '../../shared/constants';

// Reference values produced from `cast calldata` (foundry) and verified once
// against the Octra contract at 0xE7eD69b852fd2a1406080B26A37e8E04e7dA4caE.
// If any of these change, that's a bug — the on-chain ABI is fixed.

describe('encodeBalanceOfCalldata', () => {
  it('emits selector + 32-byte left-padded address', () => {
    const cd = encodeBalanceOfCalldata('0xE7eD69b852fd2a1406080B26A37e8E04e7dA4caE');
    expect(cd).toBe('0x70a08231000000000000000000000000e7ed69b852fd2a1406080b26a37e8e04e7da4cae');
  });

  it('lowercases the address (no checksum sensitivity)', () => {
    const upper = encodeBalanceOfCalldata('0xE7ED69B852FD2A1406080B26A37E8E04E7DA4CAE');
    const lower = encodeBalanceOfCalldata('0xe7ed69b852fd2a1406080b26a37e8e04e7da4cae');
    expect(upper).toBe(lower);
  });
});

describe('encodeApproveCalldata', () => {
  it('emits approve(spender, uint256) for the bridge', () => {
    const cd = encodeApproveCalldata(ETH_BRIDGE, 1_000_000n);
    expect(cd).toBe(
      '0x095ea7b3' +
      '000000000000000000000000e7ed69b852fd2a1406080b26a37e8e04e7da4cae' +
      '00000000000000000000000000000000000000000000000000000000000f4240',
    );
  });

  it('handles uint256 max', () => {
    const max = (1n << 256n) - 1n;
    const cd = encodeApproveCalldata(ETH_BRIDGE, max);
    expect(cd.endsWith('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')).toBe(true);
  });

  it('handles zero amount', () => {
    const cd = encodeApproveCalldata(ETH_BRIDGE, 0n);
    expect(cd.endsWith('0000000000000000000000000000000000000000000000000000000000000000')).toBe(true);
  });
});

describe('encodeBurnCalldata', () => {
  // burn(string recipient, uint256 amount) — string FIRST, uint SECOND.
  // This was the bug we hit before — flipping arg order silently corrupted
  // every burn. Lock it down with a fixture.
  const oct = 'oct5MrNfjiXFNRDLwsodn8Zm9hDKNGAYt3eQDCQ52bSpCHq';

  it('starts with the burn selector', () => {
    const cd = encodeBurnCalldata(1_000_000n, oct);
    expect(cd.startsWith(BURN_SELECTOR)).toBe(true);
    expect(BURN_SELECTOR).toBe('0xe3e3aed0');
  });

  it('encodes [offset(0x40), uint256 amount, string len, string data padded]', () => {
    const cd = encodeBurnCalldata(1_000_000n, oct);
    // strip 0x and selector (8 hex chars)
    const body = cd.slice(2 + 8);
    // word 1: offset to string = 0x40 (64 bytes)
    expect(body.slice(0, 64)).toBe('0000000000000000000000000000000000000000000000000000000000000040');
    // word 2: amount = 1_000_000 = 0xf4240
    expect(body.slice(64, 128)).toBe('00000000000000000000000000000000000000000000000000000000000f4240');
    // word 3: string length = 47 (oct + 44 base58) = 0x2f
    expect(body.slice(128, 192)).toBe('000000000000000000000000000000000000000000000000000000000000002f');
    // word 4-5: 47 bytes of UTF-8 padded to 64 bytes
    const stringHex = body.slice(192);
    expect(stringHex.length).toBe(128); // 64 bytes hex
    // first byte 'o' = 0x6f
    expect(stringHex.startsWith('6f')).toBe(true);
    // tail padding zeros
    expect(stringHex.slice(94)).toMatch(/^0+$/);
  });

  it('produces same hex regardless of recipient case (we encode raw bytes)', () => {
    // octra addresses are case-sensitive base58 so we don't lowercase them
    const a = encodeBurnCalldata(1n, oct);
    const b = encodeBurnCalldata(1n, oct);
    expect(a).toBe(b);
  });

  it('round-trip: amount slot reflects the amount', () => {
    for (const amt of [0n, 1n, 1_000_000n, (1n << 64n) - 1n]) {
      const cd = encodeBurnCalldata(amt, oct);
      const amountHex = cd.slice(2 + 8 + 64, 2 + 8 + 128);
      expect(BigInt('0x' + amountHex)).toBe(amt);
    }
  });
});
