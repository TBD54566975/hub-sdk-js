import * as secp256k1 from '@noble/secp256k1';
import { Comparer } from './comparer.js';
import { DwnErrorCode } from '../../src/core/dwn-error.js';
import { expect } from 'chai';
import { HdKey } from '../../src/utils/hd-key.js';
import { TestDataGenerator } from './test-data-generator.js';

describe('HdKey', () => {
  describe('deriveChildPublic/PrivateKey()', () => {
    it('should derive the same key pair counterparts when given the same tweak input', async () => {
      const compressedPublicKey = false;
      const privateKey = secp256k1.utils.randomPrivateKey();
      const publicKey = await secp256k1.getPublicKey(privateKey, compressedPublicKey);

      const tweakInput = TestDataGenerator.randomBytes(32);
      const derivedPrivateKey = HdKey.deriveChildPrivateKey(privateKey, tweakInput);
      const derivedPublicKey = HdKey.deriveChildPublicKey(publicKey, tweakInput);

      const publicKeyFromDerivedPrivateKey = await secp256k1.getPublicKey(derivedPrivateKey, compressedPublicKey);

      expect(Comparer.byteArraysEqual(derivedPublicKey, publicKeyFromDerivedPrivateKey)).to.be.true;
    });
  });

  describe('derivePublic/PrivateKey()', () => {
    it('should be able to derive same key using different ancestor along the chain path', async () => {
      // FIX: refactor
      const compressedPublicKey = false;
      const privateKey = secp256k1.utils.randomPrivateKey();
      const publicKey = await secp256k1.getPublicKey(privateKey, compressedPublicKey);

      const fullPathToG = 'a/b/c/d/e/f/g';
      const fullPathToD = 'a/b/c/d';
      const relativePathFromDToG = 'e/f/g';

      // testing public key derivation from different ancestor in the same chain
      const publicKeyG = await HdKey.derivePublicKey(publicKey, fullPathToG);
      const publicKeyD = await HdKey.derivePublicKey(publicKey, fullPathToD);
      const publicKeyGFromD = await HdKey.derivePublicKey(publicKeyD, relativePathFromDToG);
      expect(Comparer.byteArraysEqual(publicKeyG, publicKeyGFromD)).to.be.true;

      // testing private key derivation from different ancestor in the same chain
      const privateKeyG = await HdKey.derivePrivateKey(privateKey, fullPathToG);
      const privateKeyD = await HdKey.derivePrivateKey(privateKey, fullPathToD);
      const privateKeyGFromD = await HdKey.derivePrivateKey(privateKeyD, relativePathFromDToG);
      expect(Comparer.byteArraysEqual(privateKeyG, privateKeyGFromD)).to.be.true;

      // testing that the derived private key matches up with the derived public key
      const publicKeyGFromPrivateKeyG = await secp256k1.getPublicKey(privateKeyG, compressedPublicKey);
      expect(Comparer.byteArraysEqual(publicKeyGFromPrivateKeyG, publicKeyG)).to.be.true;
    });

    it('should derive the same public key using either the private or public counterpart of the same key pair', async () => {
      // FIX: refactor
      const compressedPublicKey = false;
      const privateKey = secp256k1.utils.randomPrivateKey();
      const publicKey = await secp256k1.getPublicKey(privateKey, compressedPublicKey);

      const path = '1/2/3/4/5/6/7/8/9/10';

      const derivedKeyFromPublicKey = await HdKey.derivePublicKey(publicKey, path);
      const derivedKeyFromPrivateKey = await HdKey.derivePublicKey(privateKey, path);
      expect(Comparer.byteArraysEqual(derivedKeyFromPublicKey, derivedKeyFromPrivateKey)).to.be.true;
    });

    it('should derive the same public key using either the private or public counterpart of the same key pair', async () => {
      // FIX: refactor
      const compressedPublicKey = false;
      const privateKey = secp256k1.utils.randomPrivateKey();
      const publicKey = await secp256k1.getPublicKey(privateKey, compressedPublicKey);

      const invalidPath = '/pathCannotStartWithADelimiter';

      await expect(HdKey.derivePublicKey(publicKey, invalidPath)).to.be.rejectedWith(DwnErrorCode.HdKeyDerivationPathInvalid);
      await expect(HdKey.derivePrivateKey(privateKey, invalidPath)).to.be.rejectedWith(DwnErrorCode.HdKeyDerivationPathInvalid);
    });
  });
});