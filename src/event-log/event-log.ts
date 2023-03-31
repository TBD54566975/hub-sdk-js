export type Event = {
  watermark: string,
  messageCid: string
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
   */
  append(tenant: string, messageCid: string): Promise<string>

  /**
   * retrieves all of a tenant's events that occurred after the watermark provided.
   * If no watermark is provided, all events for a given tenant will be returned.
   *
   * @param tenant
   * @param watermark
   */
  getEventsAfter(tenant: string, watermark?: string): Promise<Array<Event>>
}