import type { ProtocolDefinition } from '../types/protocols-types.js';
import type { Signer } from '../types/signer.js';
import type { PermissionConditions, PermissionGrantModel, PermissionRequestModel, PermissionRevocationModel, PermissionScope, RecordsPermissionScope } from '../types/permissions-grant-descriptor.js';

import { Encoder } from '../utils/encoder.js';
import { RecordsWrite } from '../../src/interfaces/records-write.js';
import { normalizeProtocolUrl, normalizeSchemaUrl } from '../utils/url.js';

/**
 * Options for creating a permission request.
 */
export type PermissionRequestCreateOptions = {
  /**
   * The signer of the request.
   */
  signer?: Signer;

  dateRequested?: string;

  // remaining properties are contained within the data payload of the record

  description?: string;
  delegated: boolean;
  scope: PermissionScope;
  conditions?: PermissionConditions;
};

/**
 * Options for creating a permission grant.
 */
export type PermissionGrantCreateOptions = {
  /**
   * The signer of the grant.
   */
  signer?: Signer;
  grantedTo: string;
  dateGranted?: string;

  // remaining properties are contained within the data payload of the record

  /**
   * Expire time in UTC ISO-8601 format with microsecond precision.
   */
  dateExpires: string;
  requestId?: string;
  description?: string;
  delegated?: boolean;
  scope: PermissionScope;
  conditions?: PermissionConditions;
};

/**
 * Options for creating a permission revocation.
 */
export type PermissionRevocationCreateOptions = {
  /**
   * The signer of the grant.
   */
  signer?: Signer;
  grantId: string;
  dateRevoked?: string;

  // remaining properties are contained within the data payload of the record

  description?: string;
};

/**
 * This is a first-class DWN protocol for managing permission grants of a given DWN.
 */
export class PermissionsProtocol {
  /**
   * The URI of the DWN Permissions protocol.
   */
  public static readonly uri = 'https://tbd.website/dwn/permissions';

  /**
   * The protocol path of the `request` record.
   */
  public static readonly requestPath = 'request';

  /**
   * The protocol path of the `grant` record.
   */
  public static readonly grantPath = 'grant';

  /**
   * The protocol path of the `revocation` record.
   */
  public static readonly revocationPath = 'grant/revocation';

  /**
   * The definition of the Permissions protocol.
   */
  public static readonly definition: ProtocolDefinition = {
    published : true,
    protocol  : PermissionsProtocol.uri,
    types     : {
      request: {
        dataFormats: ['application/json']
      },
      grant: {
        dataFormats: ['application/json']
      },
      revocation: {
        dataFormats: ['application/json']
      }
    },
    structure: {
      request: {
        $size: {
          max: 10000
        },
        $actions: [
          {
            who : 'anyone',
            can : ['create']
          }
        ]
      },
      grant: {
        $size: {
          max: 10000
        },
        $actions: [
          {
            who : 'recipient',
            of  : 'grant',
            can : ['read', 'query']
          }
        ],
        revocation: {
          $size: {
            max: 10000
          },
          $actions: [
            {
              who : 'anyone',
              can : ['read']
            }
          ]
        }
      }
    }
  };

  public static parseRequest(base64UrlEncodedRequest: string): PermissionRequestModel {
    return Encoder.base64UrlToObject(base64UrlEncodedRequest);
  }

  /**
   * Convenience method to create a permission request.
   */
  public static async createRequest(options: PermissionRequestCreateOptions): Promise<{
    recordsWrite: RecordsWrite,
    permissionRequestModel: PermissionRequestModel,
    permissionRequestBytes: Uint8Array
  }> {
    const scope = PermissionsProtocol.normalizePermissionScope(options.scope);

    const permissionRequestModel: PermissionRequestModel = {
      description : options.description,
      delegated   : options.delegated,
      scope,
      conditions  : options.conditions,
    };

    const permissionRequestBytes = Encoder.objectToBytes(permissionRequestModel);
    const recordsWrite = await RecordsWrite.create({
      signer           : options.signer,
      messageTimestamp : options.dateRequested,
      protocol         : PermissionsProtocol.uri,
      protocolPath     : PermissionsProtocol.requestPath,
      dataFormat       : 'application/json',
      data             : permissionRequestBytes,
    });

    return {
      recordsWrite,
      permissionRequestModel,
      permissionRequestBytes
    };
  }

  /**
   * Convenience method to create a permission grant.
   */
  public static async createGrant(options: PermissionGrantCreateOptions): Promise<{
    recordsWrite: RecordsWrite,
    permissionGrantModel: PermissionGrantModel,
    permissionGrantBytes: Uint8Array
  }> {
    const scope = PermissionsProtocol.normalizePermissionScope(options.scope);

    const permissionGrantModel: PermissionGrantModel = {
      dateExpires : options.dateExpires,
      requestId   : options.requestId,
      description : options.description,
      delegated   : options.delegated,
      scope,
      conditions  : options.conditions,
    };

    const permissionGrantBytes = Encoder.objectToBytes(permissionGrantModel);
    const recordsWrite = await RecordsWrite.create({
      signer           : options.signer,
      messageTimestamp : options.dateGranted,
      recipient        : options.grantedTo,
      protocol         : PermissionsProtocol.uri,
      protocolPath     : PermissionsProtocol.grantPath,
      dataFormat       : 'application/json',
      data             : permissionGrantBytes,
    });

    return {
      recordsWrite,
      permissionGrantModel,
      permissionGrantBytes
    };
  }

  /**
   * Convenience method to create a permission revocation.
   */
  public static async createRevocation(options: PermissionRevocationCreateOptions): Promise<{
    recordsWrite: RecordsWrite,
    permissionRevocationModel: PermissionRevocationModel,
    permissionRevocationBytes: Uint8Array
  }> {
    const permissionRevocationModel: PermissionRevocationModel = {
      description: options.description,
    };

    const permissionRevocationBytes = Encoder.objectToBytes(permissionRevocationModel);
    const recordsWrite = await RecordsWrite.create({
      signer          : options.signer,
      parentContextId : options.grantId,
      protocol        : PermissionsProtocol.uri,
      protocolPath    : PermissionsProtocol.revocationPath,
      dataFormat      : 'application/json',
      data            : permissionRevocationBytes,
    });

    return {
      recordsWrite,
      permissionRevocationModel,
      permissionRevocationBytes
    };
  }

  /**
   * Normalizes the given permission scope if needed.
   * @returns The normalized permission scope.
   */
  private static normalizePermissionScope(permissionScope: PermissionScope): PermissionScope {
    const scope = { ...permissionScope };

    if (PermissionsProtocol.isRecordPermissionScope(scope)) {
      // normalize protocol and schema URLs if they are present
      if (scope.protocol !== undefined) {
        scope.protocol = normalizeProtocolUrl(scope.protocol);
      }
      if (scope.schema !== undefined) {
        scope.schema = normalizeSchemaUrl(scope.schema);
      }
    }

    return scope;
  }

  /**
   * Type guard to determine if the scope is a record permission scope.
   */
  private static isRecordPermissionScope(scope: PermissionScope): scope is RecordsPermissionScope {
    return scope.interface === 'Records';
  }
};