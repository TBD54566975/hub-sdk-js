import type { Filter, KeyValues } from './query-types.js';

export type GetEventsOptions = {
  cursor: string
};

export interface EventLog {
 /**
  * opens a connection to the underlying store
  */
  open(): Promise<void>;

  /**
   * closes the connection to the underlying store
   */
  close(): Promise<void>;

  /**
   * adds an event to a tenant's event log
   * @param tenant - the tenant's DID
   * @param messageCid - the CID of the message
   * @param indexes - (key-value pairs) to be included as part of indexing this event.
   */
  append(tenant: string, messageCid: string, indexes: KeyValues): Promise<void>

  /**
   * Retrieves all of a tenant's events that occurred after the cursor provided.
   * If no cursor is provided, all events for a given tenant will be returned.
   *
   * The cursor is a messageCid.
   *
   * Returns an array of messageCids that represent the events.
   */
  getEvents(tenant: string, options?: GetEventsOptions): Promise<string[]>

  /**
   * retrieves a filtered set of events that occurred after a the cursor provided, accepts multiple filters.
   *
   * If no cursor is provided, all events for a given tenant and filter combo will be returned.
   * The cursor is a messageCid.
   *
   * Returns an array of messageCids that represent the events.
   */
  queryEvents(tenant: string, filters: Filter[], cursor?: string): Promise<string[]>

  /**
   * deletes any events that have any of the messageCids provided
   * @returns {Promise<number>} the number of events deleted
   */
  deleteEventsByCid(tenant: string, messageCids: Array<string>): Promise<void>

  /**
   * Clears the entire store. Mainly used for cleaning up in test environment.
   */
  clear(): Promise<void>;
}