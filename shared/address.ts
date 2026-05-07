// Octra address validation. Format: "oct" + base58(sha256(pubkey)) padded to
// 47 chars total. Used by both projects to validate user-entered recipients.

export function isValidOctraAddress(addr: string): boolean {
  return typeof addr === 'string' && addr.length === 47 && addr.startsWith('oct');
}

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isValidEthAddress(addr: string): boolean {
  return typeof addr === 'string' && ETH_ADDRESS_RE.test(addr);
}
