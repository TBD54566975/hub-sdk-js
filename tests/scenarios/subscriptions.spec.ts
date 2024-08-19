import type { DidResolver } from '@web5/dids';
import type { MessageEvent } from '../../src/types/subscriptions.js';
import type { RecordEvent } from '../../src/types/records-types.js';
import type {
  DataStore,
  EventLog,
  EventStream,
  MessageStore,
  ResumableTaskStore,
} from '../../src/index.js';

import freeForAll from '../vectors/protocol-definitions/free-for-all.json' assert { type: 'json' };
import threadProtocol from '../vectors/protocol-definitions/thread-role.json' assert { type: 'json' };

import { Poller } from '../utils/poller.js';
import { TestDataGenerator } from '../utils/test-data-generator.js';
import { TestEventStream } from '../test-event-stream.js';
import { TestStores } from '../test-stores.js';
import { DataStream, Dwn, DwnInterfaceName, DwnMethodName, Jws, Message, PermissionGrant, PermissionsProtocol, Time } from '../../src/index.js';
import { DidKey, UniversalResolver } from '@web5/dids';

import { expect } from 'chai';

// NOTE: We use `Poller.pollUntilSuccessOrTimeout` to poll for the expected results.
// In some cases, the EventStream is a coordinated pub/sub system and the message events are emitted over the network
// this means that the messages are not processed immediately and we need to wait for the messages to be processed
// before we can assert the results. The `pollUntilSuccessOrTimeout` function is a utility function that will poll until the expected results are met.

// It is also important to note that in some cases where we are testing a negative case (the message not arriving at the subscriber)
// we add an alternate subscription to await results within to give the EventStream ample time to process the message.
// Additionally in some of these cases the order in which messages are sent to be processed or checked may matter, and they are noted as such.

export function testSubscriptionScenarios(): void {
  describe('subscriptions', () => {
    let didResolver: DidResolver;
    let messageStore: MessageStore;
    let dataStore: DataStore;
    let resumableTaskStore: ResumableTaskStore;
    let eventLog: EventLog;
    let eventStream: EventStream;
    let dwn: Dwn;
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
      // clean up before each test rather than after so that a test does not depend on other tests to do the clean up
      await messageStore.clear();
      await dataStore.clear();
      await resumableTaskStore.clear();
      await eventLog.clear();
    });

    after(async () => {
      await dwn.close();
    });

    describe('messages subscribe', () => {
      it('all messages', async () => {
        // Scenario: Alice subscribes to all messages and creates 3 messages. Alice then expects to receive all 3 messages.

        const alice = await TestDataGenerator.generateDidKeyPersona();

        // create a handler that adds the messageCid of each message to an array.
        const messageCids: string[] = [];
        const handler = async (event: MessageEvent): Promise<void> => {
          const { message } = event;
          const messageCid = await Message.getCid(message);
          messageCids.push(messageCid);
        };

        // subscribe to all messages
        const messagesSubscription = await TestDataGenerator.generateMessagesSubscribe({ author: alice });
        const messagesSubscriptionReply = await dwn.processMessage(alice.did, messagesSubscription.message, { subscriptionHandler: handler });
        expect(messagesSubscriptionReply.status.code).to.equal(200);
        expect(messagesSubscriptionReply.subscription?.id).to.equal(await Message.getCid(messagesSubscription.message));

        // generate various messages
        const write1 = await TestDataGenerator.generateRecordsWrite({ author: alice });
        const write1MessageCid = await Message.getCid(write1.message);
        const write1Reply = await dwn.processMessage(alice.did, write1.message, { dataStream: write1.dataStream });
        expect(write1Reply.status.code).to.equal(202);

        const protocol1 = await TestDataGenerator.generateProtocolsConfigure({ author: alice });
        const protocol1MessageCid = await Message.getCid(protocol1.message);
        const protocol1Reply = await dwn.processMessage(alice.did, protocol1.message);
        expect(protocol1Reply.status.code).to.equal(202);

        const deleteWrite1 = await TestDataGenerator.generateRecordsDelete({ author: alice, recordId: write1.message.recordId });
        const delete1MessageCid = await Message.getCid(deleteWrite1.message);
        const deleteWrite1Reply = await dwn.processMessage(alice.did, deleteWrite1.message);
        expect(deleteWrite1Reply.status.code).to.equal(202);

        // poll until the messages are received by the handler
        await Poller.pollUntilSuccessOrTimeout(async () => {
          expect(messageCids.length).to.equal(3);
          expect(messageCids).to.eql([ write1MessageCid, protocol1MessageCid, delete1MessageCid ]);
        });

        // clean up the subscription handler
        await messagesSubscriptionReply.subscription?.close();
      });

      it('filters by interface type', async () => {
        // scenario:
        // alice subscribes to 2 different message interfaces Records and Protocols
        // alice creates (2) messages, RecordsWrite and ProtocolsConfigure
        // alice checks that each handler received the appropriate message
        // alice deletes the record
        // alice checks that the Records handler received the delete message

        const alice = await TestDataGenerator.generateDidKeyPersona();

        // subscribe to the Records interface
        const recordsInterfaceSubscription = await TestDataGenerator.generateMessagesSubscribe({
          author  : alice,
          filters : [{ interface: DwnInterfaceName.Records }]
        });
        const recordsMessageCids:string[] = [];
        const recordsSubscribeHandler = async (event: MessageEvent):Promise<void> => {
          const { message } = event;
          const messageCid = await Message.getCid(message);
          recordsMessageCids.push(messageCid);
        };

        const recordsInterfaceSubscriptionReply = await dwn.processMessage(
          alice.did,
          recordsInterfaceSubscription.message,
          { subscriptionHandler: recordsSubscribeHandler }
        );
        expect(recordsInterfaceSubscriptionReply.status.code).to.equal(200);
        expect(recordsInterfaceSubscriptionReply.subscription).to.exist;

        // subscribe to the Protocols interface
        const protocolsInterfaceSubscription = await TestDataGenerator.generateMessagesSubscribe({
          author  : alice,
          filters : [{ interface: DwnInterfaceName.Protocols }]
        });
        const protocolsMessageCids:string[] = [];
        const protocolsSubscribeHandler = async (event: MessageEvent):Promise<void> => {
          const { message } = event;
          const messageCid = await Message.getCid(message);
          protocolsMessageCids.push(messageCid);
        };

        const protocolsInterfaceSubscriptionReply = await dwn.processMessage(
          alice.did,
          protocolsInterfaceSubscription.message,
          { subscriptionHandler: protocolsSubscribeHandler }
        );
        expect(protocolsInterfaceSubscriptionReply.status.code).to.equal(200);
        expect(protocolsInterfaceSubscriptionReply.subscription).to.exist;

        // create one of each message types a RecordsWrite and a ProtocolsConfigure
        const record = await TestDataGenerator.generateRecordsWrite({ author: alice });
        const recordReply = await dwn.processMessage(alice.did, record.message, { dataStream: record.dataStream });
        expect(recordReply.status.code).to.equal(202, 'RecordsWrite');

        const protocol = await TestDataGenerator.generateProtocolsConfigure({ author: alice });
        const protocolReply = await dwn.processMessage(alice.did, protocol.message);
        expect(protocolReply.status.code).to.equal(202, 'ProtocolConfigure');

        // Poll until the messages are received by the handler
        await Poller.pollUntilSuccessOrTimeout(async () =>{
          // check record message
          expect(recordsMessageCids.length).to.equal(1);
          expect(recordsMessageCids).to.have.members([ await Message.getCid(record.message) ]);

          // check protocols message
          expect(protocolsMessageCids.length).to.equal(1);
          expect(protocolsMessageCids).to.have.members([ await Message.getCid(protocol.message) ]);
        });

        // delete the record
        const recordDelete = await TestDataGenerator.generateRecordsDelete({ author: alice, recordId: record.message.recordId });
        const recordDeleteReply = await dwn.processMessage(alice.did, recordDelete.message);
        expect(recordDeleteReply.status.code).to.equal(202, 'RecordsDelete');

        // poll until the delete message is received by the handler
        await Poller.pollUntilSuccessOrTimeout(async () => {
          // check record messages to include the delete message
          expect(recordsMessageCids.length).to.equal(2);
          expect(recordsMessageCids).to.include.members([ await Message.getCid(recordDelete.message) ]);

          // check that the protocols message array does not include the delete message
          expect(protocolsMessageCids.length).to.equal(1); // unchanged
        });

        // clean up the subscriptions
        await recordsInterfaceSubscriptionReply.subscription?.close();
        await protocolsInterfaceSubscriptionReply.subscription?.close();
      });

      it('filters by method type', async () => {
        // scenario:
        // Alice creates a subscription filtered to RecordsWrite messages
        // Alice creates a second subscription filtered to RecordsDelete messages
        // Alice creates a RecordsWrite message, then updates the records with a subsequent RecordsWrite
        // Alice checks that the subscription handler for RecordsWrite received both messages
        // Alice checks that the subscription handler for RecordsDelete did not receive any messages
        // Alice now deletes the record with a RecordsDelete
        // Alice also writes a new record with a RecordsWrite
        // Alice checks that the RecordsWrite handler received the new record, but not the delete message
        // Alice checks the RecordsDelete handler received the delete message

        const alice = await TestDataGenerator.generateDidKeyPersona();

        // subscribe to records write
        const recordsWriteSubscription = await TestDataGenerator.generateMessagesSubscribe({
          author  : alice,
          filters : [{ interface: DwnInterfaceName.Records, method: DwnMethodName.Write }]
        });
        const recordsWriteMessageCids:string[] = [];
        const recordsSubscribeHandler = async (event: MessageEvent):Promise<void> => {
          const { message } = event;
          const messageCid = await Message.getCid(message);
          recordsWriteMessageCids.push(messageCid);
        };

        const recordsWriteSubscriptionReply = await dwn.processMessage(
          alice.did,
          recordsWriteSubscription.message,
          { subscriptionHandler: recordsSubscribeHandler }
        );
        expect(recordsWriteSubscriptionReply.status.code).to.equal(200);
        expect(recordsWriteSubscriptionReply.subscription).to.exist;

        // subscribe to records delete
        const recordsDeleteSubscription = await TestDataGenerator.generateMessagesSubscribe({
          author  : alice,
          filters : [{ interface: DwnInterfaceName.Records, method: DwnMethodName.Delete }]
        });
        const recordsDeleteMessageCids:string[] = [];
        const recordsDeleteSubscribeHandler = async (event: MessageEvent):Promise<void> => {
          const { message } = event;
          const messageCid = await Message.getCid(message);
          recordsDeleteMessageCids.push(messageCid);
        };

        const recordsDeleteSubscriptionReply = await dwn.processMessage(
          alice.did,
          recordsDeleteSubscription.message,
          { subscriptionHandler: recordsDeleteSubscribeHandler }
        );
        expect(recordsDeleteSubscriptionReply.status.code).to.equal(200);
        expect(recordsDeleteSubscriptionReply.subscription).to.exist;

        // create and updates the record, this creates two RecordsWrite messages
        const record = await TestDataGenerator.generateRecordsWrite({ author: alice });
        const recordReply = await dwn.processMessage(alice.did, record.message, { dataStream: record.dataStream });
        expect(recordReply.status.code).to.equal(202, 'RecordsWrite');
        const record1MessageCid = await Message.getCid(record.message);

        const recordUpdate = await TestDataGenerator.generateFromRecordsWrite({ author: alice, existingWrite: record.recordsWrite });
        const recordUpdateReply = await dwn.processMessage(alice.did, recordUpdate.message, { dataStream: recordUpdate.dataStream });
        expect(recordUpdateReply.status.code).to.equal(202, 'RecordsUpdate');
        const recordUpdateMessageCid = await Message.getCid(recordUpdate.message);

        // Poll until the messages are received by the handler
        await Poller.pollUntilSuccessOrTimeout(async () => {
          // check the array for both the RecordsWrite messages
          expect(recordsWriteMessageCids.length).to.equal(2);
          expect(recordsWriteMessageCids).to.have.members([
            record1MessageCid,
            recordUpdateMessageCid,
          ]);
        });

        // confirm that the delete array is empty
        expect(recordsDeleteMessageCids.length).to.equal(0);

        // delete the record
        const recordDelete = await TestDataGenerator.generateRecordsDelete({ author: alice, recordId: record.message.recordId });
        const recordDeleteReply = await dwn.processMessage(alice.did, recordDelete.message);
        expect(recordDeleteReply.status.code).to.equal(202, 'RecordsDelete');
        const recordDeleteMessageCid = await Message.getCid(recordDelete.message);

        // write a second record
        const record2 = await TestDataGenerator.generateRecordsWrite({ author: alice });
        const record2Reply = await dwn.processMessage(alice.did, record2.message, { dataStream: record2.dataStream });
        expect(record2Reply.status.code).to.equal(202, 'RecordsWrite');
        const record2MessageCid = await Message.getCid(record2.message);

        await Poller.pollUntilSuccessOrTimeout(async () => {
          // ensure the new record is in the recordsWrite array, but not the delete
          expect(recordsWriteMessageCids.length).to.equal(3);
          expect(recordsWriteMessageCids).to.include.members([
            record1MessageCid,
            recordUpdateMessageCid,
            record2MessageCid,
          ]);

          // ensure the delete message is in the recordsDelete array
          expect(recordsDeleteMessageCids.length).to.equal(1);
          expect(recordsDeleteMessageCids).to.include.members([
            recordDeleteMessageCid,
          ]);
        });
      });

      it('filters by a protocol across different message types', async () => {
        // NOTE: This test validates the ability to filter by a specific protocol across different message types.
        //       This will return any of the `RecordsWrite`, `RecordsDelete` and `ProtocolConfigure` messages that are associated with the protocol
        //       Additionally this will return permission-protocol `RecordsWrite` messages that are associated with the protocol.

        // scenario:
        //    alice creates two different subscriptions, one for each protocol (proto1, proto2)
        //    alice configures the two different protocols (proto1, proto2)
        //    alice creates records for each protocol
        //    bob requests permissions for both protocols
        //    alice grants bob permissions for both protocols
        //    when checking the handler arrays for the specific protocol, only Events related to it should be present.
        //    alice then deletes the records for each protocol
        //    alice revokes bob's permissions for both protocols
        //    now when checking the handler arrays, the delete and revocation messages should be present

        const alice = await TestDataGenerator.generateDidKeyPersona();
        const bob = await TestDataGenerator.generateDidKeyPersona();

        const proto1Messages:string[] = [];
        const proto1Handler = async (event: MessageEvent):Promise<void> => {
          const { message } = event;
          proto1Messages.push(await Message.getCid(message));
        };

        const proto1Subscription = await TestDataGenerator.generateMessagesSubscribe({
          author  : alice,
          filters : [{ protocol: 'http://proto1' }]
        });
        const proto1SubscriptionReply = await dwn.processMessage(alice.did, proto1Subscription.message, {
          subscriptionHandler: proto1Handler
        });
        expect(proto1SubscriptionReply.status.code).to.equal(200);
        expect(proto1SubscriptionReply.subscription).to.exist;

        const proto2Messages:string[] = [];
        const proto2Handler = async (event: MessageEvent):Promise<void> => {
          const { message } = event;
          proto2Messages.push(await Message.getCid(message));
        };

        const proto2Subscription = await TestDataGenerator.generateMessagesSubscribe({
          author  : alice,
          filters : [{ protocol: 'http://proto2' }]
        });
        const proto2SubscriptionReply = await dwn.processMessage(alice.did, proto2Subscription.message, {
          subscriptionHandler: proto2Handler
        });
        expect(proto2SubscriptionReply.status.code).to.equal(200);
        expect(proto2SubscriptionReply.subscription).to.exist;

        // configure proto1
        const protoConf1 = await TestDataGenerator.generateProtocolsConfigure({
          author             : alice,
          protocolDefinition : { ...freeForAll, protocol: 'http://proto1' }
        });

        const proto1 = protoConf1.message.descriptor.definition.protocol;
        const protoConf1Response = await dwn.processMessage(alice.did, protoConf1.message);
        expect(protoConf1Response.status.code).equals(202);

        // configure proto2
        const protoConf2 = await TestDataGenerator.generateProtocolsConfigure({
          author             : alice,
          protocolDefinition : { ...freeForAll, protocol: 'http://proto2' }
        });
        const proto2 = protoConf2.message.descriptor.definition.protocol;
        const protoConf2Response = await dwn.processMessage(alice.did, protoConf2.message);
        expect(protoConf2Response.status.code).equals(202);

        const postProperties = {
          protocolPath : 'post',
          schema       : freeForAll.types.post.schema,
          dataFormat   : freeForAll.types.post.dataFormats[0],
        };

        // create a record for proto1
        const write1proto1 = await TestDataGenerator.generateRecordsWrite({ author: alice, protocol: proto1, ...postProperties });
        const write1Response = await dwn.processMessage(alice.did, write1proto1.message, { dataStream: write1proto1.dataStream });
        expect(write1Response.status.code).equals(202);

        // create a record for proto2
        const write1proto2 = await TestDataGenerator.generateRecordsWrite({ author: alice, protocol: proto2, ...postProperties });
        const write1Proto2Response = await dwn.processMessage(alice.did, write1proto2.message, { dataStream: write1proto2.dataStream });
        expect(write1Proto2Response.status.code).equals(202);

        // bob requests permissions for proto1
        const requestProto1 = await PermissionsProtocol.createRequest({
          signer    : Jws.createSigner(bob),
          scope     : { interface: DwnInterfaceName.Records, method: DwnMethodName.Write, protocol: proto1 },
          delegated : false,
        });
        const requestProto1Response = await dwn.processMessage(
          alice.did,
          requestProto1.recordsWrite.message,
          { dataStream: DataStream.fromBytes(requestProto1.permissionRequestBytes) }
        );
        expect(requestProto1Response.status.code).equals(202);

        // bob requests permissions for proto2
        const requestProto2 = await PermissionsProtocol.createRequest({
          signer    : Jws.createSigner(bob),
          scope     : { interface: DwnInterfaceName.Records, method: DwnMethodName.Write, protocol: proto2 },
          delegated : false,
        });
        const requestProto2Response = await dwn.processMessage(
          alice.did,
          requestProto2.recordsWrite.message,
          { dataStream: DataStream.fromBytes(requestProto2.permissionRequestBytes) }
        );
        expect(requestProto2Response.status.code).equals(202);

        // alice grants permissions for proto1
        const grantProto1 = await PermissionsProtocol.createGrant({
          signer      : Jws.createSigner(alice),
          scope       : requestProto1.permissionRequestData.scope,
          dateExpires : Time.createOffsetTimestamp({ seconds: 5 }),
          grantedTo   : bob.did,
        });
        const grantProto1Response = await dwn.processMessage(
          alice.did,
          grantProto1.recordsWrite.message,
          { dataStream: DataStream.fromBytes(grantProto1.permissionGrantBytes) }
        );
        expect(grantProto1Response.status.code).equals(202);

        // alice grants permissions for proto2
        const grantProto2 = await PermissionsProtocol.createGrant({
          signer      : Jws.createSigner(alice),
          scope       : requestProto2.permissionRequestData.scope,
          dateExpires : Time.createOffsetTimestamp({ seconds: 5 }),
          grantedTo   : bob.did,
        });
        const grantProto2Response = await dwn.processMessage(
          alice.did,
          grantProto2.recordsWrite.message,
          { dataStream: DataStream.fromBytes(grantProto2.permissionGrantBytes) }
        );
        expect(grantProto2Response.status.code).equals(202);

        // poll until the messages are received by the handlers
        await Poller.pollUntilSuccessOrTimeout(async () => {
          // check for proto1 messages
          expect(proto1Messages.length).to.equal(4);
          expect(proto1Messages).to.have.members([
            await Message.getCid(protoConf1.message),
            await Message.getCid(write1proto1.message),
            await Message.getCid(requestProto1.recordsWrite.message),
            await Message.getCid(grantProto1.recordsWrite.message),
          ]);

          // check for proto2 messages
          expect(proto2Messages.length).to.equal(4);
          expect(proto2Messages).to.have.members([
            await Message.getCid(protoConf2.message),
            await Message.getCid(write1proto2.message),
            await Message.getCid(requestProto2.recordsWrite.message),
            await Message.getCid(grantProto2.recordsWrite.message),
          ]);
        });

        // delete proto1 message
        const deleteProto1Message = await TestDataGenerator.generateRecordsDelete({ author: alice, recordId: write1proto1.message.recordId });
        const deleteProto1MessageReply = await dwn.processMessage(alice.did, deleteProto1Message.message);
        expect(deleteProto1MessageReply.status.code).to.equal(202);

        // delete proto2 message
        const deleteProto2Message = await TestDataGenerator.generateRecordsDelete({ author: alice, recordId: write1proto2.message.recordId });
        const deleteProto2MessageReply = await dwn.processMessage(alice.did, deleteProto2Message.message);
        expect(deleteProto2MessageReply.status.code).to.equal(202);

        // revoke permissions for proto1
        const revokeProto1 = await PermissionsProtocol.createRevocation({
          signer : Jws.createSigner(alice),
          grant  : await PermissionGrant.parse(grantProto1.dataEncodedMessage),
        });
        const revokeProto1Response = await dwn.processMessage(
          alice.did,
          revokeProto1.recordsWrite.message,
          { dataStream: DataStream.fromBytes(revokeProto1.permissionRevocationBytes) }
        );
        expect(revokeProto1Response.status.code).equals(202);

        // revoke permissions for proto2
        const revokeProto2 = await PermissionsProtocol.createRevocation({
          signer : Jws.createSigner(alice),
          grant  : await PermissionGrant.parse(grantProto2.dataEncodedMessage),
        });
        const revokeProto2Response = await dwn.processMessage(
          alice.did,
          revokeProto2.recordsWrite.message,
          { dataStream: DataStream.fromBytes(revokeProto2.permissionRevocationBytes) }
        );
        expect(revokeProto2Response.status.code).equals(202);

        // poll until the messages are received by the handlers
        await Poller.pollUntilSuccessOrTimeout(async () => {
          // check for the delete and revocation in proto1 messages
          expect(proto1Messages.length).to.equal(6); // 2 additional messages
          expect(proto1Messages).to.include.members([
            await Message.getCid(deleteProto1Message.message),
            await Message.getCid(revokeProto1.recordsWrite.message),
          ]);

          // check for the delete and revocation in proto2 messages
          expect(proto2Messages.length).to.equal(6); // 2 additional messages
          expect(proto2Messages).to.include.members([
            await Message.getCid(deleteProto2Message.message),
            await Message.getCid(revokeProto2.recordsWrite.message),
          ]);
        });
      });

      it('does not emit events after subscription is closed', async () => {
        // scenario: create two subscriptions.
        // write a message, check that both subscriptions receive the message.
        // close one subscription, write two more messages, check that only the open subscription receives the messages.
        // we purposely leave one subscription open to ensure that the messages are being processed by an external pub/sub system

        const alice = await TestDataGenerator.generateDidKeyPersona();

        // messageCids of subscription 1 messages
        const sub1MessageCids:string[] = [];
        const handler1 = async (event: MessageEvent): Promise<void> => {
          const { message } = event;
          const messageCid = await Message.getCid(message);
          sub1MessageCids.push(messageCid);
        };

        // messageCids of subscription 2 messages
        const sub2MessageCids:string[] = [];
        const handler2 = async (event: MessageEvent): Promise<void> => {
          const { message } = event;
          const messageCid = await Message.getCid(message);
          sub2MessageCids.push(messageCid);
        };


        // subscribe to all messages
        const messagesSubscription1 = await TestDataGenerator.generateMessagesSubscribe({ author: alice });
        const messagesSubscription1Reply = await dwn.processMessage(alice.did, messagesSubscription1.message, { subscriptionHandler: handler1 });
        expect(messagesSubscription1Reply.status.code).to.equal(200);

        const messagesSubscription2 = await TestDataGenerator.generateMessagesSubscribe({ author: alice });
        const messagesSubscription2Reply = await dwn.processMessage(alice.did, messagesSubscription2.message, { subscriptionHandler: handler2 });
        expect(messagesSubscription2Reply.status.code).to.equal(200);

        // no event message exist yet
        expect(sub1MessageCids.length).to.equal(0);
        expect(sub2MessageCids.length).to.equal(0);

        // write a record
        const record1 = await TestDataGenerator.generateRecordsWrite({ author: alice });
        const record1Reply = await dwn.processMessage(alice.did, record1.message, { dataStream: record1.dataStream });
        expect(record1Reply.status.code).to.equal(202);
        const record1MessageCid = await Message.getCid(record1.message);

        await Poller.pollUntilSuccessOrTimeout(async () => {
          // both subscriptions should have received the message
          expect(sub1MessageCids.length).to.equal(1); // message exists
          expect(sub1MessageCids).to.eql([ record1MessageCid ]);

          expect(sub2MessageCids.length).to.equal(1); // message exists
          expect(sub2MessageCids).to.eql([ record1MessageCid ]);
        });

        // unsubscribe from subscription 2
        await messagesSubscription2Reply.subscription!.close();

        // write two more message.
        const record2 = await TestDataGenerator.generateRecordsWrite({ author: alice });
        const record2Reply = await dwn.processMessage(alice.did, record2.message, { dataStream: record2.dataStream });
        expect(record2Reply.status.code).to.equal(202);
        const record2MessageCid = await Message.getCid(record2.message);

        const record3 = await TestDataGenerator.generateRecordsWrite({ author: alice });
        const record3Reply = await dwn.processMessage(alice.did, record3.message, { dataStream: record3.dataStream });
        expect(record3Reply.status.code).to.equal(202);
        const record3MessageCid = await Message.getCid(record3.message);

        await Poller.pollUntilSuccessOrTimeout(async () => {
          expect(sub1MessageCids.length).to.equal(3); // all three messages exist
          expect(sub1MessageCids).to.eql([
            record1MessageCid,
            record2MessageCid,
            record3MessageCid
          ]);

          expect(sub2MessageCids.length).to.equal(1); // only the first message exists
          expect(sub2MessageCids).to.eql([ record1MessageCid ]);
        });
      });
    });

    describe('records subscribe', () => {
      it('allows for anonymous subscriptions to published records', async () => {
        // scenario:
        // a user creates an anonymous subscription filtered to a schema to alice's DWN
        // alice writes two records, one not published and one published
        // alice checks that the anonymous subscription handler only received the published record

        // NOTE we create a control subscription to capture all messages
        // this is to ensure that the messages are not received by the anonymous subscription handler, but have had ample time to be processed

        const alice = await TestDataGenerator.generateDidKeyPersona();

        // create a control handler to capture ALL messages in the protocol with alice as the author
        const allMessages:string[] = [];
        const allHandler = async (event: MessageEvent): Promise<void> => {
          const { message } = event;
          allMessages.push(await Message.getCid(message));
        };
        const allSubscription = await TestDataGenerator.generateMessagesSubscribe({
          author: alice,
        });
        const allSubscriptionReply = await dwn.processMessage(alice.did, allSubscription.message, { subscriptionHandler: allHandler });
        expect(allSubscriptionReply.status.code).to.equal(200);


        // we create an anonymous subscription to capture only published messages
        const publishedMessages:string[] = [];
        const anonymousSubscriptionHandler = async (event: RecordEvent):Promise<void> => {
          const { message } = event;
          publishedMessages.push(await Message.getCid(message));
        };
        const anonymousSubscription = await TestDataGenerator.generateRecordsSubscribe({
          anonymous : true,
          filter    : { schema: 'http://schema1' }
        });
        const anonymousSubscriptionReply = await dwn.processMessage(alice.did, anonymousSubscription.message, {
          subscriptionHandler: anonymousSubscriptionHandler
        });
        expect(anonymousSubscriptionReply.status.code).to.equal(200);
        expect(anonymousSubscriptionReply.subscription).to.exist;


        // we create a non published record, this will only show up in the control subscription
        const writeNotPublished = await TestDataGenerator.generateRecordsWrite({ author: alice, schema: 'http://schema1' });
        const writeNotPublishedReply = await dwn.processMessage(alice.did, writeNotPublished.message, { dataStream: writeNotPublished.dataStream });
        expect(writeNotPublishedReply.status.code).to.equal(202);

        // we create a published record, this will show up in both the control and anonymous subscription
        const write1 = await TestDataGenerator.generateRecordsWrite({ author: alice, schema: 'http://schema1', published: true });
        const write1Reply = await dwn.processMessage(alice.did, write1.message, { dataStream: write1.dataStream });
        expect(write1Reply.status.code).to.equal(202);

        // we create another published record, this will show up in both the control and anonymous subscription
        const write2 = await TestDataGenerator.generateRecordsWrite({ author: alice, schema: 'http://schema1', published: true });
        const write2Reply = await dwn.processMessage(alice.did, write2.message, { dataStream: write2.dataStream });
        expect(write2Reply.status.code).to.equal(202);

        await Poller.pollUntilSuccessOrTimeout(async () => {
          // publishedMessages array should only contain the two published messages
          expect(publishedMessages.length).to.equal(2);
          expect(publishedMessages).to.have.members([
            await Message.getCid(write1.message),
            await Message.getCid(write2.message),
          ]);

          // allMessages array should contain all three messages
          expect(allMessages.length).to.equal(3);
          expect(allMessages).to.have.members([
            await Message.getCid(writeNotPublished.message),
            await Message.getCid(write1.message),
            await Message.getCid(write2.message),
          ]);
        });
      });

      it('allows authorized subscriptions to records intended for a recipient', async () => {
        const alice = await TestDataGenerator.generateDidKeyPersona();

        // alice installs a freeForAll protocol
        const protocolConfigure = await TestDataGenerator.generateProtocolsConfigure({
          author             : alice,
          protocolDefinition : { ...freeForAll }
        });
        const protocolConfigureReply = await dwn.processMessage(alice.did, protocolConfigure.message);
        expect(protocolConfigureReply.status.code).to.equal(202);

        const bob = await TestDataGenerator.generateDidKeyPersona();
        const carol = await TestDataGenerator.generateDidKeyPersona();

        // bob subscribes to all records he's authorized to see, with alice as the recipient
        const bobSubscribeAlice:string[] = [];
        const bobSubscribeHandler = async (event: RecordEvent):Promise<void> => {
          const { message } = event;
          bobSubscribeAlice.push(await Message.getCid(message));
        };

        const bobSubscribeToAlice = await TestDataGenerator.generateRecordsSubscribe({
          author : bob,
          filter : { protocol: freeForAll.protocol, recipient: alice.did }
        });

        const bobSubscribeReply = await dwn.processMessage(alice.did, bobSubscribeToAlice.message, {
          subscriptionHandler: bobSubscribeHandler
        });
        expect(bobSubscribeReply.status.code).to.equal(200);
        expect(bobSubscribeReply.subscription).to.exist;

        // carol subscribes to any messages that she or alice are the recipients of
        const carolSubscribeCarolAndAlice:string[] = [];
        const carolSubscribeHandler = async (event: RecordEvent):Promise<void> => {
          const { message } = event;
          carolSubscribeCarolAndAlice.push(await Message.getCid(message));
        };

        const carolSubscribeToCarolAndAlice = await TestDataGenerator.generateRecordsSubscribe({
          author : carol,
          filter : { protocol: freeForAll.protocol, recipient: [ alice.did, carol.did ] }
        });

        const carolSubscribeReply = await dwn.processMessage(alice.did, carolSubscribeToCarolAndAlice.message, {
          subscriptionHandler: carolSubscribeHandler
        });
        expect(carolSubscribeReply.status.code).to.equal(200);
        expect(carolSubscribeReply.subscription).to.exist;

        const recordParams = {
          protocol     : freeForAll.protocol,
          protocolPath : 'post',
          schema       : freeForAll.types.post.schema,
          dataFormat   : freeForAll.types.post.dataFormats[0],
        };

        // write a private and public message for alice from bob
        const publicBobToAlice = await TestDataGenerator.generateRecordsWrite({
          ...recordParams,
          author    : bob,
          recipient : alice.did,
          published : true
        });
        const publicBobToAliceReply = await dwn.processMessage(alice.did, publicBobToAlice.message, { dataStream: publicBobToAlice.dataStream });
        expect(publicBobToAliceReply.status.code).to.equal(202);

        const privateBobToAlice = await TestDataGenerator.generateRecordsWrite({
          ...recordParams,
          author    : bob,
          recipient : alice.did,
          published : false
        });
        const privateBobToAliceReply = await dwn.processMessage(alice.did, privateBobToAlice.message, { dataStream: privateBobToAlice.dataStream });
        expect(privateBobToAliceReply.status.code).to.equal(202);

        // write a private message for alice from carol
        const privateCarolToAlice = await TestDataGenerator.generateRecordsWrite({
          ...recordParams,
          author    : carol,
          recipient : alice.did,
          published : false
        });
        const privateCarolToAliceReply = await dwn.processMessage(alice.did, privateCarolToAlice.message, {
          dataStream: privateCarolToAlice.dataStream
        });
        expect(privateCarolToAliceReply.status.code).to.equal(202);

        // write a public and private message from bob to carol
        const publicBobToCarol = await TestDataGenerator.generateRecordsWrite({
          ...recordParams,
          author    : bob,
          recipient : carol.did,
          published : true
        });
        const publicBobToCarolReply = await dwn.processMessage(alice.did, publicBobToCarol.message, {
          dataStream: publicBobToCarol.dataStream
        });
        expect(publicBobToCarolReply.status.code).to.equal(202);

        const privateBobToCarol = await TestDataGenerator.generateRecordsWrite({
          ...recordParams,
          author    : bob,
          recipient : carol.did,
          published : false
        });
        const privateBobToCarolReply = await dwn.processMessage(alice.did, privateBobToCarol.message, {
          dataStream: privateBobToCarol.dataStream
        });
        expect(privateBobToCarolReply.status.code).to.equal(202);

        await Poller.pollUntilSuccessOrTimeout(async () => {
          // carol should have received the message intended for her
          expect(carolSubscribeCarolAndAlice.length).to.equal(4);
          expect(carolSubscribeCarolAndAlice).to.have.members([
            await Message.getCid(publicBobToAlice.message),
            await Message.getCid(privateCarolToAlice.message),
            await Message.getCid(publicBobToCarol.message),
            await Message.getCid(privateBobToCarol.message),
          ]);

          // bob should have received the two messages intended for him
          expect(bobSubscribeAlice.length).to.equal(2);
          expect(bobSubscribeAlice).to.have.members([
            await Message.getCid(privateBobToAlice.message),
            await Message.getCid(publicBobToAlice.message),
          ]);
        });
      });

      it('allows for authorized subscriptions to records authored by an author(s)', async () => {
        const alice = await TestDataGenerator.generateDidKeyPersona();

        // alice installs a freeForAll protocol
        const protocolConfigure = await TestDataGenerator.generateProtocolsConfigure({
          author             : alice,
          protocolDefinition : { ...freeForAll }
        });
        const protocolConfigureReply = await dwn.processMessage(alice.did, protocolConfigure.message);
        expect(protocolConfigureReply.status.code).to.equal(202);

        const bob = await TestDataGenerator.generateDidKeyPersona();
        const carol = await TestDataGenerator.generateDidKeyPersona();

        // bob subscribes to all records he's authorized to see, with alice as the author
        const bobSubscribeAlice:string[] = [];
        const bobSubscribeHandler = async (event: RecordEvent):Promise<void> => {
          const { message } = event;
          bobSubscribeAlice.push(await Message.getCid(message));
        };

        const bobSubscribeToAlice = await TestDataGenerator.generateRecordsSubscribe({
          author : bob,
          filter : { protocol: freeForAll.protocol, author: alice.did }
        });

        const bobSubscribeReply = await dwn.processMessage(alice.did, bobSubscribeToAlice.message, {
          subscriptionHandler: bobSubscribeHandler
        });
        expect(bobSubscribeReply.status.code).to.equal(200);
        expect(bobSubscribeReply.subscription).to.exist;

        // carol subscribes to any messages that she or alice are the authors of
        const carolSubscribeCarolAndAlice:string[] = [];
        const carolSubscribeHandler = async (event: RecordEvent):Promise<void> => {
          const { message } = event;
          carolSubscribeCarolAndAlice.push(await Message.getCid(message));
        };

        const carolSubscribeToCarolAndAlice = await TestDataGenerator.generateRecordsSubscribe({
          author : carol,
          filter : { protocol: freeForAll.protocol, author: [ alice.did, carol.did ] }
        });

        const carolSubscribeReply = await dwn.processMessage(alice.did, carolSubscribeToCarolAndAlice.message, {
          subscriptionHandler: carolSubscribeHandler
        });
        expect(carolSubscribeReply.status.code).to.equal(200);
        expect(carolSubscribeReply.subscription).to.exist;

        const recordParams = {
          protocol     : freeForAll.protocol,
          protocolPath : 'post',
          schema       : freeForAll.types.post.schema,
          dataFormat   : freeForAll.types.post.dataFormats[0],
        };

        //control: write a public message to bob (will not show up)
        const publicAliceToBob = await TestDataGenerator.generateRecordsWrite({
          ...recordParams,
          author    : alice,
          recipient : bob.did,
          published : true
        });
        const publicAliceToBobReply = await dwn.processMessage(alice.did, publicAliceToBob.message, {
          dataStream: publicAliceToBob.dataStream
        });
        expect(publicAliceToBobReply.status.code).to.equal(202);

        // write a private and public message from alice to carol
        const publicAliceToCarol = await TestDataGenerator.generateRecordsWrite({
          ...recordParams,
          author    : alice,
          recipient : carol.did,
          published : true
        });
        const publicAliceToCarolReply = await dwn.processMessage(alice.did, publicAliceToCarol.message, {
          dataStream: publicAliceToCarol.dataStream
        });
        expect(publicAliceToCarolReply.status.code).to.equal(202);

        const privateAliceToCarol = await TestDataGenerator.generateRecordsWrite({
          ...recordParams,
          author    : alice,
          recipient : carol.did,
          published : false
        });
        const privateAliceToCarolReply = await dwn.processMessage(alice.did, privateAliceToCarol.message, {
          dataStream: privateAliceToCarol.dataStream
        });
        expect(privateAliceToCarolReply.status.code).to.equal(202);

        // write a private message for alice from carol
        const privateCarolToAlice = await TestDataGenerator.generateRecordsWrite({
          ...recordParams,
          author    : carol,
          recipient : alice.did,
          published : false
        });
        const privateCarolToAliceReply = await dwn.processMessage(alice.did, privateCarolToAlice.message, {
          dataStream: privateCarolToAlice.dataStream
        });
        expect(privateCarolToAliceReply.status.code).to.equal(202);

        // write a public and private message from bob to carol
        const publicBobToCarol = await TestDataGenerator.generateRecordsWrite({
          ...recordParams,
          author    : bob,
          recipient : carol.did,
          published : true
        });
        const publicBobToCarolReply = await dwn.processMessage(alice.did, publicBobToCarol.message, {
          dataStream: publicBobToCarol.dataStream
        });
        expect(publicBobToCarolReply.status.code).to.equal(202);

        const privateBobToCarol = await TestDataGenerator.generateRecordsWrite({
          ...recordParams,
          author    : bob,
          recipient : carol.did,
          published : false
        });
        const privateBobToCarolReply = await dwn.processMessage(alice.did, privateBobToCarol.message, {
          dataStream: privateBobToCarol.dataStream
        });
        expect(privateBobToCarolReply.status.code).to.equal(202);

        await Poller.pollUntilSuccessOrTimeout(async () => {
          // carol should have received the message intended for her
          expect(carolSubscribeCarolAndAlice.length).to.equal(4);
          expect(carolSubscribeCarolAndAlice).to.have.members([
            await Message.getCid(publicAliceToCarol.message),
            await Message.getCid(privateAliceToCarol.message),
            await Message.getCid(publicAliceToBob.message),
            await Message.getCid(privateCarolToAlice.message),
          ]);

          // bob should have received the two messages intended for him
          expect(bobSubscribeAlice.length).to.equal(2);
          expect(bobSubscribeAlice).to.have.members([
            await Message.getCid(publicAliceToBob.message),
            await Message.getCid(publicAliceToCarol.message)
          ]);
        });
      });

      it('filters by protocol & contextId across multiple protocolPaths', async () => {
        // scenario: subscribe to multiple protocolPaths for a given protocol and contextId
        //    alice installs a protocol and creates a thread
        //    alice subscribes to update to that thread, it's participant as well as thread chats
        //    alice adds bob and carol as participants to the thread
        //    alice, bob, and carol all create messages
        //    alice deletes carol participant message
        //    alice checks that the correct messages were omitted

        const alice = await TestDataGenerator.generateDidKeyPersona();
        const bob = await TestDataGenerator.generateDidKeyPersona();
        const carol = await TestDataGenerator.generateDidKeyPersona();

        // create protocol
        const protocolConfigure = await TestDataGenerator.generateProtocolsConfigure({
          author             : alice,
          protocolDefinition : { ...threadProtocol }
        });
        const protocolConfigureReply = await dwn.processMessage(alice.did, protocolConfigure.message);
        expect(protocolConfigureReply.status.code).to.equal(202);
        const protocol = protocolConfigure.message.descriptor.definition.protocol;

        // alice creates thread
        const thread = await TestDataGenerator.generateRecordsWrite({
          author       : alice,
          protocol     : protocol,
          protocolPath : 'thread'
        });
        const threadReply = await dwn.processMessage(alice.did, thread.message, { dataStream: thread.dataStream });
        expect(threadReply.status.code).to.equal(202);


        // subscribe to this thread's messages
        const messages:string[] = [];
        const initialWrites: string[] = [];
        const subscriptionHandler = async (event :MessageEvent):Promise<void> => {
          const { message, initialWrite } = event;
          if (initialWrite !== undefined) {
            initialWrites.push(await Message.getCid(initialWrite));
          }
          messages.push(await Message.getCid(message));
        };

        const threadSubscription = await TestDataGenerator.generateRecordsSubscribe({
          author : alice,
          filter : { protocol: protocol, protocolPath: 'thread', contextId: thread.message.contextId }, // thread updates
        });
        const threadSubscriptionReply = await dwn.processMessage(alice.did, threadSubscription.message, {
          subscriptionHandler
        });
        expect(threadSubscriptionReply.status.code).to.equal(200);
        expect(threadSubscriptionReply.subscription).to.exist;

        const participantSubscription = await TestDataGenerator.generateRecordsSubscribe({
          author : alice,
          filter : { protocol: protocol, protocolPath: 'thread/participant', contextId: thread.message.contextId }, // participant updates
        });
        const participantSubscriptionReply = await dwn.processMessage(alice.did, participantSubscription.message, {
          subscriptionHandler
        });
        expect(participantSubscriptionReply.status.code).to.equal(200);
        expect(participantSubscriptionReply.subscription).to.exist;

        const chatSubscription = await TestDataGenerator.generateRecordsSubscribe({
          author : alice,
          filter : { protocol: protocol, protocolPath: 'thread/chat', contextId: thread.message.contextId } // chat updates
        });
        const chatSubscriptionReply = await dwn.processMessage(alice.did, chatSubscription.message, {
          subscriptionHandler
        });
        expect(chatSubscriptionReply.status.code).to.equal(200);
        expect(chatSubscriptionReply.subscription).to.exist;

        // add bob as participant
        const bobParticipant = await TestDataGenerator.generateRecordsWrite({
          author          : alice,
          recipient       : bob.did,
          parentContextId : thread.message.contextId,
          protocol        : protocol,
          protocolPath    : 'thread/participant'
        });
        const bobParticipantReply = await dwn.processMessage(alice.did, bobParticipant.message, { dataStream: bobParticipant.dataStream });
        expect(bobParticipantReply.status.code).to.equal(202);

        // add carol as participant
        const carolParticipant = await TestDataGenerator.generateRecordsWrite({
          author          : alice,
          recipient       : carol.did,
          parentContextId : thread.message.contextId,
          protocol        : protocol,
          protocolPath    : 'thread/participant'
        });
        const carolParticipantReply = await dwn.processMessage(alice.did, carolParticipant.message, { dataStream: carolParticipant.dataStream });
        expect(carolParticipantReply.status.code).to.equal(202);

        // add another thread as a control, will not show up in handled message events
        const additionalThread = await TestDataGenerator.generateRecordsWrite({
          author       : alice,
          protocol     : protocol,
          protocolPath : 'thread'
        });
        const additionalThreadReply = await dwn.processMessage(alice.did, additionalThread.message, { dataStream: additionalThread.dataStream });
        expect(additionalThreadReply.status.code).to.equal(202);

        await Poller.pollUntilSuccessOrTimeout(async () => {
          expect(messages.length).to.equal(2);
          expect(messages).to.have.members([
            await Message.getCid(bobParticipant.message),
            await Message.getCid(carolParticipant.message),
          ]);
        });

        // add a message to protocol1
        const message1 = await TestDataGenerator.generateRecordsWrite({
          author          : bob,
          recipient       : alice.did,
          parentContextId : thread.message.contextId,
          protocol        : protocol,
          protocolPath    : 'thread/chat',
          protocolRole    : 'thread/participant',
        });
        const message1Reply = await dwn.processMessage(alice.did, message1.message, { dataStream: message1.dataStream });
        expect(message1Reply.status.code).to.equal(202);

        const message2 = await TestDataGenerator.generateRecordsWrite({
          author          : bob,
          recipient       : alice.did,
          parentContextId : thread.message.contextId,
          protocol        : protocol,
          protocolPath    : 'thread/chat',
          protocolRole    : 'thread/participant',
        });
        const message2Reply = await dwn.processMessage(alice.did, message2.message, { dataStream: message2.dataStream });
        expect(message2Reply.status.code).to.equal(202);

        const message3 = await TestDataGenerator.generateRecordsWrite({
          author          : carol,
          recipient       : alice.did,
          parentContextId : thread.message.contextId,
          protocol        : protocol,
          protocolPath    : 'thread/chat',
          protocolRole    : 'thread/participant',
        });
        const message3Reply = await dwn.processMessage(alice.did, message3.message, { dataStream: message3.dataStream });
        expect(message3Reply.status.code).to.equal(202);

        await Poller.pollUntilSuccessOrTimeout(async () => {
          expect(messages.length).to.equal(5);
          expect(messages).to.include.members([
            await Message.getCid(message1.message),
            await Message.getCid(message2.message),
            await Message.getCid(message3.message),
          ]);
        });

        // delete carol participant
        const deleteCarol = await TestDataGenerator.generateRecordsDelete({
          author   : alice,
          recordId : carolParticipant.message.recordId
        });
        const deleteCarolReply = await dwn.processMessage(alice.did, deleteCarol.message);
        expect(deleteCarolReply.status.code).to.equal(202);

        await Poller.pollUntilSuccessOrTimeout(async () => {
          expect(messages.length).to.equal(6);
          expect(messages).to.include.members([
            await Message.getCid(deleteCarol.message)
          ]);

          // check the initial write was included with the delete
          expect(initialWrites).to.include.members([
            await Message.getCid(carolParticipant.message)
          ]);
        });
      });
    });
  });
}