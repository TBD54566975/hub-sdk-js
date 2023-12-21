import type { GenericMessage } from '../types/message-types.js';
import type { Signer } from '../types/signer.js';
import type { EventsFilter, EventsSubscribeDescriptor, EventsSubscribeMessage } from '../types/events-types.js';

import { AbstractMessage } from '../core/abstract-message.js';
import { Message } from '../core/message.js';
import { removeUndefinedProperties } from '../utils/object.js';
import { Time } from '../utils/time.js';
import { DwnInterfaceName, DwnMethodName } from '../enums/dwn-interface-method.js';


export type EventsSubscribeOptions = {
  messageTimestamp?: string;
  signer?: Signer;
  filters?: EventsFilter[]
  permissionsGrantId?: string;
};

export class EventsSubscribe extends AbstractMessage<EventsSubscribeMessage> {
  public static async parse(message: EventsSubscribeMessage): Promise<EventsSubscribe> {
    if (message.authorization !== undefined) {
      await Message.validateSignatureStructure(message.authorization.signature, message.descriptor);
    }
    Time.validateTimestamp(message.descriptor.messageTimestamp);
    return new EventsSubscribe(message);
  }

  /**
   * Creates a SubscriptionRequest message.
   *
   * @throws {DwnError} when a combination of required SubscriptionRequestOptions are missing
   */
  public static async create(
    options: EventsSubscribeOptions
  ): Promise<EventsSubscribe> {
    const { permissionsGrantId } = options;
    const currentTime = Time.getCurrentTimestamp();

    const descriptor: EventsSubscribeDescriptor = {
      interface        : DwnInterfaceName.Events,
      method           : DwnMethodName.Subscribe,
      filters          : options.filters ?? [],
      messageTimestamp : options.messageTimestamp ?? currentTime,
    };

    removeUndefinedProperties(descriptor);

    // only generate the `authorization` property if signature input is given
    let authorization = undefined;
    if (options.signer !== undefined) {
      authorization = await Message.createAuthorization({
        descriptor,
        permissionsGrantId,
        signer: options.signer
      });
    }
    const message: EventsSubscribeMessage = { descriptor, authorization };
    Message.validateJsonSchema(message);
    return new EventsSubscribe(message);
  }

  public static isEventsSubscribeMessage(message: GenericMessage): message is EventsSubscribeMessage {
    return message.descriptor.interface === DwnInterfaceName.Events && message.descriptor.method === DwnMethodName.Subscribe;
  }
}