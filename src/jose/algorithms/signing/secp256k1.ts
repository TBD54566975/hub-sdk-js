import type { PrivateJwk, PublicJwk, Signer } from '../../types.js';

import * as secp256k1 from '@noble/secp256k1';
import secp256k1Derivation from 'secp256k1';

import { Encoder } from '../../../utils/encoder.js';
import { sha256 } from 'multiformats/hashes/sha2';
import { DwnError, DwnErrorCode } from '../../../core/dwn-error.js';

export class Secp256k1 {
  public static validateKey(jwk: PrivateJwk | PublicJwk): void {
    if (jwk.kty !== 'EC' || jwk.crv !== 'secp256k1') {
      throw new Error('invalid jwk. kty MUST be EC. crv MUST be secp256k1');
    }
  }

  public static async publicKeyToJwk(publicKeyBytes: Uint8Array): Promise<PublicJwk> {
  // ensure public key is in uncompressed format so we can convert it into both x and y value
    let uncompressedPublicKeyBytes;
    if (publicKeyBytes.byteLength === 33) {
    // this means given key is compressed
      const publicKeyHex = secp256k1.utils.bytesToHex(publicKeyBytes);
      const curvePoints = secp256k1.Point.fromHex(publicKeyHex);
      uncompressedPublicKeyBytes = curvePoints.toRawBytes(false); // isCompressed = false
    } else {
      uncompressedPublicKeyBytes = publicKeyBytes;
    }

    // the first byte is a header that indicates whether the key is uncompressed (0x04 if uncompressed), we can safely ignore
    // bytes 1 - 32 represent X
    // bytes 33 - 64 represent Y

    // skip the first byte because it's used as a header to indicate whether the key is uncompressed
    const x = Encoder.bytesToBase64Url(uncompressedPublicKeyBytes.subarray(1, 33));
    const y = Encoder.bytesToBase64Url(uncompressedPublicKeyBytes.subarray(33, 65));

    const publicJwk: PublicJwk = {
      alg : 'ES256K',
      kty : 'EC',
      crv : 'secp256k1',
      x,
      y
    };

    return publicJwk;
  }

  public static async sign(content: Uint8Array, privateJwk: PrivateJwk): Promise<Uint8Array> {
    Secp256k1.validateKey(privateJwk);

    // the underlying lib expects us to hash the content ourselves:
    // https://github.com/paulmillr/noble-secp256k1/blob/97aa518b9c12563544ea87eba471b32ecf179916/index.ts#L1160
    const hashedContent = await sha256.encode(content);
    const privateKeyBytes = Encoder.base64UrlToBytes(privateJwk.d);

    return await secp256k1.sign(hashedContent, privateKeyBytes, { der: false });
  }


  public static async verify(content: Uint8Array, signature: Uint8Array, publicJwk: PublicJwk): Promise<boolean> {
    Secp256k1.validateKey(publicJwk);

    const xBytes = Encoder.base64UrlToBytes(publicJwk.x);
    const yBytes = publicJwk.y ? Encoder.base64UrlToBytes(publicJwk.y) : new Uint8Array([]);

    const publicKeyBytes = new Uint8Array(xBytes.length + yBytes.length + 1);

    // create an uncompressed public key using the x and y values from the provided JWK.
    // a leading byte of 0x04 indicates that the public key is uncompressed
    // (e.g. x and y values are both present)
    publicKeyBytes.set([0x04], 0);
    publicKeyBytes.set(xBytes, 1);
    publicKeyBytes.set(yBytes, xBytes.length + 1);

    const hashedContent = await sha256.encode(content);

    return secp256k1.verify(signature, hashedContent, publicKeyBytes);
  }

  public static async generateKeyPair(): Promise<{publicJwk: PublicJwk, privateJwk: PrivateJwk}> {
    const privateKeyBytes = secp256k1.utils.randomPrivateKey();
    const publicKeyBytes = await secp256k1.getPublicKey(privateKeyBytes);

    const d = Encoder.bytesToBase64Url(privateKeyBytes);
    const publicJwk: PublicJwk = await Secp256k1.publicKeyToJwk(publicKeyBytes);
    const privateJwk: PrivateJwk = { ...publicJwk, d };

    return { publicJwk, privateJwk };
  }

  /**
   * Generates key pair in raw bytes, where the `publicKey` is uncompressed.
   */
  public static async generateKeyPairRaw(): Promise<{publicKey: Uint8Array, privateKey: Uint8Array}> {
    const privateKey = secp256k1.utils.randomPrivateKey();
    const publicKey = await secp256k1.getPublicKey(privateKey);

    return { publicKey, privateKey };
  }

  /**
   * Gets the uncompressed public key of the given private key.
   */
  public static async getPublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
    const compressedPublicKey = false;
    const publicKey = await secp256k1.getPublicKey(privateKey, compressedPublicKey);
    return publicKey;
  }

  /**
   * Derives a hierarchical deterministic public key.
   * @param key Either a private or an uncompressed public key used to derive the descendant public key.
   * @param relativePath `/` delimited path relative to the key given. e.g. 'a/b/c'
   * @returns uncompressed public key
   */
  public static async derivePublicKey(key: Uint8Array, relativePath: string): Promise<Uint8Array> {
    const pathSegments = Secp256k1.parseAndValidateKeyDerivationPath(relativePath);

    let currentPublicKey: Uint8Array;
    if (key.length === 32) {
      // private key is always 32 bytes
      currentPublicKey = secp256k1.getPublicKey(key);
    } else {
      currentPublicKey = key;
    }

    for (const segment of pathSegments) {
      const hash = await sha256.encode(Encoder.stringToBytes(segment));
      currentPublicKey = Secp256k1.deriveChildPublicKey(currentPublicKey, hash);
    }

    return currentPublicKey;
  }

  /**
     * Derives a hierarchical deterministic private key.
     * @param relativePath `/` delimited path relative to the key given. e.g. 'a/b/c'
     */
  public static async derivePrivateKey(privateKey: Uint8Array, relativePath: string): Promise<Uint8Array> {
    const pathSegments = Secp256k1.parseAndValidateKeyDerivationPath(relativePath);

    let currentPrivateKey = privateKey;
    for (const segment of pathSegments) {
      const hash = await sha256.encode(Encoder.stringToBytes(segment));
      currentPrivateKey = Secp256k1.deriveChildPrivateKey(currentPrivateKey, hash);
    }

    return currentPrivateKey;
  }

  /**
     * Derives a child public key using the given tweak input.
     */
  public static deriveChildPublicKey(uncompressedPublicKey: Uint8Array, tweakInput: Uint8Array): Uint8Array {
    const compressedPublicKey = false;
    const derivedPublicKey = secp256k1Derivation.publicKeyTweakAdd(uncompressedPublicKey, tweakInput, compressedPublicKey);
    return derivedPublicKey;
  }

  /**
     * Derives a child private key using the given tweak input.
     */
  public static deriveChildPrivateKey(privateKey: Uint8Array, tweakInput: Uint8Array): Uint8Array {
    // NOTE: passing in private key to v5.0.0 of `secp256k1.privateKeyTweakAdd()` has the side effect of morphing the input private key bytes
    // before there is a fix for it (we can also investigate and submit a PR), we clone the private key to workaround
    // `secp256k1.publicKeyTweakAdd()` does not have this side effect
    const privateKeyClone = new Uint8Array(privateKey.length);
    privateKeyClone.set(privateKey);

    const derivedPrivateKey = secp256k1Derivation.privateKeyTweakAdd(privateKeyClone, tweakInput);
    return derivedPrivateKey;
  }

  /**
     * Parses the given key derivation path.
     * @returns Path segments if successfully validate the derivation path.
     * @throws {DwnError} with `DwnErrorCode.HdKeyDerivationPathInvalid` if derivation path fails validation.
     */
  private static parseAndValidateKeyDerivationPath(derivationPath: string): string[] {
    const pathSegments = derivationPath.split('/');

    if (pathSegments.length === 0 || pathSegments.includes('')) {
      throw new DwnError(DwnErrorCode.HdKeyDerivationPathInvalid, `Invalid key derivation path: ${derivationPath}`);
    }

    return pathSegments;
  }
}

export const secp256k1Signer: Signer = {
  sign            : Secp256k1.sign,
  verify          : Secp256k1.verify,
  generateKeyPair : Secp256k1.generateKeyPair,
  publicKeyToJwk  : Secp256k1.publicKeyToJwk
};