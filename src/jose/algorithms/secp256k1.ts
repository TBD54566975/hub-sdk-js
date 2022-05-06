import * as secp256k1 from '@noble/secp256k1';
import base64url from 'base64url';

export const jwkPublicJsonSchema = {
  type       : 'object',
  properties : {
    kty : { const: 'EC' },
    crv : { const: 'secp256k1' },
    x   : { type: 'string' },
    y   : { type: 'string' }
  },
  required             : ['kty', 'crv', 'x', 'y'],
  additionalProperties : false,
};

export const jwkPrivateJsonSchema = {
  type       : 'object',
  properties : {
    kty : { const: 'EC' },
    crv : { const: 'secp256k1' },
    x   : { type: 'string' },
    y   : { type: 'string' },
    d   : { type: 'string' },
  },
  required             : ['kty', 'crv', 'x', 'y', 'd'],
  additionalProperties : false,
};

/**
 * A SECP256K1 public key in JWK format.
 * Values taken from:
 * https://www.iana.org/assignments/jose/jose.xhtml#web-key-elliptic-curve
 * https://datatracker.ietf.org/doc/html/draft-ietf-cose-webauthn-algorithms-06#section-3.1
 */
export type JwkSecp256k1Public = {
  kty: 'EC';
  crv: 'secp256k1';
  x: string;
  y: string;
};

/**
 * A SECP256K1 private key in JWK format.
 */
export type JwkSecp256k1Private = JwkSecp256k1Public & {
  d: string; // Only used by a private key.
};

/**
 * Implementation of signing using SECP256K1.
 */
export async function sign (
  signingInputBuffer: Buffer,
  privateKeyJwk: JwkSecp256k1Private
): Promise<Buffer> {
  const privateKeyBuffer = base64url.toBuffer(privateKeyJwk.d);
  const signatureUint8Array = await secp256k1.sign(signingInputBuffer, privateKeyBuffer);
  const signatureBuffer = Buffer.from(signatureUint8Array);
  return signatureBuffer;
}

/**
 * Implementation of signature verification using SECP256K1.
 */
export async function verify (
  signatureInputBuffer: Buffer,
  signatureBuffer: Buffer,
  publicKeyJwk: JwkSecp256k1Public
): Promise<boolean> {
  const identifierByte = Buffer.from([0x04]);
  const xBuffer = base64url.toBuffer(publicKeyJwk.x);
  const yBuffer = base64url.toBuffer(publicKeyJwk.y);
  const publicKeyBuffer = Buffer.concat([identifierByte, xBuffer, yBuffer]);
  const result = await secp256k1.verify(signatureBuffer, signatureInputBuffer, publicKeyBuffer);
  return result;
}