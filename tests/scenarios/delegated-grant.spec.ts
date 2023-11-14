import type { DataStore, EventLog, MessageStore, PermissionScope } from '../../src/index.js';

import chaiAsPromised from 'chai-as-promised';
import emailProtocolDefinition from '../vectors/protocol-definitions/email.json' assert { type: 'json' };
import sinon from 'sinon';
import threadRoleProtocolDefinition from '../vectors/protocol-definitions/thread-role.json' assert { type: 'json' };

import chai, { expect } from 'chai';

import { base64url } from 'multiformats/bases/base64';
import { DataStream } from '../../src/utils/data-stream.js';
import { DidKeyResolver } from '../../src/did/did-key-resolver.js';
import { DidResolver } from '../../src/did/did-resolver.js';
import { Dwn } from '../../src/dwn.js';
import { DwnErrorCode } from '../../src/core/dwn-error.js';
import { Jws } from '../../src/utils/jws.js';
import { RecordsWrite } from '../../src/interfaces/records-write.js';
import { TestDataGenerator } from '../utils/test-data-generator.js';
import { TestStores } from '../test-stores.js';
import { Time } from '../../src/utils/time.js';

import { DwnInterfaceName, DwnMethodName, PermissionsGrant, RecordsDelete, RecordsQuery, RecordsRead } from '../../src/index.js';

chai.use(chaiAsPromised);

export function testDelegatedGrantScenarios(): void {
  describe('delegated grant tests', async () => {
    let didResolver: DidResolver;
    let messageStore: MessageStore;
    let dataStore: DataStore;
    let eventLog: EventLog;
    let dwn: Dwn;

    // important to follow the `before` and `after` pattern to initialize and clean the stores in tests
    // so that different test suites can reuse the same backend store for testing
    before(async () => {
      didResolver = new DidResolver([new DidKeyResolver()]);

      const stores = TestStores.get();
      messageStore = stores.messageStore;
      dataStore = stores.dataStore;
      eventLog = stores.eventLog;

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

    it('should only allow entity invoking a valid delegated grant to write', async () => {
      // scenario:
      // 1. Alice creates a delegated grant for Device X and Device Y,
      // 2. Device X and Y can both use their grants to write a message to Bob's DWN as Alice
      // 3. Messages written by device X and Y should be considered to have been authored by Alice
      // 4. Carol should not be able to write a message as Alice using Device X's delegated grant
      const alice = await DidKeyResolver.generate();
      const deviceX = await DidKeyResolver.generate();
      const deviceY = await DidKeyResolver.generate();
      const bob = await DidKeyResolver.generate();
      const carol = await DidKeyResolver.generate();

      // Bob has the email protocol installed
      const protocolDefinition = emailProtocolDefinition;
      const protocol = protocolDefinition.protocol;
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author: bob,
        protocolDefinition
      });
      const protocolConfigureReply = await dwn.processMessage(bob.did, protocolsConfig.message);
      expect(protocolConfigureReply.status.code).to.equal(202);

      // Alice creates a delegated grant for device X and device Y
      const scope: PermissionScope = {
        interface : DwnInterfaceName.Records,
        method    : DwnMethodName.Write,
        protocol
      };

      const deviceXGrant = await PermissionsGrant.create({
        delegated   : true, // this is a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        description : 'Allow to write to message protocol',
        grantedBy   : alice.did,
        grantedTo   : deviceX.did,
        grantedFor  : alice.did,
        scope       : scope,
        signer      : Jws.createSigner(alice)
      });

      const deviceYGrant = await PermissionsGrant.create({
        delegated   : true, // this is a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        description : 'Allow to write to message protocol',
        grantedBy   : alice.did,
        grantedTo   : deviceY.did,
        grantedFor  : alice.did,
        scope       : scope,
        signer      : Jws.createSigner(alice)
      });

      // generate a `RecordsWrite` message from device X and write to Bob's DWN
      const deviceXData = new TextEncoder().encode('message from device X');
      const deviceXDataStream = DataStream.fromBytes(deviceXData);
      const messageByDeviceX = await RecordsWrite.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : deviceXGrant.asDelegatedGrant(),
        protocol,
        protocolPath   : 'email', // this comes from `types` in protocol definition
        schema         : protocolDefinition.types.email.schema,
        dataFormat     : protocolDefinition.types.email.dataFormats[0],
        data           : deviceXData
      });

      const deviceXWriteReply = await dwn.processMessage(bob.did, messageByDeviceX.message, deviceXDataStream);
      expect(deviceXWriteReply.status.code).to.equal(202);

      // verify the message by device X got written to Bob's DWN, AND Alice is the logical author
      const recordsQueryByBob = await TestDataGenerator.generateRecordsQuery({
        author : bob,
        filter : { protocol }
      });
      const bobRecordsQueryReply = await dwn.processMessage(bob.did, recordsQueryByBob.message);
      expect(bobRecordsQueryReply.status.code).to.equal(200);
      expect(bobRecordsQueryReply.entries?.length).to.equal(1);

      const fetchedDeviceXWriteEntry =bobRecordsQueryReply.entries![0];
      expect(fetchedDeviceXWriteEntry.encodedData).to.equal(base64url.baseEncode(deviceXData));

      const fetchedDeviceXWrite = await RecordsWrite.parse(fetchedDeviceXWriteEntry);
      expect(fetchedDeviceXWrite.author).to.equal(alice.did);

      // generate a new message by device Y updating the existing record device X created, and write to Bob's DWN
      const deviceYData = new TextEncoder().encode('message from device Y');
      const deviceYDataStream = DataStream.fromBytes(deviceYData);
      const messageByDeviceY = await RecordsWrite.createFrom({
        recordsWriteMessage : fetchedDeviceXWrite.message,
        data                : deviceYData,
        signer              : Jws.createSigner(deviceY),
        delegatedGrant      : deviceYGrant.asDelegatedGrant(),
      });

      const deviceYWriteReply = await dwn.processMessage(bob.did, messageByDeviceY.message, deviceYDataStream);
      expect(deviceYWriteReply.status.code).to.equal(202);

      // verify the message by device Y got written to Bob's DWN, AND Alice is the logical author
      const bobRecordsQueryReply2 = await dwn.processMessage(bob.did, recordsQueryByBob.message);
      expect(bobRecordsQueryReply2.status.code).to.equal(200);
      expect(bobRecordsQueryReply2.entries?.length).to.equal(1);

      const fetchedDeviceYWriteEntry =bobRecordsQueryReply2.entries![0];
      expect(fetchedDeviceYWriteEntry.encodedData).to.equal(base64url.baseEncode(deviceYData));

      const fetchedDeviceYWrite = await RecordsWrite.parse(fetchedDeviceYWriteEntry);
      expect(fetchedDeviceYWrite.author).to.equal(alice.did);

      // Verify that Carol cannot write a chat message as Alice by invoking the Device X's grant
      const messageByCarolAsAlice = new TextEncoder().encode('Message from Carol pretending to be Alice');
      const writeByCarolAsAlice = await RecordsWrite.create({
        signer         : Jws.createSigner(carol),
        delegatedGrant : deviceXGrant.asDelegatedGrant(),
        protocol,
        protocolPath   : 'email', // this comes from `types` in protocol definition
        schema         : protocolDefinition.types.email.schema,
        dataFormat     : protocolDefinition.types.email.dataFormats[0],
        data           : messageByCarolAsAlice
      });

      const carolWriteReply = await dwn.processMessage(carol.did, writeByCarolAsAlice.message, DataStream.fromBytes(messageByCarolAsAlice));
      expect(carolWriteReply.status.code).to.equal(400);
      expect(carolWriteReply.status.detail).to.contain(DwnErrorCode.RecordsValidateIntegrityGrantedToAndSignerMismatch);
    });

    it('should only allow entity invoking a valid delegated grant to read or query', async () => {
      // scenario:
      // 1. Alice creates a delegated grant for device X,
      // 2. Bob starts a chat thread with Alice on his DWN
      // 3. device X should be able to read the chat thread
      // 4. Carol should not be able to read the chat thread using device X's delegated grant
      const alice = await DidKeyResolver.generate();
      const deviceX = await DidKeyResolver.generate();
      const bob = await DidKeyResolver.generate();
      const carol = await DidKeyResolver.generate();

      // Bob has the chat protocol installed
      const protocolDefinition = threadRoleProtocolDefinition;
      const protocol = threadRoleProtocolDefinition.protocol;
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author: bob,
        protocolDefinition
      });
      const protocolsConfigureReply = await dwn.processMessage(bob.did, protocolsConfig.message);
      expect(protocolsConfigureReply.status.code).to.equal(202);

      // Bob starts a chat thread
      const threadRecord = await TestDataGenerator.generateRecordsWrite({
        author       : bob,
        protocol     : protocolDefinition.protocol,
        protocolPath : 'thread',
      });
      const threadRoleReply = await dwn.processMessage(bob.did, threadRecord.message, threadRecord.dataStream);
      expect(threadRoleReply.status.code).to.equal(202);

      // Bob adds Alice as a participant in the thread
      const participantRoleRecord = await TestDataGenerator.generateRecordsWrite({
        author       : bob,
        recipient    : alice.did,
        protocol     : protocolDefinition.protocol,
        protocolPath : 'thread/participant',
        contextId    : threadRecord.message.contextId,
        parentId     : threadRecord.message.recordId,
        data         : new TextEncoder().encode('Alice is my friend'),
      });
      const participantRoleReply = await dwn.processMessage(bob.did, participantRoleRecord.message, participantRoleRecord.dataStream);
      expect(participantRoleReply.status.code).to.equal(202);

      // Bob writes a chat message in the thread
      const chatRecord = await TestDataGenerator.generateRecordsWrite({
        author       : bob,
        protocol     : protocolDefinition.protocol,
        protocolPath : 'thread/chat',
        contextId    : threadRecord.message.contextId,
        parentId     : threadRecord.message.recordId,
      });
      const chatRecordReply = await dwn.processMessage(bob.did, chatRecord.message, chatRecord.dataStream);
      expect(chatRecordReply.status.code).to.equal(202);

      // Alice creates a delegated grant for device X to act as Alice.
      const scope: PermissionScope = {
        interface : DwnInterfaceName.Records,
        method    : DwnMethodName.Write,
        protocol
      };

      const grantToDeviceX = await PermissionsGrant.create({
        delegated   : true, // this is a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        description : 'Allow device X to write as me in chat protocol',
        grantedBy   : alice.did,
        grantedTo   : deviceX.did,
        grantedFor  : alice.did,
        scope       : scope,
        signer      : Jws.createSigner(alice)
      });

      // sanity verify Bob himself is able to query for the chat thread from Bob's DWN
      const recordsQueryByBob = await TestDataGenerator.generateRecordsQuery({
        author : bob,
        filter : { protocol }
      });
      const bobRecordsQueryReply = await dwn.processMessage(bob.did, recordsQueryByBob.message);
      expect(bobRecordsQueryReply.status.code).to.equal(200);
      expect(bobRecordsQueryReply.entries?.length).to.equal(3);

      // sanity verify Alice herself is able to query for the chat message from Bob's DWN
      const recordsQueryByAlice = await RecordsQuery.create({
        signer       : Jws.createSigner(alice),
        protocolRole : 'thread/participant',
        filter       : {
          protocol,
          contextId    : threadRecord.message.contextId,
          protocolPath : 'thread/chat'
        }
      });
      const aliceRecordsQueryReply = await dwn.processMessage(bob.did, recordsQueryByAlice.message);
      expect(aliceRecordsQueryReply.status.code).to.equal(200);
      expect(aliceRecordsQueryReply.entries?.length).to.equal(1);

      // verify device X is able to query for the chat message from Bob's DWN
      const recordsQueryByDeviceX = await RecordsQuery.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : grantToDeviceX.asDelegatedGrant(),
        protocolRole   : 'thread/participant',
        filter         : {
          protocol,
          contextId    : threadRecord.message.contextId,
          protocolPath : 'thread/chat'
        }
      });
      const deviceXRecordsQueryReply = await dwn.processMessage(bob.did, recordsQueryByDeviceX.message);
      expect(deviceXRecordsQueryReply.status.code).to.equal(200);
      expect(deviceXRecordsQueryReply.entries?.length).to.equal(1);

      // verify device X is able to read the chat message from Bob's DWN
      const recordsReadByDeviceX = await RecordsRead.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : grantToDeviceX.asDelegatedGrant(),
        protocolRole   : 'thread/participant',
        filter         : {
          recordId: chatRecord.message.recordId
        }
      });
      const deviceXRecordsReadReply = await dwn.processMessage(bob.did, recordsReadByDeviceX.message);
      expect(deviceXRecordsReadReply.status.code).to.equal(200);
      expect(deviceXRecordsReadReply.record?.recordId).to.equal(chatRecord.message.recordId);

      // Verify that Carol cannot query as Alice by invoking the delegated grant granted to Device X
      const recordsQueryByCarol = await RecordsQuery.create({
        signer         : Jws.createSigner(carol),
        delegatedGrant : grantToDeviceX.asDelegatedGrant(),
        protocolRole   : 'thread/participant',
        filter         : {
          protocol,
          contextId    : threadRecord.message.contextId,
          protocolPath : 'thread/chat'
        }
      });
      const recordsQueryByCarolReply = await dwn.processMessage(bob.did, recordsQueryByCarol.message);
      expect(recordsQueryByCarolReply.status.code).to.equal(400);
      expect(recordsQueryByCarolReply.status.detail).to.contain(DwnErrorCode.RecordsValidateIntegrityGrantedToAndSignerMismatch);

      // Verify that Carol cannot read as Alice by invoking the delegated grant granted to Device X
      const recordsReadByCarol = await RecordsRead.create({
        signer         : Jws.createSigner(carol),
        delegatedGrant : grantToDeviceX.asDelegatedGrant(),
        protocolRole   : 'thread/participant',
        filter         : {
          recordId: chatRecord.message.recordId
        }
      });
      const recordsReadByCarolReply = await dwn.processMessage(bob.did, recordsReadByCarol.message);
      expect(recordsReadByCarolReply.status.code).to.equal(400);
      expect(recordsQueryByCarolReply.status.detail).to.contain(DwnErrorCode.RecordsValidateIntegrityGrantedToAndSignerMismatch);
    });

    it('should only allow entity invoking a valid delegated grant to delete', async () => {
      // scenario:
      // 1. Bob installs the chat protocol on his DWN and makes Alice an admin
      // 2. Bob starts a chat thread with Carol on his DWN
      // 3. Alice creates a delegated grant for Device X to act as her
      // 4. Carol should not be able to delete a chat message as Alice using Device X's delegated grant
      // 5. Device X should be able to delete a chat message as Alice
      const alice = await DidKeyResolver.generate();
      const deviceX = await DidKeyResolver.generate();
      const bob = await DidKeyResolver.generate();
      const carol = await DidKeyResolver.generate();

      // Bob has the chat protocol installed
      const protocolDefinition = threadRoleProtocolDefinition;
      const protocol = threadRoleProtocolDefinition.protocol;
      const protocolsConfig = await TestDataGenerator.generateProtocolsConfigure({
        author: bob,
        protocolDefinition
      });
      const protocolsConfigureReply = await dwn.processMessage(bob.did, protocolsConfig.message);
      expect(protocolsConfigureReply.status.code).to.equal(202);

      // Bob adds Alice as an admin
      const globalAdminRecord = await TestDataGenerator.generateRecordsWrite({
        author       : bob,
        recipient    : alice.did,
        protocol     : protocolDefinition.protocol,
        protocolPath : 'globalAdmin',
        data         : new TextEncoder().encode('I trust Alice to manage my chat thread'),
      });
      const globalAdminRecordReply = await dwn.processMessage(bob.did, globalAdminRecord.message, globalAdminRecord.dataStream);
      expect(globalAdminRecordReply.status.code).to.equal(202);

      // Bob starts a chat thread
      const threadRecord = await TestDataGenerator.generateRecordsWrite({
        author       : bob,
        protocol     : protocolDefinition.protocol,
        protocolPath : 'thread',
      });
      const threadRoleReply = await dwn.processMessage(bob.did, threadRecord.message, threadRecord.dataStream);
      expect(threadRoleReply.status.code).to.equal(202);

      // Bob adds Carol as a participant in the thread
      const participantRoleRecord = await TestDataGenerator.generateRecordsWrite({
        author       : bob,
        recipient    : carol.did,
        protocol     : protocolDefinition.protocol,
        protocolPath : 'thread/participant',
        contextId    : threadRecord.message.contextId,
        parentId     : threadRecord.message.recordId
      });
      const participantRoleReply = await dwn.processMessage(bob.did, participantRoleRecord.message, participantRoleRecord.dataStream);
      expect(participantRoleReply.status.code).to.equal(202);

      // Carol writes a chat message in the thread
      const chatRecord = await TestDataGenerator.generateRecordsWrite({
        author       : carol,
        protocolRole : 'thread/participant',
        protocol     : protocolDefinition.protocol,
        protocolPath : 'thread/chat',
        contextId    : threadRecord.message.contextId,
        parentId     : threadRecord.message.recordId,
        data         : new TextEncoder().encode('A rude message'),
      });
      const chatRecordReply = await dwn.processMessage(bob.did, chatRecord.message, chatRecord.dataStream);
      expect(chatRecordReply.status.code).to.equal(202);

      // Alice creates a delegated grant for device X to act as Alice.
      const scope: PermissionScope = {
        interface : DwnInterfaceName.Records,
        method    : DwnMethodName.Write,
        protocol
      };

      const grantToDeviceX = await PermissionsGrant.create({
        delegated   : true, // this is a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        description : 'Allow device X to write as me in chat protocol',
        grantedBy   : alice.did,
        grantedTo   : deviceX.did,
        grantedFor  : alice.did,
        scope       : scope,
        signer      : Jws.createSigner(alice)
      });

      // verify Carol is not able to delete Carol's chat message from Bob's DWN
      const recordsDeleteByCarol = await RecordsDelete.create({
        signer         : Jws.createSigner(carol),
        delegatedGrant : grantToDeviceX.asDelegatedGrant(),
        protocolRole   : 'thread/participant',
        recordId       : chatRecord.message.recordId
      });
      const carolRecordsDeleteReply = await dwn.processMessage(bob.did, recordsDeleteByCarol.message);
      expect(carolRecordsDeleteReply.status.code).to.equal(400);

      // sanity verify the chat message is still in Bob's DWN
      const recordsQueryByBob = await TestDataGenerator.generateRecordsQuery({
        author : bob,
        filter : { protocolPath: 'thread/chat' }
      });
      const bobRecordsQueryReply = await dwn.processMessage(bob.did, recordsQueryByBob.message);
      expect(bobRecordsQueryReply.status.code).to.equal(200);
      expect(bobRecordsQueryReply.entries?.length).to.equal(1);

      // verify device X is able to delete Carol's chat message from Bob's DWN
      const recordsDeleteByDeviceX = await RecordsDelete.create({
        signer         : Jws.createSigner(deviceX),
        delegatedGrant : grantToDeviceX.asDelegatedGrant(),
        protocolRole   : 'globalAdmin',
        recordId       : chatRecord.message.recordId
      });
      const deviceXRecordsDeleteReply = await dwn.processMessage(bob.did, recordsDeleteByDeviceX.message);
      expect(deviceXRecordsDeleteReply.status.code).to.equal(202);

      // sanity verify the chat message is no longer queryable from Bob's DWN
      const bobRecordsQueryReply2 = await dwn.processMessage(bob.did, recordsQueryByBob.message);
      expect(bobRecordsQueryReply2.status.code).to.equal(200);
      expect(bobRecordsQueryReply2.entries?.length).to.equal(0);
    });

    xit('should not allow entity using a non-delegated grant as a delegated grant to invoke write', async () => {
    });

    xit('should not allow entity using a non-delegated grant as a delegated grant to invoke read', async () => {
    });

    xit('should not allow entity using a non-delegated grant as a delegated grant to invoke query', async () => {
    });

    xit('should not allow entity using a non-delegated grant as a delegated grant to invoke delete', async () => {
    });

    xit('should evaluate scoping correctly when invoking a delegated grant to write', async () => {
    });

    xit('should evaluate scoping correctly when invoking a delegated grant to read', async () => {
    });

    xit('should evaluate scoping correctly when invoking a delegated grant to query', async () => {
    });

    xit('should evaluate scoping correctly when invoking a delegated grant to delete', async () => {
    });

    xit('should not be able to create a RecordsWrite with a non-delegated grant assigned to `authorDelegatedGrant`', async () => {
    });

    xit('should fail if presented with a delegated grant with invalid grantor signature', async () => {
    });

    xit('should fail if presented with a delegated grant with mismatching grant ID in the payload of the message signature', async () => {
    });
  });
}
