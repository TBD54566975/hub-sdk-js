import chaiAsPromised from 'chai-as-promised';
import chai, { expect } from 'chai';

import type { ProtocolsQueryMessage } from '../../src/index.js';

import dexProtocolDefinition from '../vectors/protocol-definitions/dex.json' assert { type: 'json' };
import { Jws } from '../../src/index.js';
import { ProtocolsQuery } from '../../src/interfaces/protocols-query.js';
import { TestDataGenerator } from '../utils/test-data-generator.js';
import { Time } from '../../src/utils/time.js';

chai.use(chaiAsPromised);

describe('ProtocolsQuery', () => {
  describe('create()', () => {
    it('should use `messageTimestamp` as is if given', async () => {
      const alice = await TestDataGenerator.generatePersona();

      const currentTime = Time.getCurrentTimestamp();
      const protocolsQuery = await ProtocolsQuery.create({
        filter           : { protocol: 'anyValue' },
        messageTimestamp : currentTime,
        signer           : Jws.createSigner(alice),
      });

      expect(protocolsQuery.message.descriptor.messageTimestamp).to.equal(currentTime);
    });


    it('should auto-normalize protocol URI', async () => {
      const alice = await TestDataGenerator.generatePersona();

      const options = {
        recipient  : alice.did,
        data       : TestDataGenerator.randomBytes(10),
        dataFormat : 'application/json',
        signer     : Jws.createSigner(alice),
        filter     : { protocol: 'example.com/' },
        definition : dexProtocolDefinition
      };
      const protocolsConfig = await ProtocolsQuery.create(options);

      const message = protocolsConfig.message as ProtocolsQueryMessage;

      expect(message.descriptor.filter!.protocol).to.eq('http://example.com');
    });
  });
});

