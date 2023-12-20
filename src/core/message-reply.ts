import type { MessagesGetReplyEntry } from '../types/messages-types.js';
import type { QueryResultEntry } from '../types/message-types.js';
import type { RecordsWriteReply } from '../types/records-types.js';

type Status = {
  code: number
  detail: string
};

export type GenericMessageReply = {
  status: Status;
};

export function messageReplyFromError(e: unknown, code: number): GenericMessageReply {

  const detail = e instanceof Error ? e.message : 'Error';

  return { status: { code, detail } };
}

/**
 * Catch-all message reply type. It is recommended to use GenericMessageReply or a message-specific reply type wherever possible.
 */
export type UnionMessageReply = GenericMessageReply & {
  /**
   * Resulting message entries or events returned from the invocation of the corresponding message.
   * e.g. the resulting messages from a RecordsQuery
   * Mutually exclusive with `data`.
   */
  entries?: QueryResultEntry[] | MessagesGetReplyEntry[] | string[];

  /**
   * Record corresponding to the message received if applicable (e.g. RecordsRead).
   * Mutually exclusive with `entries` and `cursor`.
   */
  record?: RecordsWriteReply;

  /**
   * A cursor for pagination if applicable (e.g. RecordsQuery).
   * Mutually exclusive with `data`.
   */
  cursor?: string;
};