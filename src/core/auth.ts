import type { DidResolver } from '../did/did-resolver.js';
import type { MessageInterface } from '../types/message-interface.js';
import type { AuthorizationModel, GenericMessage } from '../types/message-types.js';

import { GeneralJwsVerifier } from '../jose/jws/general/verifier.js';
import { PermissionsGrant } from '../interfaces/permissions-grant.js';
import { DwnError, DwnErrorCode } from './dwn-error.js';

/**
 * Verifies all the signature(s) within the authorization property.
 *
 * @throws {Error} if fails authentication
 */
export async function authenticate(authorizationModel: AuthorizationModel | undefined, didResolver: DidResolver): Promise<void> {

  if (authorizationModel === undefined) {
    throw new DwnError(DwnErrorCode.AuthenticateJwsMissing, 'Missing JWS.');
  }

  await GeneralJwsVerifier.verifySignatures(authorizationModel.signature, didResolver);

  if (authorizationModel.ownerSignature !== undefined) {
    await GeneralJwsVerifier.verifySignatures(authorizationModel.ownerSignature, didResolver);
  }

  if (authorizationModel.authorDelegatedGrant !== undefined) {
    // verify the signature of the grantor of the delegated grant
    const authorDelegatedGrant = await PermissionsGrant.parse(authorizationModel.authorDelegatedGrant);
    await GeneralJwsVerifier.verifySignatures(authorDelegatedGrant.message.authorization.signature, didResolver);
  }
}

/**
 * Authorizes owner authored message.
 * @throws {DwnError} if fails authorization.
 */
export async function authorizeOwner(tenant: string, incomingMessage: MessageInterface<GenericMessage>): Promise<void> {
  // if author is the same as the target tenant, we can directly grant access
  if (incomingMessage.author === tenant) {
    return;
  } else {
    throw new DwnError(
      DwnErrorCode.AuthorizationAuthorNotOwner,
      `Message authored by ${incomingMessage.author}, not authored by expected owner ${tenant}.`
    );
  }
}
