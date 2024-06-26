import type { GenericMessage } from '../types/message-types.js';
import type { MessagesGetMessage } from '../types/messages-types.js';
import type { MessagesPermissionScope } from '../types/permission-types.js';
import type { MessageStore } from '../types/message-store.js';
import type { PermissionGrant } from '../protocols/permission-grant.js';
import type { ProtocolsConfigureMessage } from '../types/protocols-types.js';
import type { DataEncodedRecordsWriteMessage, RecordsDeleteMessage, RecordsWriteMessage } from '../types/records-types.js';

import { DwnInterfaceName } from '../enums/dwn-interface-method.js';
import { GrantAuthorization } from './grant-authorization.js';
import { PermissionsProtocol } from '../protocols/permissions.js';
import { Records } from '../utils/records.js';
import { RecordsWrite } from '../interfaces/records-write.js';
import { DwnError, DwnErrorCode } from './dwn-error.js';

export class MessagesGrantAuthorization {

  /**
   * Authorizes a MessagesGetMessage using the given permission grant.
   * @param messageStore Used to check if the given grant has been revoked; and to fetch related RecordsWrites if needed.
   */
  public static async authorizeMessagesGet(input: {
    messagesGetMessage: MessagesGetMessage,
    messageToGet: GenericMessage,
    expectedGrantor: string,
    expectedGrantee: string,
    permissionGrant: PermissionGrant,
    messageStore: MessageStore,
  }): Promise<void> {
    const {
      messagesGetMessage, messageToGet, expectedGrantor, expectedGrantee, permissionGrant, messageStore
    } = input;

    await GrantAuthorization.performBaseValidation({
      incomingMessage: messagesGetMessage,
      expectedGrantor,
      expectedGrantee,
      permissionGrant,
      messageStore
    });

    const scope = permissionGrant.scope as MessagesPermissionScope;
    await MessagesGrantAuthorization.verifyScope(expectedGrantor, messageToGet, scope, messageStore);
  }

  /**
   * Verifies the given record against the scope of the given grant.
   */
  private static async verifyScope(
    tenant: string,
    messageToGet: GenericMessage,
    incomingScope: MessagesPermissionScope,
    messageStore: MessageStore,
  ): Promise<void> {
    if (incomingScope.protocol === undefined) {
      // if no protocol is specified in the scope, then the grant is for all records
      return;
    }

    if (messageToGet.descriptor.interface === DwnInterfaceName.Records) {
      // if the message is a Records interface message, get the RecordsWrite message associated with the record
      const recordsMessage = messageToGet as RecordsWriteMessage | RecordsDeleteMessage;
      const recordsWriteMessage = Records.isRecordsWrite(recordsMessage) ? recordsMessage :
        await RecordsWrite.fetchNewestRecordsWrite(messageStore, tenant, recordsMessage.descriptor.recordId);

      if (recordsWriteMessage.descriptor.protocol === incomingScope.protocol) {
        // the record protocol matches the incoming scope protocol
        return;
      }

      // we check if the protocol is the internal PermissionsProtocol for further validation
      if (recordsWriteMessage.descriptor.protocol === PermissionsProtocol.uri) {
        // get the permission scope from the permission message
        const permissionScope = await PermissionsProtocol.getScopeFromPermissionRecord(
          tenant,
          messageStore,
          recordsWriteMessage as DataEncodedRecordsWriteMessage
        );

        if (PermissionsProtocol.hasProtocolScope(permissionScope) && permissionScope.protocol === incomingScope.protocol) {
          // the permissions record scoped protocol matches the incoming scope protocol
          return;
        }
      }
    } else if (messageToGet.descriptor.interface === DwnInterfaceName.Protocols) {
      // if the message is a protocol message, it must be a `ProtocolConfigure` message
      const protocolsConfigureMessage = messageToGet as ProtocolsConfigureMessage;
      const configureProtocol = protocolsConfigureMessage.descriptor.definition.protocol;
      if (configureProtocol === incomingScope.protocol) {
        // the configured protocol matches the incoming scope protocol
        return;
      }
    }

    throw new DwnError(DwnErrorCode.MessagesGetVerifyScopeFailed, 'record message failed scope authorization');
  }
}