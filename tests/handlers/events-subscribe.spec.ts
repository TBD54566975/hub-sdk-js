import type { EventStream } from '../../src/types/subscriptions.js';
import type { DataStore, EventLog, GenericMessage, MessageStore } from '../../src/index.js';

import { DidKeyResolver } from '../../src/did/did-key-resolver.js';
import { DidResolver } from '../../src/did/did-resolver.js';
import { Dwn } from '../../src/dwn.js';
import { DwnErrorCode } from '../../src/core/dwn-error.js';
import { EventsSubscribe } from '../../src/interfaces/events-subscribe.js';
import { Jws } from '../../src/utils/jws.js';
import { Message } from '../../src/core/message.js';
import { TestDataGenerator } from '../utils/test-data-generator.js';
import { TestEventStream } from '../test-event-stream.js';
import { TestStores } from '../test-stores.js';

import sinon from 'sinon';
import chai, { expect } from 'chai';

import chaiAsPromised from 'chai-as-promised';
import { EventsSubscribeHandler } from '../../src/handlers/events-subscribe.js';
chai.use(chaiAsPromised);

export function testEventsSubscribeHandler(): void {
  describe('EventsSubscribe.handle()', () => {

    describe('EventStream disabled',() => {
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

        dwn = await Dwn.create({
          didResolver,
          messageStore,
          dataStore,
          eventLog,
        });

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

      it('should respond with a 501 if subscriptions are not supported', async () => {
        await dwn.close(); // close the original dwn instance
        dwn = await Dwn.create({ didResolver, messageStore, dataStore, eventLog }); // leave out eventStream

        const alice = await DidKeyResolver.generate();
        // attempt to subscribe
        const { message } = await EventsSubscribe.create({ signer: Jws.createSigner(alice) });
        const subscriptionMessageReply = await dwn.processMessage(alice.did, message, { handler: (_) => {} });
        expect(subscriptionMessageReply.status.code).to.equal(501, subscriptionMessageReply.status.detail);
        expect(subscriptionMessageReply.status.detail).to.include(DwnErrorCode.EventsSubscribeEventStreamUnimplemented);
      });

    });

    describe('EventStream enabled', () => {
      let didResolver: DidResolver;
      let messageStore: MessageStore;
      let dataStore: DataStore;
      let eventLog: EventLog;
      let eventStream: EventStream;
      let dwn: Dwn;

      // important to follow the `before` and `after` pattern to initialize and clean the stores in tests
      // so that different test suites can reuse the same backend store for testing
      before(async () => {
        didResolver = new DidResolver([new DidKeyResolver()]);

        const stores = TestStores.get();
        messageStore = stores.messageStore;
        dataStore = stores.dataStore;
        eventLog = stores.eventLog;
        eventStream = TestEventStream.get();

        dwn = await Dwn.create({
          didResolver,
          messageStore,
          dataStore,
          eventLog,
          eventStream,
        });

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

      it('returns a 400 if message is invalid', async () => {
        const alice = await DidKeyResolver.generate();
        const { message } = await TestDataGenerator.generateEventsSubscribe({ author: alice });

        // add an invalid property to the descriptor
        (message['descriptor'] as any)['invalid'] = 'invalid';

        const eventsSubscribeHandler = new EventsSubscribeHandler(didResolver, eventStream);

        const reply = await eventsSubscribeHandler.handle({ tenant: alice.did, message, handler: (_) => {} });
        expect(reply.status.code).to.equal(400);
      });


      it('should allow tenant to subscribe their own event stream', async () => {
        const alice = await DidKeyResolver.generate();

        // set up a promise to read later that captures the emitted messageCid
        let handler;
        const messageSubscriptionPromise: Promise<string> = new Promise((resolve) => {
          handler = async (message: GenericMessage):Promise<void> => {
            const messageCid = await Message.getCid(message);
            resolve(messageCid);
          };
        });

        // testing Subscription Request
        const subscriptionRequest = await EventsSubscribe.create({
          signer: Jws.createSigner(alice),
        });
        const subscriptionReply = await dwn.processMessage(alice.did, subscriptionRequest.message, { handler });
        expect(subscriptionReply.status.code).to.equal(200, subscriptionReply.status.detail);
        expect(subscriptionReply.subscription).to.not.be.undefined;

        const messageWrite = await TestDataGenerator.generateRecordsWrite({ author: alice });
        const writeReply = await dwn.processMessage(alice.did, messageWrite.message, { dataStream: messageWrite.dataStream });
        expect(writeReply.status.code).to.equal(202);
        const messageCid = await Message.getCid(messageWrite.message);

        // control: ensure that the event exists
        const events = await eventLog.getEvents(alice.did);
        expect(events.length).to.equal(1);
        expect(events[0]).to.equal(messageCid);

        // await the event
        await expect(messageSubscriptionPromise).to.eventually.equal(messageCid);
      });

      it('should not allow non-tenant to subscribe to an event stream they are not authorized for', async () => {
        const alice = await DidKeyResolver.generate();
        const bob = await DidKeyResolver.generate();

        // test anonymous request
        const anonymousSubscription = await TestDataGenerator.generateEventsSubscribe();
        delete (anonymousSubscription.message as any).authorization;

        const anonymousReply = await dwn.processMessage(alice.did, anonymousSubscription.message);
        expect(anonymousReply.status.code).to.equal(400);
        expect(anonymousReply.status.detail).to.include(`EventsSubscribe: must have required property 'authorization'`);
        expect(anonymousReply.subscription).to.be.undefined;

        // testing Subscription Request
        const subscriptionRequest = await EventsSubscribe.create({
          signer: Jws.createSigner(bob),
        });

        const subscriptionReply = await dwn.processMessage(alice.did, subscriptionRequest.message);
        expect(subscriptionReply.status.code).to.equal(401);
        expect(subscriptionReply.subscription).to.be.undefined;
      });
    });
  });
}