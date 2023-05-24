import type { GenerateProtocolsConfigureOutput } from '../../../utils/test-data-generator.js';

import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import chai, { expect } from 'chai';

import dexProtocolDefinition from '../../../vectors/protocol-definitions/dex.json' assert { type: 'json' };
import minimalProtocolDefinition from '../../../vectors/protocol-definitions/minimal.json' assert { type: 'json' };

import { DataStoreLevel } from '../../../../src/store/data-store-level.js';
import { DidKeyResolver } from '../../../../src/did/did-key-resolver.js';
import { EventLogLevel } from '../../../../src/event-log/event-log-level.js';
import { GeneralJwsSigner } from '../../../../src/jose/jws/general/signer.js';
import { lexicographicalCompare } from '../../../../src/utils/string.js';
import { Message } from '../../../../src/core/message.js';
import { MessageStoreLevel } from '../../../../src/store/message-store-level.js';
import { sleep } from '../../../../src/utils/time.js';
import { TestDataGenerator } from '../../../utils/test-data-generator.js';
import { TestStubGenerator } from '../../../utils/test-stub-generator.js';

import { DidResolver, Dwn, DwnErrorCode, Encoder, Jws } from '../../../../src/index.js';

chai.use(chaiAsPromised);

describe('ProtocolsConfigureHandler.handle()', () => {
  let didResolver: DidResolver;
  let messageStore: MessageStoreLevel;
  let dataStore: DataStoreLevel;
  let eventLog: EventLogLevel;
  let dwn: Dwn;

  describe('functional tests', () => {
    before(async () => {
      didResolver = new DidResolver([new DidKeyResolver()]);

      // important to follow this pattern to initialize and clean the message and data store in tests
      // so that different suites can reuse the same block store and index location for testing
      messageStore = new MessageStoreLevel({
        blockstoreLocation : 'TEST-MESSAGESTORE',
        indexLocation      : 'TEST-INDEX'
      });

      dataStore = new DataStoreLevel({
        blockstoreLocation: 'TEST-DATASTORE'
      });

      eventLog = new EventLogLevel({
        location: 'TEST-EVENTLOG'
      });

      dwn = await Dwn.create({ didResolver, messageStore, dataStore, eventLog });
    });

    beforeEach(async () => {
      sinon.restore(); // wipe all previous stubs/spies/mocks/fakes

      // clean up before each test rather than after so that a test does not depend on other tests to do the clean up
      await messageStore.clear();
      await dataStore.clear();
      await eventLog.clear();
    });

    after(async () => {
      await dwn.close();
    });

    it('should allow a protocol definition with schema or dataFormat omitted', async () => {
      const alice = await DidKeyResolver.generate();

      const protocolDefinition = minimalProtocolDefinition;
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author: alice,
        protocolDefinition,
      });

      const reply = await dwn.processMessage(alice.did, protocolsConfig.message);
      expect(reply.status.code).to.equal(202);
    });

    it('should return 400 if more than 1 signature is provided in `authorization`', async () => {
      const { author, message, protocolsConfigure } = await TestDataGenerator.generateProtocolsConfigure();
      const tenant = author.did;

      // intentionally create more than one signature, which is not allowed
      const extraRandomPersona = await TestDataGenerator.generatePersona();
      const signatureInput1 = Jws.createSignatureInput(author);
      const signatureInput2 = Jws.createSignatureInput(extraRandomPersona);

      const authorizationPayloadBytes = Encoder.objectToBytes(protocolsConfigure.authorizationPayload);

      const signer = await GeneralJwsSigner.create(authorizationPayloadBytes, [signatureInput1, signatureInput2]);
      message.authorization = signer.getJws();

      TestStubGenerator.stubDidResolver(didResolver, [author]);

      const reply = await dwn.processMessage(tenant, message);

      expect(reply.status.code).to.equal(400);
      expect(reply.status.detail).to.contain('expected no more than 1 signature');
    });

    it('should return 401 if auth fails', async () => {
      const alice = await DidKeyResolver.generate();
      alice.keyId = 'wrongValue'; // to fail authentication
      const { message } = await TestDataGenerator.generateProtocolsConfigure({ author: alice });

      const reply = await dwn.processMessage(alice.did, message);
      expect(reply.status.code).to.equal(401);
      expect(reply.status.detail).to.contain('not a valid DID');
    });

    it('should be able to overwrite existing protocol if timestamp is newer', async () => {
      const alice = await DidKeyResolver.generate();

      const protocolDefinition = minimalProtocolDefinition;

      const oldProtocolsConfigure = await TestDataGenerator.generateProtocolsConfigure({
        author: alice,
        protocolDefinition,
      });
      await sleep(1);
      const middleProtocolsConfigure = await TestDataGenerator.generateProtocolsConfigure({
        author: alice,
        protocolDefinition,
      });

      // first ProtocolsConfigure
      const reply1 = await dwn.processMessage(alice.did, middleProtocolsConfigure.message, middleProtocolsConfigure.dataStream);
      expect(reply1.status.code).to.equal(202);

      // older messages will not overwrite the existing
      const reply2 = await dwn.processMessage(alice.did, oldProtocolsConfigure.message, oldProtocolsConfigure.dataStream);
      expect(reply2.status.code).to.equal(409);

      // newer message can overwrite the existing message
      const newProtocolsConfigure = await TestDataGenerator.generateProtocolsConfigure({
        author: alice,
        protocolDefinition,
      });
      const reply3 = await dwn.processMessage(alice.did, newProtocolsConfigure.message, newProtocolsConfigure.dataStream);
      expect(reply3.status.code).to.equal(202);

      // only the newest protocol should remain
      const queryMessageData = await TestDataGenerator.generateProtocolsQuery({
        author : alice,
        filter : { protocol: protocolDefinition.protocol }
      });
      const queryReply = await dwn.processMessage(alice.did, queryMessageData.message);

      expect(queryReply.status.code).to.equal(200);
      expect(queryReply.entries?.length).to.equal(1);
    });

    it('should only be able to overwrite existing protocol if new protocol is lexicographically larger and timestamps are identical', async () => {
      const alice = await DidKeyResolver.generate();

      // Alter each protocol slightly to create lexicographic difference between them
      const protocolDefinition1 = {
        ...minimalProtocolDefinition,
        types: { ...minimalProtocolDefinition.types, foo1: { dataFormats: ['bar1'] } }
      };
      const protocolDefinition2 = {
        ...minimalProtocolDefinition,
        types: { ...minimalProtocolDefinition.types, foo2: { dataFormats: ['bar2'] } }
      };
      const protocolDefinition3 = {
        ...minimalProtocolDefinition,
        types: { ...minimalProtocolDefinition.types, foo3: { dataFormats: ['bar3'] } }
      };

      // Create three `ProtocolsConfigure` with identical timestamp
      const messageData1 = await TestDataGenerator.generateProtocolsConfigure({
        author             : alice,
        protocolDefinition : protocolDefinition1
      });
      const messageData2 = await TestDataGenerator.generateProtocolsConfigure({
        author             : alice,
        protocolDefinition : protocolDefinition2,
        dateCreated        : messageData1.message.descriptor.dateCreated
      });
      const messageData3 = await TestDataGenerator.generateProtocolsConfigure({
        author             : alice,
        protocolDefinition : protocolDefinition3,
        dateCreated        : messageData1.message.descriptor.dateCreated
      });

      const messageDataWithCid: (GenerateProtocolsConfigureOutput & { cid: string })[] = [];
      for (const messageData of [messageData1, messageData2, messageData3]) {
        const cid = await Message.getCid(messageData.message);
        messageDataWithCid.push({ cid, ...messageData });
      }

      // sort the message in lexicographic order
      const [
        lowestProtocolsConfigure,
        middleProtocolsConfigure,
        highestProtocolsConfigure
      ]: GenerateProtocolsConfigureOutput[]
        = messageDataWithCid.sort((messageDataA, messageDataB) => { return lexicographicalCompare(messageDataA.cid, messageDataB.cid); });

      // write the protocol with the middle lexicographic value
      const reply1 = await dwn.processMessage(alice.did, middleProtocolsConfigure.message, middleProtocolsConfigure.dataStream);
      expect(reply1.status.code).to.equal(202);

      // test that the protocol with the smallest lexicographic value cannot be written
      const reply2 = await dwn.processMessage(alice.did, lowestProtocolsConfigure.message, lowestProtocolsConfigure.dataStream);
      expect(reply2.status.code).to.equal(409);

      // test that the protocol with the largest lexicographic value can be written
      const reply3 = await dwn.processMessage(alice.did, highestProtocolsConfigure.message, highestProtocolsConfigure.dataStream);
      expect(reply3.status.code).to.equal(202);

      // test that lower lexicographic protocol message is removed from DB and only the newer protocol message remains
      const queryMessageData = await TestDataGenerator.generateProtocolsQuery({
        author : alice,
        filter : { protocol: protocolDefinition1.protocol }
      });
      const queryReply = await dwn.processMessage(alice.did, queryMessageData.message);

      expect(queryReply.status.code).to.equal(200);
      expect(queryReply.entries?.length).to.equal(1);
    });

    it('should return 400 if protocol is not normalized', async () => {
      const alice = await DidKeyResolver.generate();

      // query for non-normalized protocol
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author             : alice,
        protocolDefinition : minimalProtocolDefinition
      });

      // overwrite protocol because #create auto-normalizes protocol
      protocolsConfig.message.descriptor.definition.protocol = 'example.com/';

      // Re-create auth because we altered the descriptor after signing
      protocolsConfig.message.authorization = await Message.signAsAuthorization(
        protocolsConfig.message.descriptor,
        Jws.createSignatureInput(alice)
      );

      // Send records write message
      const reply = await dwn.processMessage(alice.did, protocolsConfig.message);
      expect(reply.status.code).to.equal(400);
      expect(reply.status.detail).to.contain(DwnErrorCode.UrlProtocolNotNormalized);
    });

    it('should return 400 if schema is not normalized', async () => {
      const alice = await DidKeyResolver.generate();

      const protocolDefinition = dexProtocolDefinition;
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author: alice,
        protocolDefinition,
      });

      // overwrite schema because #create auto-normalizes schema
      protocolsConfig.message.descriptor.definition.types.ask.schema = 'ask';

      // Re-create auth because we altered the descriptor after signing
      protocolsConfig.message.authorization = await Message.signAsAuthorization(
        protocolsConfig.message.descriptor,
        Jws.createSignatureInput(alice)
      );

      // Send records write message
      const reply = await dwn.processMessage(alice.did, protocolsConfig.message);
      expect(reply.status.code).to.equal(400);
      expect(reply.status.detail).to.contain(DwnErrorCode.UrlSchemaNotNormalized);
    });

    describe('event log', () => {
      it('should add event for ProtocolsConfigure', async () => {
        const alice = await DidKeyResolver.generate();
        const { message, dataStream } = await TestDataGenerator.generateProtocolsConfigure({ author: alice });

        const reply = await dwn.processMessage(alice.did, message, dataStream);
        expect(reply.status.code).to.equal(202);

        const events = await eventLog.getEvents(alice.did);
        expect(events.length).to.equal(1);

        const messageCid = await Message.getCid(message);
        expect(events[0].messageCid).to.equal(messageCid);
      });

      it('should delete older ProtocolsConfigure events when one is overwritten', async () => {
        const alice = await DidKeyResolver.generate();
        const oldestWrite = await TestDataGenerator.generateProtocolsConfigure({ author: alice, protocolDefinition: minimalProtocolDefinition });
        await sleep(1);
        const newestWrite = await TestDataGenerator.generateProtocolsConfigure({ author: alice, protocolDefinition: minimalProtocolDefinition });

        let reply = await dwn.processMessage(alice.did, oldestWrite.message, oldestWrite.dataStream);
        expect(reply.status.code).to.equal(202);

        reply = await dwn.processMessage(alice.did, newestWrite.message, newestWrite.dataStream);
        expect(reply.status.code).to.equal(202);

        const events = await eventLog.getEvents(alice.did);
        expect(events.length).to.equal(1);

        const newestMessageCid = await Message.getCid(newestWrite.message);
        expect(events[0].messageCid).to.equal(newestMessageCid);
      });
    });
  });
});
