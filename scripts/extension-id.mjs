// Prints the Chrome extension id and the manifest `key` for a private key PEM.
// Usage: node scripts/extension-id.mjs [extension-key.pem]
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';

const pem = readFileSync(process.argv[2] ?? 'extension-key.pem');
const der = createPublicKey(createPrivateKey(pem)).export({ type: 'spki', format: 'der' });
const id = createHash('sha256')
  .update(der)
  .digest('hex')
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (c) => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16)));
console.log(`id:  ${id}`);
console.log(`key: ${der.toString('base64')}`);
