import chaiAsPromised from 'chai-as-promised';
import chai, { expect } from 'chai';

import { getCurrentTimeInHighPrecision } from '../../src/utils/time.js';
import { RecordsRead } from '../../src/interfaces/records-read.js';
import { TestDataGenerator } from '../utils/test-data-generator.js';
import { DwnErrorCode, Jws } from '../../src/index.js';

chai.use(chaiAsPromised);

describe('RecordsRead', () => {
  describe('create()', () => {
    it('should use `messageTimestamp` as is if given', async () => {
      const alice = await TestDataGenerator.generatePersona();

      const currentTime = getCurrentTimeInHighPrecision();
      const recordsRead = await RecordsRead.create({
        recordId                    : 'anything',
        authorizationSignatureInput : Jws.createSignatureInput(alice),
        date                        : currentTime
      });

      expect(recordsRead.message.descriptor.messageTimestamp).to.equal(currentTime);
    });

    it('should reject if `recordId`, `protocol` and `protocolPath` are all missing', async () => {
      const alice = await TestDataGenerator.generatePersona();
      const readPromise = RecordsRead.create({
        authorizationSignatureInput: Jws.createSignatureInput(alice),
      });

      await expect(readPromise).to.be.rejectedWith(DwnErrorCode.RecordsReadMissingCreateProperties);
    });

    it('should reject if all three `recordId`, `protocol` and `protocolPath` are passed', async () => {
      const alice = await TestDataGenerator.generatePersona();
      const readPromise = RecordsRead.create({
        recordId                    : 'some-id',
        protocol                    : 'protocol',
        protocolPath                : 'some/path',
        authorizationSignatureInput : Jws.createSignatureInput(alice),
      });

      await expect(readPromise).to.be.rejectedWith('/descriptor: must match exactly one schema in oneOf');
    });

    it('should not reject if only `recordId` is passed', async () => {
      const alice = await TestDataGenerator.generatePersona();
      const readSuccess = await RecordsRead.create({
        recordId                    : 'some-id',
        authorizationSignatureInput : Jws.createSignatureInput(alice),
      });

      expect(readSuccess.message.descriptor.recordId).to.equal('some-id');
    });

    it('should reject if only one of `protocol` or `protocolPath` are set', async () => {
      const alice = await TestDataGenerator.generatePersona();
      // with only protocolPath
      const protocolPathOnlyPromise = RecordsRead.create({
        protocolPath                : 'some/path',
        authorizationSignatureInput : Jws.createSignatureInput(alice),
      });

      await expect(protocolPathOnlyPromise).to.be.rejectedWith(DwnErrorCode.RecordsReadMissingCreateProperties);
      // with only protocolPath
      const protocolOnlyPromise = RecordsRead.create({
        protocol                    : 'protocol',
        authorizationSignatureInput : Jws.createSignatureInput(alice),
      });

      await expect(protocolOnlyPromise).to.be.rejectedWith(DwnErrorCode.RecordsReadMissingCreateProperties);

      const readSuccess = await RecordsRead.create({
        protocol                    : 'protocol',
        protocolPath                : 'some/path',
        authorizationSignatureInput : Jws.createSignatureInput(alice),
      });

      expect(readSuccess.message.descriptor.protocol).to.equal('protocol');
      expect(readSuccess.message.descriptor.protocolPath).to.equal('some/path');
    });
  });
});

