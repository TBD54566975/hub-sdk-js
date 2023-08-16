import type { MessageStore } from '../types/message-store.js';
import type { RecordsPermissionScope } from '../types/permissions-types.js';
import type { RecordsRead } from '../interfaces/records-read.js';
import type { RecordsWrite } from '../interfaces/records-write.js';

import { GrantAuthorization } from './grant-authorization.js';
import { DwnError, DwnErrorCode } from './dwn-error.js';

export class RecordsGrantAuthorization {
  public static async authorizeWrite(
    tenant: string,
    incomingMessage: RecordsWrite,
    author: string,
    messageStore: MessageStore,
  ): Promise<void> {
    // authorize generic message
    const permissionsGrantMessage = await GrantAuthorization.authorizeGenericMessage(tenant, incomingMessage, author, messageStore);

    const grantScope = permissionsGrantMessage.descriptor.scope as RecordsPermissionScope;

    if (RecordsGrantAuthorization.isUnrestrictedScope(grantScope)) {
      // scope has no restrictions beyond interface and method. Message is authorized to access any record.
      return;
    } else if (incomingMessage.message.descriptor.protocol !== undefined) {
      // authorization of protocol records must have grants that explicitly include the protocol
      RecordsGrantAuthorization.authorizeProtocolRecord(incomingMessage, grantScope);
    } else {
      RecordsGrantAuthorization.authorizeFlatRecord(incomingMessage, grantScope);
    }
  }

  /**
   * Authorizes the scope of a PermissionsGrant for RecordsRead.
   */
  public static async authorizeRead(
    tenant: string,
    incomingMessage: RecordsRead,
    newestRecordsWrite: RecordsWrite,
    author: string,
    messageStore: MessageStore,
  ): Promise<void> {

    // authorize generic message
    const permissionsGrantMessage = await GrantAuthorization.authorizeGenericMessage(tenant, incomingMessage, author, messageStore);

    const grantScope = permissionsGrantMessage.descriptor.scope as RecordsPermissionScope;

    if (RecordsGrantAuthorization.isUnrestrictedScope(grantScope)) {
      // scope has no restrictions beyond interface and method. Message is authorized to access any record.
      return;
    } else if (newestRecordsWrite.message.descriptor.protocol !== undefined) {
      // authorization of protocol records must have grants that explicitly include the protocol
      RecordsGrantAuthorization.authorizeProtocolRecord(newestRecordsWrite, grantScope);
    } else {
      RecordsGrantAuthorization.authorizeFlatRecord(newestRecordsWrite, grantScope);
    }
  }

  /**
   * Authorizes a grant scope for a protocol record
   */
  private static authorizeProtocolRecord(
    recordsWrite: RecordsWrite,
    grantScope: RecordsPermissionScope
  ): void {
    if (grantScope.protocol === undefined) {
      throw new DwnError(
        DwnErrorCode.RecordsGrantAuthorizationScopeNotProtocol,
        'Grant for protocol record must specify protocol in its scope'
      );
    } else if (grantScope.protocol !== recordsWrite.message.descriptor.protocol) {
      throw new DwnError(
        DwnErrorCode.RecordsGrantAuthorizationScopeProtocolMismatch,
        `Grant scope specifies different protocol than in record with recordId ${recordsWrite.message.recordId}`
      );
    }
  }

  /**
   * Authorizes a grant scope for a non-protocol record
   */
  private static authorizeFlatRecord(
    recordsWrite: RecordsWrite,
    grantScope: RecordsPermissionScope
  ): void {
    if (grantScope.schema !== undefined) {
      if (grantScope.schema !== recordsWrite.message.descriptor.schema) {
        throw new DwnError(
          DwnErrorCode.RecordsGrantAuthorizationScopeSchema,
          `Record does not have schema in PermissionsGrant scope with schema '${grantScope.schema}'`
        );
      }
    }
  }

  /**
   * Checks if scope has no restrictions beyond interface and method.
   * Grant-holder is authorized to access any record.
   */
  private static isUnrestrictedScope(grantScope: RecordsPermissionScope): boolean {
    return grantScope.protocol === undefined &&
           grantScope.schema === undefined;
  }
}
