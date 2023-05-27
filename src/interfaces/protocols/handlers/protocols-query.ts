import type { DwnMessageMap } from '../../../types/dwn-types.js';
import type { MethodHandler } from '../../../types/method-handler.js';
import type { ProtocolsQueryMessage, ProtocolsQueryReply } from '../../../types/protocols-types.js';
import type { QueryResultEntry } from '../../../types/message-types.js';
import type { DataStore, DidResolver, MessageStore } from '../../../index.js';

import { canonicalAuth } from '../../../core/auth.js';
import { ProtocolsQuery } from '../messages/protocols-query.js';
import { removeUndefinedProperties } from '../../../utils/object.js';

import { DwnInterfaceName, DwnMethodName } from '../../../core/message.js';
import { messageReplyFromError } from '../../../core/message-reply.js';

export class ProtocolsQueryHandler implements MethodHandler<'ProtocolsQuery'> {

  constructor(private didResolver: DidResolver, private messageStore: MessageStore,private dataStore: DataStore) { }

  public async handle({
    tenant,
    message
  }: { tenant: string, message: ProtocolsQueryMessage}): Promise<ProtocolsQueryReply> {

    let protocolsQuery: ProtocolsQuery;
    try {
      protocolsQuery = await ProtocolsQuery.parse(message);
    } catch (e) {
      return messageReplyFromError(e, 400);
    }

    try {
      await canonicalAuth(tenant, protocolsQuery, this.didResolver);
    } catch (e) {
      return messageReplyFromError(e, 401);
    }

    const query = {
      interface : DwnInterfaceName.Protocols,
      method    : DwnMethodName.Configure,
      ...message.descriptor.filter
    };
    removeUndefinedProperties(query);

    const messages = await this.messageStore.query(tenant, query);

    // strip away `authorization` property for each record before responding
    const entries: QueryResultEntry[] = [];
    for (const message of messages) {
      const { authorization: _, ...objectWithRemainingProperties } = message; // a trick to stripping away `authorization`
      entries.push(objectWithRemainingProperties);
    }

    return {
      status: { code: 200, detail: 'OK' },
      entries
    };
  };
}
