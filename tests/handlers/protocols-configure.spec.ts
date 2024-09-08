import type { DidResolver } from '@web5/dids';
import type { EventStream } from '../../src/types/subscriptions.js';
import type { GenerateProtocolsConfigureOutput } from '../utils/test-data-generator.js';
import type {
  DataStore,
  EventLog,
  MessageStore,
  ProtocolDefinition,
  ProtocolsConfigureDescriptor,
  ResumableTaskStore,
} from '../../src/index.js';

import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import chai, { expect } from 'chai';

import dexProtocolDefinition from '../vectors/protocol-definitions/dex.json' assert { type: 'json' };
import minimalProtocolDefinition from '../vectors/protocol-definitions/minimal.json' assert { type: 'json' };

import { GeneralJwsBuilder } from '../../src/jose/jws/general/builder.js';
import { lexicographicalCompare } from '../../src/utils/string.js';
import { Message } from '../../src/core/message.js';
import { ProtocolAction } from '../../src/types/protocols-types.js';
import { TestDataGenerator } from '../utils/test-data-generator.js';
import { TestEventStream } from '../test-event-stream.js';
import { TestStores } from '../test-stores.js';
import { TestStubGenerator } from '../utils/test-stub-generator.js';
import { Time } from '../../src/utils/time.js';

import { DataStream, Dwn, DwnErrorCode, DwnInterfaceName, DwnMethodName, Encoder, Jws, PermissionGrant, PermissionsProtocol } from '../../src/index.js';
import { DidKey, UniversalResolver } from '@web5/dids';

chai.use(chaiAsPromised);

export function testProtocolsConfigureHandler(): void {
  describe('ProtocolsConfigureHandler.handle()', () => {
    let didResolver: DidResolver;
    let messageStore: MessageStore;
    let dataStore: DataStore;
    let resumableTaskStore: ResumableTaskStore;
    let eventLog: EventLog;
    let eventStream: EventStream;
    let dwn: Dwn;

    describe('functional tests', () => {

      // important to follow the `before` and `after` pattern to initialize and clean the stores in tests
      // so that different test suites can reuse the same backend store for testing
      before(async () => {
        didResolver = new UniversalResolver({ didResolvers: [DidKey] });

        const stores = TestStores.get();
        messageStore = stores.messageStore;
        dataStore = stores.dataStore;
        resumableTaskStore = stores.resumableTaskStore;
        eventLog = stores.eventLog;
        eventStream = TestEventStream.get();

        dwn = await Dwn.create({ didResolver, messageStore, dataStore, eventLog, eventStream, resumableTaskStore });
      });

      beforeEach(async () => {
        sinon.restore(); // wipe all previous stubs/spies/mocks/fakes

        // clean up before each test rather than after so that a test does not depend on other tests to do the clean up
        await messageStore.clear();
        await dataStore.clear();
        await resumableTaskStore.clear();
        await eventLog.clear();
      });

      after(async () => {
        await dwn.close();
      });

      it('should allow a protocol definition with schema or dataFormat omitted', async () => {
        const alice = await TestDataGenerator.generateDidKeyPersona();

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
        const signer1 = Jws.createSigner(author);
        const signer2 = Jws.createSigner(extraRandomPersona);

        const signaturePayloadBytes = Encoder.objectToBytes(protocolsConfigure.signaturePayload!);

        const jwsBuilder = await GeneralJwsBuilder.create(signaturePayloadBytes, [signer1, signer2]);
        message.authorization = { signature: jwsBuilder.getJws() };

        TestStubGenerator.stubDidResolver(didResolver, [author]);

        const reply = await dwn.processMessage(tenant, message);

        expect(reply.status.code).to.equal(400);
        expect(reply.status.detail).to.contain('expected no more than 1 signature');
      });

      it('should return 401 if auth fails', async () => {
        const alice = await TestDataGenerator.generateDidKeyPersona();
        const { message } = await TestDataGenerator.generateProtocolsConfigure({ author: alice });

        // use a bad signature to fail authentication
        const badSignature = await TestDataGenerator.randomSignatureString();
        message.authorization.signature.signatures[0].signature = badSignature;

        const reply = await dwn.processMessage(alice.did, message);
        expect(reply.status.code).to.equal(401);
        expect(reply.status.detail).to.contain(DwnErrorCode.GeneralJwsVerifierInvalidSignature);
      });

      it('should be able to overwrite existing protocol if timestamp is newer', async () => {
        const alice = await TestDataGenerator.generateDidKeyPersona();

        const protocolDefinition = minimalProtocolDefinition;

        const oldProtocolsConfigure = await TestDataGenerator.generateProtocolsConfigure({
          author: alice,
          protocolDefinition,
        });
        await Time.minimalSleep();
        const middleProtocolsConfigure = await TestDataGenerator.generateProtocolsConfigure({
          author: alice,
          protocolDefinition,
        });

        // first ProtocolsConfigure
        const reply1 = await dwn.processMessage(alice.did, middleProtocolsConfigure.message);
        expect(reply1.status.code).to.equal(202);

        // older messages will not overwrite the existing
        const reply2 = await dwn.processMessage(alice.did, oldProtocolsConfigure.message);
        expect(reply2.status.code).to.equal(409);

        // newer message can overwrite the existing message
        const newProtocolsConfigure = await TestDataGenerator.generateProtocolsConfigure({
          author: alice,
          protocolDefinition,
        });
        const reply3 = await dwn.processMessage(alice.did, newProtocolsConfigure.message);
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
        const alice = await TestDataGenerator.generateDidKeyPersona();

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
          messageTimestamp   : messageData1.message.descriptor.messageTimestamp
        });
        const messageData3 = await TestDataGenerator.generateProtocolsConfigure({
          author             : alice,
          protocolDefinition : protocolDefinition3,
          messageTimestamp   : messageData1.message.descriptor.messageTimestamp
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
        const reply1 = await dwn.processMessage(alice.did, middleProtocolsConfigure.message);
        expect(reply1.status.code).to.equal(202);

        // test that the protocol with the smallest lexicographic value cannot be written
        const reply2 = await dwn.processMessage(alice.did, lowestProtocolsConfigure.message);
        expect(reply2.status.code).to.equal(409);

        // test that the protocol with the largest lexicographic value can be written
        const reply3 = await dwn.processMessage(alice.did, highestProtocolsConfigure.message);
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
        const alice = await TestDataGenerator.generateDidKeyPersona();

        // query for non-normalized protocol
        const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
          author             : alice,
          protocolDefinition : minimalProtocolDefinition
        });

        // overwrite protocol because #create auto-normalizes protocol
        protocolsConfig.message.descriptor.definition.protocol = 'example.com/';

        // Re-create auth because we altered the descriptor after signing
        protocolsConfig.message.authorization = await Message.createAuthorization({
          descriptor : protocolsConfig.message.descriptor,
          signer     : Jws.createSigner(alice)
        });

        // Send records write message
        const reply = await dwn.processMessage(alice.did, protocolsConfig.message);
        expect(reply.status.code).to.equal(400);
        expect(reply.status.detail).to.contain(DwnErrorCode.UrlProtocolNotNormalized);
      });

      it('should return 400 if schema is not normalized', async () => {
        const alice = await TestDataGenerator.generateDidKeyPersona();

        const protocolDefinition = dexProtocolDefinition;
        const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
          author: alice,
          protocolDefinition,
        });

        // overwrite schema because #create auto-normalizes schema
        protocolsConfig.message.descriptor.definition.types.ask.schema = 'ask';

        // Re-create auth because we altered the descriptor after signing
        protocolsConfig.message.authorization = await Message.createAuthorization({
          descriptor : protocolsConfig.message.descriptor,
          signer     : Jws.createSigner(alice)
        });

        // Send records write message
        const reply = await dwn.processMessage(alice.did, protocolsConfig.message);
        expect(reply.status.code).to.equal(400);
        expect(reply.status.detail).to.contain(DwnErrorCode.UrlSchemaNotNormalized);
      });

      it('rejects non-tenant non-granted ProtocolsConfigures with 401', async () => {
        // Bob tries to ProtocolsConfigure to Alice's DWN without a permission grant
        const alice = await TestDataGenerator.generateDidKeyPersona();
        const bob = await TestDataGenerator.generateDidKeyPersona();

        const protocolDefinition = dexProtocolDefinition;
        const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
          author: bob,
          protocolDefinition,
        });
        const protocolsConfigureReply = await dwn.processMessage(alice.did, protocolsConfig.message);
        expect(protocolsConfigureReply.status.code).to.equal(401);
        expect(protocolsConfigureReply.status.detail).to.contain(DwnErrorCode.ProtocolsConfigureAuthorizationFailed);
      });

      it('should reject ProtocolsConfigure with action rule containing duplicated actor (`who` or `who` + `of` combination) within a rule set', async () => {
        const alice = await TestDataGenerator.generateDidKeyPersona();

        const protocolDefinition: ProtocolDefinition = {
          protocol  : 'http://foo-bar',
          published : true,
          types     : {
            foo: {},
          },
          structure: {
            foo: {
              $actions: [
                {
                  who : 'anyone',
                  can : [ProtocolAction.Create]
                },
                // duplicated `who` value
                {
                  who : 'anyone',
                  can : [ProtocolAction.Update]
                }
              ]
            }
          }
        };

        // manually craft the invalid ProtocolsConfigure message because our library will not let you create an invalid definition
        const descriptor: ProtocolsConfigureDescriptor = {
          interface        : DwnInterfaceName.Protocols,
          method           : DwnMethodName.Configure,
          messageTimestamp : Time.getCurrentTimestamp(),
          definition       : protocolDefinition
        };

        const authorization = await Message.createAuthorization({
          descriptor,
          signer: Jws.createSigner(alice)
        });
        const protocolsConfigureMessage = { descriptor, authorization };

        const protocolsConfigureReply = await dwn.processMessage(alice.did, protocolsConfigureMessage);
        expect(protocolsConfigureReply.status.code).to.equal(400);
        expect(protocolsConfigureReply.status.detail).to.contain(DwnErrorCode.ProtocolsConfigureDuplicateActorInRuleSet);


        // similar test as above but with `of` property
        const protocolDefinition2: ProtocolDefinition = {
          protocol  : 'http://foo-bar',
          published : true,
          types     : {
            foo : {},
            bar : {},
          },
          structure: {
            foo: {
              bar: {
                $actions: [
                  {
                    who : 'recipient',
                    of  : 'foo',
                    can : [ProtocolAction.Create]
                  },
                  // duplicated `who` value
                  {
                    who : 'recipient',
                    of  : 'foo',
                    can : [ProtocolAction.Update]
                  }
                ]
              }
            }
          }
        };

        const descriptor2: ProtocolsConfigureDescriptor = {
          interface        : DwnInterfaceName.Protocols,
          method           : DwnMethodName.Configure,
          messageTimestamp : Time.getCurrentTimestamp(),
          definition       : protocolDefinition2
        };

        const authorization2 = await Message.createAuthorization({
          descriptor : descriptor2,
          signer     : Jws.createSigner(alice)
        });
        const protocolsConfigureMessage2 = { descriptor: descriptor2, authorization: authorization2 };

        const protocolsConfigure2Reply = await dwn.processMessage(alice.did, protocolsConfigureMessage2);
        expect(protocolsConfigure2Reply.status.code).to.equal(400);
        expect(protocolsConfigure2Reply.status.detail).to.contain(DwnErrorCode.ProtocolsConfigureDuplicateActorInRuleSet);
      });

      it('should reject ProtocolsConfigure with action rule containing duplicated role within a rule set', async () => {
        const alice = await TestDataGenerator.generateDidKeyPersona();

        const protocolDefinition: ProtocolDefinition = {
          protocol  : 'http://foo',
          published : true,
          types     : {
            user : {},
            foo  : {},
          },
          structure: {
            user: {
              $role: true
            },
            foo: {
              $actions: [
                {
                  role : 'user',
                  can  : [ProtocolAction.Create]
                },
                // duplicated `role` value
                {
                  role : 'user',
                  can  : [ProtocolAction.Update]
                }
              ]
            }
          }
        };

        // manually craft the invalid ProtocolsConfigure message because our library will not let you create an invalid definition
        const descriptor: ProtocolsConfigureDescriptor = {
          interface        : DwnInterfaceName.Protocols,
          method           : DwnMethodName.Configure,
          messageTimestamp : Time.getCurrentTimestamp(),
          definition       : protocolDefinition
        };

        const authorization = await Message.createAuthorization({
          descriptor,
          signer: Jws.createSigner(alice)
        });
        const protocolsConfigureMessage = { descriptor, authorization };

        const protocolsConfigureReply = await dwn.processMessage(alice.did, protocolsConfigureMessage);
        expect(protocolsConfigureReply.status.code).to.equal(400);
        expect(protocolsConfigureReply.status.detail).to.contain(DwnErrorCode.ProtocolsConfigureDuplicateRoleInRuleSet);
      });

      describe('Grant authorization', () => {
        it('allows an external party to ProtocolsConfigure only if they have a valid grant', async () => {
          // scenario:
          // 1. Alice grants Bob the access to ProtocolsConfigure on her DWN
          // 2. Verify Bob can perform a ProtocolsConfigure
          // 3. Verify that Mallory cannot to use Bob's permission grant to gain access to Alice's DWN
          // 4. Alice revokes Bob's grant
          // 5. Verify Bob cannot perform ProtocolsConfigure with the revoked grant
          const alice = await TestDataGenerator.generateDidKeyPersona();
          const bob = await TestDataGenerator.generateDidKeyPersona();
          const mallory = await TestDataGenerator.generateDidKeyPersona();

          // 1. Alice grants Bob the access to ProtocolsConfigure on her DWN
          const permissionGrant = await PermissionsProtocol.createGrant({
            signer      : Jws.createSigner(alice),
            grantedTo   : bob.did,
            dateExpires : Time.createOffsetTimestamp({ seconds: 60 * 60 * 24 }),
            scope       : { interface: DwnInterfaceName.Protocols, method: DwnMethodName.Configure }
          });
          const dataStream = DataStream.fromBytes(permissionGrant.permissionGrantBytes);

          const grantRecordsWriteReply = await dwn.processMessage(alice.did, permissionGrant.recordsWrite.message, { dataStream });
          expect(grantRecordsWriteReply.status.code).to.equal(202);

          // 2. Verify Bob can perform a ProtocolsConfigure
          const permissionGrantId = permissionGrant.recordsWrite.message.recordId;
          const protocolsConfigure = await TestDataGenerator.generateProtocolsConfigure({
            permissionGrantId,
            author             : bob,
            protocolDefinition : minimalProtocolDefinition
          });
          const protocolsConfigureReply = await dwn.processMessage(alice.did, protocolsConfigure.message);
          expect(protocolsConfigureReply.status.code).to.equal(202);

          // 3. Verify that Mallory cannot to use Bob's permission grant to gain access to Alice's DWN
          const malloryProtocolsQuery = await TestDataGenerator.generateProtocolsConfigure({
            permissionGrantId,
            author             : mallory,
            protocolDefinition : minimalProtocolDefinition
          });
          const malloryProtocolsQueryReply = await dwn.processMessage(alice.did, malloryProtocolsQuery.message);
          expect(malloryProtocolsQueryReply.status.code).to.equal(401);
          expect(malloryProtocolsQueryReply.status.detail).to.contain(DwnErrorCode.GrantAuthorizationNotGrantedToAuthor);

          // 4. Alice revokes Bob's grant
          const revokeWrite = await PermissionsProtocol.createRevocation({
            signer      : Jws.createSigner(alice),
            grant       : await PermissionGrant.parse(permissionGrant.dataEncodedMessage),
            dateRevoked : Time.getCurrentTimestamp()
          });

          const revokeWriteReply = await dwn.processMessage(
            alice.did,
            revokeWrite.recordsWrite.message,
            { dataStream: DataStream.fromBytes(revokeWrite.permissionRevocationBytes) }
          );
          expect(revokeWriteReply.status.code).to.equal(202);

          // 5. Verify Bob cannot perform ProtocolsQuery with the revoked grant
          const unauthorizedProtocolsConfigure = await TestDataGenerator.generateProtocolsConfigure({
            permissionGrantId,
            author             : bob,
            protocolDefinition : {
              ...minimalProtocolDefinition,
              protocol: 'https://example.com/protocol/another-protocol'
            }
          });
          const unauthorizedProtocolsConfigureReply = await dwn.processMessage(alice.did, unauthorizedProtocolsConfigure.message);
          expect(unauthorizedProtocolsConfigureReply.status.code).to.equal(401);
          expect(unauthorizedProtocolsConfigureReply.status.detail).to.contain(DwnErrorCode.GrantAuthorizationGrantRevoked);
        });

        it('should allow to scope a ProtocolsConfigure to a specific protocol', async () => {
          const alice = await TestDataGenerator.generateDidKeyPersona();
          const bob = await TestDataGenerator.generateDidKeyPersona();

          // Alice grants Bob the access to ProtocolsConfigure on her DWN for a specific protocol
          const permissionGrant = await PermissionsProtocol.createGrant({
            signer      : Jws.createSigner(alice),
            grantedTo   : bob.did,
            dateExpires : Time.createOffsetTimestamp({ seconds: 60 * 60 * 24 }),
            scope       : { interface: DwnInterfaceName.Protocols, method: DwnMethodName.Configure, protocol: 'https://example.com/protocol/allowed' }
          });

          const dataStream = DataStream.fromBytes(permissionGrant.permissionGrantBytes);
          const grantRecordsWriteReply = await dwn.processMessage(alice.did, permissionGrant.recordsWrite.message, { dataStream });
          expect(grantRecordsWriteReply.status.code).to.equal(202);

          // Bob tries to ProtocolsConfigure to Alice's DWN for the allowed protocol
          const protocolConfigureAllowed = await TestDataGenerator.generateProtocolsConfigure({
            author             : bob,
            protocolDefinition : {
              ...minimalProtocolDefinition,
              protocol: 'https://example.com/protocol/allowed'
            },
            permissionGrantId: permissionGrant.recordsWrite.message.recordId
          });

          const protocolConfigureAllowedReply = await dwn.processMessage(alice.did, protocolConfigureAllowed.message);
          expect(protocolConfigureAllowedReply.status.code).to.equal(202);

          // Bob tries to ProtocolsConfigure to Alice's DWN for a different protocol
          const protocolConfigureNotAllowed = await TestDataGenerator.generateProtocolsConfigure({
            author             : bob,
            protocolDefinition : {
              ...minimalProtocolDefinition,
              protocol: 'https://example.com/protocol/not-allowed'
            },
            permissionGrantId: permissionGrant.recordsWrite.message.recordId
          });

          const protocolConfigureNotAllowedReply = await dwn.processMessage(alice.did, protocolConfigureNotAllowed.message);
          expect(protocolConfigureNotAllowedReply.status.code).to.equal(401);
        });
      });

      describe('event log', () => {
        it('should add event for ProtocolsConfigure', async () => {
          const alice = await TestDataGenerator.generateDidKeyPersona();
          const { message } = await TestDataGenerator.generateProtocolsConfigure({ author: alice });

          const reply = await dwn.processMessage(alice.did, message);
          expect(reply.status.code).to.equal(202);

          const { events } = await eventLog.getEvents(alice.did);
          expect(events.length).to.equal(1);

          const messageCid = await Message.getCid(message);
          expect(events[0]).to.equal(messageCid);
        });

        it('should delete older ProtocolsConfigure events when one is overwritten', async () => {
          const alice = await TestDataGenerator.generateDidKeyPersona();
          const oldestWrite = await TestDataGenerator.generateProtocolsConfigure({ author: alice, protocolDefinition: minimalProtocolDefinition });
          await Time.minimalSleep();
          const newestWrite = await TestDataGenerator.generateProtocolsConfigure({ author: alice, protocolDefinition: minimalProtocolDefinition });

          let reply = await dwn.processMessage(alice.did, oldestWrite.message);
          expect(reply.status.code).to.equal(202);

          reply = await dwn.processMessage(alice.did, newestWrite.message);
          expect(reply.status.code).to.equal(202);

          const { events } = await eventLog.getEvents(alice.did);
          expect(events.length).to.equal(1);

          const newestMessageCid = await Message.getCid(newestWrite.message);
          expect(events[0]).to.equal(newestMessageCid);
        });
      });
    });
  });
}