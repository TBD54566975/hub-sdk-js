import type { GenericMessage } from '../types/message-types.js';
import type { MessageStore } from '../types/message-store.js';
import type { PermissionsGrantMessage } from '../types/permissions-types.js';

import { Message } from './message.js';
import { DwnError, DwnErrorCode } from './dwn-error.js';
import { DwnInterfaceName, DwnMethodName } from '../enums/dwn-interface-method.js';

export class GrantAuthorization {

  /**
   * Performs base PermissionsGrant-based authorization against the given message:
   * 1. Validates the `expectedGrantedToInGrant` and `expectedGrantedForInGrant` values against the actual values in given permissions grant.
   * 2. Verifies that the incoming message is within the allowed time frame of the grant, and the grant has not been revoked.
   * 3. Verifies that the `interface` and `method` grant scopes match the incoming message.
   *
   * NOTE: Does not validate grant `conditions` or `scope` beyond `interface` and `method`
   *
   * @param messageStore Used to check if the grant has been revoked.
   * @throws {DwnError} if validation fails
   */
  public static async performBaseValidation(input: {
    incomingMessage: GenericMessage,
    expectedGrantedToInGrant: string,
    expectedGrantedForInGrant: string,
    permissionsGrantMessage: PermissionsGrantMessage,
    messageStore: MessageStore,
    }): Promise<void> {
    const { expectedGrantedForInGrant, incomingMessage, expectedGrantedToInGrant, permissionsGrantMessage, messageStore } = input;

    const incomingMessageDescriptor = incomingMessage.descriptor;
    const permissionsGrantId = await Message.getCid(permissionsGrantMessage);

    GrantAuthorization.verifyExpectedGrantedToAndGrantedFor(expectedGrantedToInGrant, expectedGrantedForInGrant, permissionsGrantMessage);

    // verify that grant is active during incomingMessage's timestamp
    const grantedFor = expectedGrantedForInGrant; // renaming for better readability
    await GrantAuthorization.verifyGrantActive(
      grantedFor,
      incomingMessageDescriptor.messageTimestamp,
      permissionsGrantMessage,
      permissionsGrantId,
      messageStore
    );

    // Check grant scope for interface and method
    await GrantAuthorization.verifyGrantScopeInterfaceAndMethod(
      incomingMessageDescriptor.interface,
      incomingMessageDescriptor.method,
      permissionsGrantMessage,
      permissionsGrantId
    );
  }

  /**
   * Fetches PermissionsGrantMessage with CID `permissionsGrantId`.
   * @returns the PermissionsGrantMessage with CID `permissionsGrantId` if message exists
   * @throws {Error} if PermissionsGrantMessage with CID `permissionsGrantId` does not exist
   */
  public static async fetchGrant(
    tenant: string,
    messageStore: MessageStore,
    permissionsGrantId: string,
  ): Promise<PermissionsGrantMessage> {
    const possibleGrantMessage: GenericMessage | undefined = await messageStore.get(tenant, permissionsGrantId);

    const dwnInterface = possibleGrantMessage?.descriptor.interface;
    const dwnMethod = possibleGrantMessage?.descriptor.method;
    if (possibleGrantMessage === undefined || dwnInterface !== DwnInterfaceName.Permissions || dwnMethod !== DwnMethodName.Grant) {
      throw new DwnError(
        DwnErrorCode.GrantAuthorizationGrantMissing,
        `Could not find PermissionsGrant with CID ${permissionsGrantId}`
      );
    }

    const permissionsGrantMessage = possibleGrantMessage as PermissionsGrantMessage;
    return permissionsGrantMessage;
  }

  /**
   * Verifies the given `expectedGrantedToInGrant` and `expectedGrantedForInGrant` values against
   * the actual `expectedGrantedToInGrant` and `expectedGrantedForInGrant` in given permissions grant.
   * @throws {DwnError} if `expectedGrantedToInGrant` or `expectedGrantedForInGrant` do not match the actual values in the grant.
   */
  private static verifyExpectedGrantedToAndGrantedFor(
    expectedGrantedToInGrant: string,
    expectedGrantedForInGrant: string,
    permissionsGrantMessage: PermissionsGrantMessage
  ): void {

    // Validate `expectedGrantedToInGrant`
    const actualGrantedTo = permissionsGrantMessage.descriptor.grantedTo;
    if (expectedGrantedToInGrant !== actualGrantedTo) {
      throw new DwnError(
        DwnErrorCode.GrantAuthorizationNotGrantedToAuthor,
        `PermissionsGrant has grantedTo ${actualGrantedTo}, but need to be granted to ${expectedGrantedToInGrant}`
      );
    }

    // Validate `expectedGrantedForInGrant`
    const actualGrantedFor = permissionsGrantMessage.descriptor.grantedFor;
    if (expectedGrantedForInGrant !== actualGrantedFor) {
      throw new DwnError(
        DwnErrorCode.GrantAuthorizationNotGrantedForTenant,
        `PermissionsGrant has grantedFor ${actualGrantedFor}, but need to be granted for ${expectedGrantedForInGrant}`
      );
    }
  }

  /**
   * Verify that the incoming message is within the allowed time frame of the grant,
   * and the grant has not been revoked.
   * @param permissionsGrantId Purely being passed as an optimization. Technically can be computed from `permissionsGrantMessage`.
   * @param messageStore Used to check if the grant has been revoked.
   * @throws {DwnError} if incomingMessage has timestamp for a time in which the grant is not active.
   */
  private static async verifyGrantActive(
    grantedFor: string,
    incomingMessageTimestamp: string,
    permissionsGrantMessage: PermissionsGrantMessage,
    permissionsGrantId: string,
    messageStore: MessageStore,
  ): Promise<void> {
    // Check that incomingMessage is within the grant's time frame
    if (incomingMessageTimestamp < permissionsGrantMessage.descriptor.messageTimestamp) {
      // grant is not yet active
      throw new DwnError(
        DwnErrorCode.GrantAuthorizationGrantNotYetActive,
        `The message has a timestamp before the associated PermissionsGrant becomes active`,
      );
    } else if (incomingMessageTimestamp >= permissionsGrantMessage.descriptor.dateExpires) {
      // grant has expired
      throw new DwnError(
        DwnErrorCode.GrantAuthorizationGrantExpired,
        `The message has timestamp after the expiry of the associated PermissionsGrant`,
      );
    }

    // Check if grant has been revoked
    const query = {
      interface : DwnInterfaceName.Permissions,
      method    : DwnMethodName.Revoke,
      permissionsGrantId,
    };
    const { messages: revokes } = await messageStore.query(grantedFor, [query]);
    const oldestExistingRevoke = await Message.getOldestMessage(revokes);

    if (oldestExistingRevoke !== undefined && oldestExistingRevoke.descriptor.messageTimestamp <= incomingMessageTimestamp) {
      throw new DwnError(
        DwnErrorCode.GrantAuthorizationGrantRevoked,
        `PermissionsGrant with CID ${permissionsGrantId} has been revoked`,
      );
    }
  }

  /**
   * Verify that the `interface` and `method` grant scopes match the incoming message
   * @param permissionsGrantId Purely being passed for logging purposes.
   * @throws {DwnError} if the `interface` and `method` of the incoming message do not match the scope of the PermissionsGrant
   */
  private static async verifyGrantScopeInterfaceAndMethod(
    dwnInterface: string,
    dwnMethod: string,
    permissionsGrantMessage: PermissionsGrantMessage,
    permissionsGrantId: string
  ): Promise<void> {
    if (dwnInterface !== permissionsGrantMessage.descriptor.scope.interface) {
      throw new DwnError(
        DwnErrorCode.GrantAuthorizationInterfaceMismatch,
        `DWN Interface of incoming message is outside the scope of PermissionsGrant with CID ${permissionsGrantId}`
      );
    } else if (dwnMethod !== permissionsGrantMessage.descriptor.scope.method) {
      throw new DwnError(
        DwnErrorCode.GrantAuthorizationMethodMismatch,
        `DWN Method of incoming message is outside the scope of PermissionsGrant with CID ${permissionsGrantId}`
      );
    }
  }
}