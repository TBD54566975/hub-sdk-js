import type { DIDMethodResolver } from './did/did-resolver';
import type { Interface, MethodHandler } from './interfaces/types';
import type { BaseMessageSchema, RequestSchema } from './core/types';
import type { HandlersWriteSchema } from './interfaces/handlers/types';
import type { MessageStore } from './store/message-store';

import { addSchema } from './validation/validator';
import { CollectionsInterface, PermissionsInterface } from './interfaces';
import { DIDResolver } from './did/did-resolver';
import { IonDidResolver } from './did/ion-did-resolver';
import { Message, MessageReply, Request, Response } from './core';
import { MessageStoreLevel } from './store/message-store-level';

export class DWN {
  static methodHandlers: { [key:string]: MethodHandler } = {
    ...CollectionsInterface.methodHandlers,
    ...PermissionsInterface.methodHandlers
  };

  DIDResolver: DIDResolver;
  messageStore: MessageStore;

  private constructor(config: Config) {
    this.DIDResolver = new DIDResolver(config.DIDMethodResolvers);
    this.messageStore = config.messageStore;
  }

  static async create(config: Config): Promise<DWN> {
    config.messageStore = config.messageStore || new MessageStoreLevel();
    config.DIDMethodResolvers = config.DIDMethodResolvers || [new IonDidResolver()];
    config.interfaces = config.interfaces || [];

    for (const { methodHandlers, schemas } of config.interfaces) {

      for (const messageType in methodHandlers) {
        if (DWN.methodHandlers[messageType]) {
          throw new Error(`methodHandler already exists for ${messageType}`);
        } else {
          DWN.methodHandlers[messageType] = methodHandlers[messageType];
        }
      }

      for (const schemaName in schemas) {
        addSchema(schemaName, schemas[schemaName]);
      }
    }

    const dwn = new DWN(config);
    await dwn.open();

    return dwn;
  }

  private async open(): Promise<void> {
    return this.messageStore.open();
  }

  async close(): Promise<void> {
    return this.messageStore.close();
  }

  /**
   * Adds a custom event handler.
   */
  async addEventHandler(_handlersWriteMessage: HandlersWriteSchema, _eventHandler: EventHandler): Promise<Response> {
    throw new Error('not implemented');
  }

  async processRequest(rawRequest: Uint8Array): Promise<Response> {
    let request: RequestSchema;
    try {
      const requestString = new TextDecoder().decode(rawRequest);
      request = JSON.parse(requestString);
    } catch {
      throw new Error('expected request to be valid JSON');
    }

    try {
      request = Request.parse(request);
    } catch (e) {
      return new Response({
        status: { code: 400, message: e.message }
      });
    }

    const response = new Response();

    for (const message of request.messages) {
      const result = await this.processMessage(message);
      response.addMessageResult(result);
    }

    return response;
  }

  /**
   * TODO: add docs, Issue #70 https://github.com/TBD54566975/dwn-sdk-js/issues/70
   * @param message
   */
  async processMessage(rawMessage: object): Promise<MessageReply> {
    let message: BaseMessageSchema;

    try {
      message = Message.parse(rawMessage);
    } catch (e) {
      return new MessageReply({
        status: { code: 400, message: e.message }
      });
    }

    const interfaceMethodHandler = DWN.methodHandlers[message.descriptor.method];

    return await interfaceMethodHandler(message, this.messageStore, this.DIDResolver);
  }
};

export type Config = {
  DIDMethodResolvers?: DIDMethodResolver[],
  interfaces?: Interface[];
  messageStore?: MessageStore;
};


/**
 * An event handler that is triggered after a message passes processing flow of:
 * DWN message level schema validation -> authentication -> authorization -> message processing/storage.
 * @param message The message to be handled
 * @returns the response to be returned back to the caller
 */
export interface EventHandler {
  (message: BaseMessageSchema): Promise<Response>;
}