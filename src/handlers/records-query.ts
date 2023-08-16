import type { MethodHandler } from '..//types/method-handler.js';
import type { RecordsWriteMessageWithOptionalEncodedData } from '../store/storage-controller.js';
import type { DataStore, DidResolver, MessageStore } from '../index.js';
import type { RecordsQueryMessage, RecordsQueryReply, RecordsQueryReplyEntry } from '../types/records-types.js';

import { authenticate } from '../core/auth.js';
import { messageReplyFromError } from '../core/message-reply.js';
import { Records } from '../utils/records.js';

import { RecordsQuery } from '../interfaces/records-query.js';
import { DwnInterfaceName, DwnMethodName } from '../core/message.js';

export class RecordsQueryHandler implements MethodHandler {

  constructor(private didResolver: DidResolver, private messageStore: MessageStore, private dataStore: DataStore) { }

  public async handle({
    tenant,
    message
  }: {tenant: string, message: RecordsQueryMessage}): Promise<RecordsQueryReply> {
    let recordsQuery: RecordsQuery;
    try {
      recordsQuery = await RecordsQuery.parse(message);
    } catch (e) {
      return messageReplyFromError(e, 400);
    }

    let recordsWrites: RecordsWriteMessageWithOptionalEncodedData[];

    // if this is an anonymous query, query only published records
    if (recordsQuery.author === undefined) {
      recordsWrites = await this.fetchPublishedRecords(tenant, recordsQuery);
    } else {
      // authentication
      try {
        await authenticate(message.authorization!, this.didResolver);
      } catch (e) {
        return messageReplyFromError(e, 401);
      }

      if (recordsQuery.author === tenant) {
        recordsWrites = await this.fetchRecordsAsOwner(tenant, recordsQuery);
      } else {
        recordsWrites = await this.fetchRecordsAsNonOwner(tenant, recordsQuery);
      }
    }

    const entries = RecordsQueryHandler.removeAuthorization(recordsWrites);

    return {
      status: { code: 200, detail: 'OK' },
      entries
    };
  }

  /**
   * Removes `authorization` property from each and every `RecordsWrite` message given and returns the result as a different array.
   */
  private static removeAuthorization(recordsWriteMessages: RecordsWriteMessageWithOptionalEncodedData[]): RecordsQueryReplyEntry[] {
    const recordsQueryReplyEntries: RecordsQueryReplyEntry[] = [];
    for (const record of recordsWriteMessages) {
      const { authorization: _, ...objectWithRemainingProperties } = record; // a trick to stripping away `authorization`
      recordsQueryReplyEntries.push(objectWithRemainingProperties);
    }

    return recordsQueryReplyEntries;
  }

  /**
   * Fetches the records as the owner of the DWN with no additional filtering.
   */
  private async fetchRecordsAsOwner(tenant: string, recordsQuery: RecordsQuery): Promise<RecordsWriteMessageWithOptionalEncodedData[]> {
    const { dateSort, filter: queryFilter } = recordsQuery.message.descriptor;
    // fetch all published records matching the query
    const filter = {
      ...Records.convertFilter(queryFilter),
      interface         : DwnInterfaceName.Records,
      method            : DwnMethodName.Write,
      isLatestBaseState : true
    };

    const records = (await this.messageStore.query(tenant, filter, dateSort)) as RecordsWriteMessageWithOptionalEncodedData[];
    return records;
  }

  /**
   * Fetches the records as a non-owner, return only:
   * 1. published records; and
   * 2. unpublished records intended for the query author (where `recipient` is the query author)
   */
  private async fetchRecordsAsNonOwner(tenant: string, recordsQuery: RecordsQuery)
    : Promise<RecordsWriteMessageWithOptionalEncodedData[]> {
    const publishedRecords = await this.fetchPublishedRecords(tenant, recordsQuery);
    const unpublishedRecordsByAuthor = await this.fetchUnpublishedRecordsByAuthor(tenant, recordsQuery);

    // the `RecordsQuery` author in addition is allowed to get private records that were meant for them
    let unpublishedRecordsForQueryAuthor: RecordsWriteMessageWithOptionalEncodedData[] = [];
    const recipientFilter = recordsQuery.message.descriptor.filter.recipient;
    if (recipientFilter === undefined || recipientFilter === recordsQuery.author) {
      unpublishedRecordsForQueryAuthor = await this.fetchUnpublishedRecordsForQueryAuthor(tenant, recordsQuery);
    }

    const records = [...publishedRecords, ...unpublishedRecordsByAuthor, ...unpublishedRecordsForQueryAuthor];

    // go through the records and remove duplicates
    // this can happen between `unpublishedRecordsByAuthor` and `unpublishedRecordsForQueryAuthor` when `author` = `recipient`
    const deduplicatedRecords = new Map<string, RecordsWriteMessageWithOptionalEncodedData>();
    for (const record of records) {
      if (!deduplicatedRecords.has(record.recordId)) {
        deduplicatedRecords.set(record.recordId, record);
      }
    }

    return Array.from(deduplicatedRecords.values());
  }

  /**
   * Fetches only published records.
   */
  private async fetchPublishedRecords(tenant: string, recordsQuery: RecordsQuery): Promise<RecordsWriteMessageWithOptionalEncodedData[]> {
    const { dateSort, filter: queryFilter } = recordsQuery.message.descriptor;
    // fetch all published records matching the query
    const filter = {
      ...Records.convertFilter(queryFilter),
      interface         : DwnInterfaceName.Records,
      method            : DwnMethodName.Write,
      published         : true,
      isLatestBaseState : true
    };

    const publishedRecords = (await this.messageStore.query(tenant, filter, dateSort)) as RecordsWriteMessageWithOptionalEncodedData[];
    return publishedRecords;
  }

  /**
   * Fetches unpublished records that are intended for the query author (where `recipient` is the author).
   */
  private async fetchUnpublishedRecordsForQueryAuthor(tenant: string, recordsQuery: RecordsQuery)
    : Promise<RecordsWriteMessageWithOptionalEncodedData[]> {

    const { dateSort, filter: queryFilter } = recordsQuery.message.descriptor;
    // include records where recipient is query author
    const filter = {
      ...Records.convertFilter(queryFilter),
      interface         : DwnInterfaceName.Records,
      method            : DwnMethodName.Write,
      recipient         : recordsQuery.author!,
      isLatestBaseState : true,
      published         : false
    };

    const unpublishedRecordsForQueryAuthor =
      (await this.messageStore.query(tenant, filter, dateSort)) as RecordsWriteMessageWithOptionalEncodedData[];
    return unpublishedRecordsForQueryAuthor;
  }

  /**
   * Fetches only unpublished records where the author is the same as the query author.
   */
  private async fetchUnpublishedRecordsByAuthor(tenant: string, recordsQuery: RecordsQuery)
    : Promise<RecordsWriteMessageWithOptionalEncodedData[]> {

    const { dateSort, filter: queryFilter } = recordsQuery.message.descriptor;
    // include records where author is the same as the query author
    const filter = {
      ...Records.convertFilter(queryFilter),
      author            : recordsQuery.author!,
      interface         : DwnInterfaceName.Records,
      method            : DwnMethodName.Write,
      isLatestBaseState : true,
      published         : false
    };

    const unpublishedRecordsForQueryAuthor =
      (await this.messageStore.query(tenant, filter, dateSort)) as RecordsWriteMessageWithOptionalEncodedData[];
    return unpublishedRecordsForQueryAuthor;
  }
}