import { BaseMessageSchema } from '../../src/core/types';
import { CID } from 'multiformats/cid';
import { CollectionsWrite } from '../../src/interfaces/collections/messages/collections-write';
import { CollectionsQuery } from '../../src/interfaces/collections/messages/collections-query';
import { CollectionsQuerySchema, CollectionsWriteSchema } from '../../src/interfaces/collections/types';
import { ed25519 } from '../../src/jose/algorithms/signing/ed25519';
import { DIDResolutionResult } from '../../src/did/did-resolver';
import { PermissionsRequest } from '../../src/interfaces/permissions/messages/permissions-request';
import { PrivateJwk, PublicJwk } from '../../src/jose/types';
import { removeUndefinedProperties } from '../../src/utils/object';
import { secp256k1 } from '../../src/jose/algorithms/signing/secp256k1';
import { v4 as uuidv4 } from 'uuid';


export type GenerateCollectionWriteMessageInput = {
  targetDid?: string;
  recipientDid?: string;
  requesterDid?: string;
  requesterKeyId?: string;
  requesterKeyPair?: { publicJwk: PublicJwk, privateJwk: PrivateJwk };
  protocol?: string;
  contextId?: string;
  schema?: string;
  recordId?: string;
  parentId?: string;
  data?: Uint8Array;
  dataFormat?: string;
  dateCreated? : number;
};

export type GenerateCollectionWriteMessageOutput = {
  message: CollectionsWriteSchema;
  messageCid: CID;
  data: Uint8Array;
  /**
   * method name without the `did:` prefix. e.g. "ion"
   */
  requesterDid: string;
  requesterDidMethod: string;
  requesterKeyId: string;
  requesterKeyPair: { publicJwk: PublicJwk, privateJwk: PrivateJwk };
};

export type GenerateCollectionQueryMessageInput = {
  targetDid?: string;
  requesterDid?: string;
  requesterKeyId?: string;
  requesterKeyPair?: { publicJwk: PublicJwk, privateJwk: PrivateJwk };
  filter?: {
    recipient?: string;
    protocol?: string;
    contextId?: string;
    schema?: string;
    recordId?: string;
    parentId?: string;
    dataFormat?: string;
  }
  dateSort?: string;
};

export type GenerateCollectionQueryMessageOutput = {
  message: CollectionsQuerySchema;
  /**
   * method name without the `did:` prefix. e.g. "ion"
   */
  requesterDidMethod: string;
  requesterDid: string;
  requesterKeyId: string;
  requesterKeyPair: { publicJwk: PublicJwk, privateJwk: PrivateJwk };
};

/**
 * Utility class for generating data for testing.
 */
export class TestDataGenerator {
  /**
   * Generates a CollectionsWrite message for testing.
   * All optional parameters are generated if not given.
   * Implementation currently uses `CollectionsWrite.create()`.
   */
  public static async generateCollectionWriteMessage(input?: GenerateCollectionWriteMessageInput): Promise<GenerateCollectionWriteMessageOutput> {
    // generate requester DID if not given
    let requesterDid = input?.requesterDid;
    if (!requesterDid) {
      const didSuffix = TestDataGenerator.randomString(32);
      requesterDid = `did:example:${didSuffix}`;
    }
    const requesterDidMethod = TestDataGenerator.getDidMethodName(requesterDid);

    // generate requester key ID if not given
    const requesterKeyId =  input?.requesterKeyId ?? `${requesterDid}#key1`;

    // generate requester key pair if not given
    let requesterKeyPair = input?.requesterKeyPair;
    if (!requesterKeyPair) {
      requesterKeyPair = await secp256k1.generateKeyPair();
    }

    const signatureInput = {
      jwkPrivate      : requesterKeyPair.privateJwk,
      protectedHeader : {
        alg : requesterKeyPair.privateJwk.alg!,
        kid : requesterKeyId
      }
    };

    // generate target DID if not given
    let targetDid = input?.targetDid;
    if (!targetDid) {
      // if both `requesterDid` and `targetDid` are both not given in input,
      // use the same DID as the `requesterDid` to pass authorization in tests by default.
      if (!input?.requesterDid) {
        targetDid = requesterDid;
      } else {
        const didSuffix = TestDataGenerator.randomString(32);
        targetDid = `did:example:${didSuffix}`;
      }
    }

    const data = input?.data ?? TestDataGenerator.randomBytes(32);

    const options = {
      target      : targetDid,
      recipient   : input?.recipientDid ?? targetDid, // use target if recipient is not explicitly set
      nonce       : TestDataGenerator.randomString(32),
      protocol    : input?.protocol,
      contextId   : input?.contextId,
      schema      : input?.schema ?? TestDataGenerator.randomString(20),
      recordId    : input?.recordId ?? uuidv4(),
      parentId    : input?.parentId,
      dataFormat  : input?.dataFormat ?? 'application/json',
      dateCreated : input?.dateCreated ?? Date.now(),
      data,
      signatureInput
    };

    const collectionsWrite = await CollectionsWrite.create(options);
    const message = collectionsWrite.toObject() as CollectionsWriteSchema;
    const messageCid = await CollectionsWrite.getCid(message);

    return {
      message,
      messageCid,
      data,
      requesterDid,
      requesterDidMethod,
      requesterKeyId,
      requesterKeyPair
    };
  };

  /**
   * Generates a CollectionsQuery message for testing.
   * If both `requesterDid` and `targetDid` are not given, the generator will use the same DID for both to pass authorization in tests by default.
   */
  public static async generateCollectionQueryMessage(input?: GenerateCollectionQueryMessageInput): Promise<GenerateCollectionQueryMessageOutput> {
    // generate requester DID if not given
    let requesterDid = input?.requesterDid;
    if (!requesterDid) {
      const didSuffix = TestDataGenerator.randomString(32);
      requesterDid = `did:example:${didSuffix}`;
    }
    const requesterDidMethod = TestDataGenerator.getDidMethodName(requesterDid);

    // generate requester key ID if not given
    const requesterKeyId =  input?.requesterKeyId ?? `${requesterDid}#key1`;

    // generate requester key pair if not given
    let requesterKeyPair = input?.requesterKeyPair;
    if (!requesterKeyPair) {
      requesterKeyPair = await secp256k1.generateKeyPair();
    }

    const signatureInput = {
      jwkPrivate      : requesterKeyPair.privateJwk,
      protectedHeader : {
        alg : requesterKeyPair.privateJwk.alg!,
        kid : requesterKeyId
      }
    };

    // generate target DID if not given
    let targetDid = input?.targetDid;
    if (!targetDid) {
      // if both `requesterDid` and `targetDid` are both not given in input,
      // use the same DID as the `requesterDid` to pass authorization in tests by default.
      if (!input?.requesterDid) {
        targetDid = requesterDid;
      } else {
        const didSuffix = TestDataGenerator.randomString(32);
        targetDid = `did:example:${didSuffix}`;
      }
    }

    const options = {
      target   : targetDid,
      nonce    : TestDataGenerator.randomString(32),
      signatureInput,
      filter   : input?.filter ?? { schema: TestDataGenerator.randomString(10) }, // must have one filter property if no filter is given
      dateSort : input?.dateSort
    };
    removeUndefinedProperties(options);

    const collectionsQuery = await CollectionsQuery.create(options);
    const message = collectionsQuery.toObject() as CollectionsQuerySchema;

    return {
      message,
      requesterDid,
      requesterDidMethod,
      requesterKeyId,
      requesterKeyPair
    };
  };

  /**
   * Generates a PermissionsRequest message for testing.
   */
  public static async generatePermissionRequestMessage(): Promise<BaseMessageSchema> {
    const { privateJwk } = await ed25519.generateKeyPair();
    const permissionRequest = await PermissionsRequest.create({
      target         : 'did:jank:alice',
      description    : 'drugs',
      grantedBy      : 'did:jank:bob',
      grantedTo      : 'did:jank:alice',
      scope          : { method: 'CollectionsWrite' },
      signatureInput : { jwkPrivate: privateJwk, protectedHeader: { alg: privateJwk.alg as string, kid: 'whatev' } }
    });

    return permissionRequest.toObject();
  }

  /**
   * Generates a random alpha-numeric string.
   */
  public static randomString(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    // pick characters randomly
    let randomString = '';
    for (let i = 0; i < length; i++) {
      randomString += charset.charAt(Math.floor(Math.random() * charset.length));
    }

    return randomString;
  };

  /**
   * Generates a random byte array of given length
   */
  public static randomBytes(length: number): Uint8Array {
    const randomString = TestDataGenerator.randomString(length);
    return new TextEncoder().encode(randomString);
  };

  /**
   * Creates a mock DID resolution result for testing purposes.
   */
  public static createDidResolutionResult(did: string, keyId: string, publicJwk: PublicJwk): DIDResolutionResult {
    return {
      didResolutionMetadata : {},
      didDocument           : {
        id                 : did,
        verificationMethod : [{
          controller   : did,
          id           : keyId,
          type         : 'JsonWebKey2020',
          publicKeyJwk : publicJwk
        }]
      },
      didDocumentMetadata: {}
    };
  }

  /**
   * Gets the method name from the given DID.
   */
  private static getDidMethodName(did: string): string {
    const segments = did.split(':', 3);
    if (segments.length < 3) {
      throw new Error(`${did} is not a valid DID`);
    }

    return segments[1];
  }
}