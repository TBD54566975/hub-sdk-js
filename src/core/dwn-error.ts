/**
 * A class that represents a DWN error.
 */
export class DwnError extends Error {
  constructor (public code: string, message: string) {
    super(`${code}: ${message}`);

    this.name = 'DwnError';
  }
}

/**
 * DWN SDK error codes.
 */
export enum DwnErrorCode {
  AuthenticateJwsMissing = 'AuthenticateJwsMissing',
  AuthenticateDescriptorCidMismatch = 'AuthenticateDescriptorCidMismatch',
  AuthenticationMoreThanOneSignatureNotSupported = 'AuthenticationMoreThanOneSignatureNotSupported',
  AuthorizationAuthorNotOwner = 'AuthorizationAuthorNotOwner',
  AuthorizationNotGrantedToAuthor = 'AuthorizationNotGrantedToAuthor',
  ComputeCidCodecNotSupported = 'ComputeCidCodecNotSupported',
  ComputeCidMultihashNotSupported = 'ComputeCidMultihashNotSupported',
  DidMethodNotSupported = 'DidMethodNotSupported',
  DidNotString = 'DidNotString',
  DidNotValid = 'DidNotValid',
  DidResolutionFailed = 'DidResolutionFailed',
  Ed25519InvalidJwk = 'Ed25519InvalidJwk',
  EventEmitterStreamNotOpenError = 'EventEmitterStreamNotOpenError',
  EventsSubscribeEventStreamUnimplemented = 'EventsSubscribeEventStreamUnimplemented',
  GeneralJwsVerifierGetPublicKeyNotFound = 'GeneralJwsVerifierGetPublicKeyNotFound',
  GeneralJwsVerifierInvalidSignature = 'GeneralJwsVerifierInvalidSignature',
  GrantAuthorizationGrantExpired = 'GrantAuthorizationGrantExpired',
  GrantAuthorizationGrantMissing = 'GrantAuthorizationGrantMissing',
  GrantAuthorizationGrantRevoked = 'GrantAuthorizationGrantRevoked',
  GrantAuthorizationInterfaceMismatch = 'GrantAuthorizationInterfaceMismatch',
  GrantAuthorizationMethodMismatch = 'GrantAuthorizationMethodMismatch',
  GrantAuthorizationNotGrantedForTenant = 'GrantAuthorizationNotGrantedForTenant',
  GrantAuthorizationNotGrantedToAuthor = 'GrantAuthorizationNotGrantedToAuthor',
  GrantAuthorizationGrantNotYetActive = 'GrantAuthorizationGrantNotYetActive',
  HdKeyDerivationPathInvalid = 'HdKeyDerivationPathInvalid',
  JwsVerifySignatureUnsupportedCrv = 'JwsVerifySignatureUnsupportedCrv',
  IndexInvalidCursorValueType = 'IndexInvalidCursorValueType',
  IndexInvalidCursorSortProperty = 'IndexInvalidCursorSortProperty',
  IndexInvalidSortPropertyInMemory = 'IndexInvalidSortPropertyInMemory',
  IndexMissingIndexableProperty = 'IndexMissingIndexableProperty',
  JwsDecodePlainObjectPayloadInvalid = 'JwsDecodePlainObjectPayloadInvalid',
  MessageGetInvalidCid = 'MessageGetInvalidCid',
  ParseCidCodecNotSupported = 'ParseCidCodecNotSupported',
  ParseCidMultihashNotSupported = 'ParseCidMultihashNotSupported',
  PermissionsProtocolValidateSchemaUnexpectedRecord = 'PermissionsProtocolValidateSchemaUnexpectedRecord',
  PermissionsProtocolValidateScopeContextIdProhibitedProperties = 'PermissionsProtocolValidateScopeContextIdProhibitedProperties',
  PermissionsProtocolValidateScopeSchemaProhibitedProperties = 'PermissionsProtocolValidateScopeSchemaProhibitedProperties',
  PrivateKeySignerUnableToDeduceAlgorithm = 'PrivateKeySignerUnableToDeduceAlgorithm',
  PrivateKeySignerUnableToDeduceKeyId = 'PrivateKeySignerUnableToDeduceKeyId',
  PrivateKeySignerUnsupportedCurve = 'PrivateKeySignerUnsupportedCurve',
  ProtocolAuthorizationActionNotAllowed = 'ProtocolAuthorizationActionNotAllowed',
  ProtocolAuthorizationActionRulesNotFound = 'ProtocolAuthorizationActionRulesNotFound',
  ProtocolAuthorizationIncorrectDataFormat = 'ProtocolAuthorizationIncorrectDataFormat',
  ProtocolAuthorizationIncorrectContextId = 'ProtocolAuthorizationIncorrectContextId',
  ProtocolAuthorizationIncorrectProtocolPath = 'ProtocolAuthorizationIncorrectProtocolPath',
  ProtocolAuthorizationDuplicateRoleRecipient = 'ProtocolAuthorizationDuplicateRoleRecipient',
  ProtocolAuthorizationInvalidSchema = 'ProtocolAuthorizationInvalidSchema',
  ProtocolAuthorizationInvalidType = 'ProtocolAuthorizationInvalidType',
  ProtocolAuthorizationMatchingRoleRecordNotFound = 'ProtocolAuthorizationMatchingRoleRecordNotFound',
  ProtocolAuthorizationMaxSizeInvalid = 'ProtocolAuthorizationMaxSizeInvalid',
  ProtocolAuthorizationMinSizeInvalid = 'ProtocolAuthorizationMinSizeInvalid',
  ProtocolAuthorizationMissingContextId = 'ProtocolAuthorizationMissingContextId',
  ProtocolAuthorizationMissingRuleSet = 'ProtocolAuthorizationMissingRuleSet',
  ProtocolAuthorizationParentlessIncorrectProtocolPath = 'ProtocolAuthorizationParentlessIncorrectProtocolPath',
  ProtocolAuthorizationNotARole = 'ProtocolAuthorizationNotARole',
  ProtocolAuthorizationParentNotFoundConstructingAncestorChain = 'ProtocolAuthorizationParentNotFoundConstructingAncestorChain',
  ProtocolAuthorizationProtocolNotFound = 'ProtocolAuthorizationProtocolNotFound',
  ProtocolAuthorizationQueryWithoutRole = 'ProtocolAuthorizationQueryWithoutRole',
  ProtocolAuthorizationRoleMissingRecipient = 'ProtocolAuthorizationRoleMissingRecipient',
  ProtocolAuthorizationTagsInvalidSchema = 'ProtocolAuthorizationTagsInvalidSchema',
  ProtocolsConfigureDuplicateActorInRuleSet = 'ProtocolsConfigureDuplicateActorInRuleSet',
  ProtocolsConfigureDuplicateRoleInRuleSet = 'ProtocolsConfigureDuplicateRoleInRuleSet',
  ProtocolsConfigureInvalidSize = 'ProtocolsConfigureInvalidSize',
  ProtocolsConfigureInvalidActionMissingOf = 'ProtocolsConfigureInvalidActionMissingOf',
  ProtocolsConfigureInvalidActionOfNotAllowed = 'ProtocolsConfigureInvalidActionOfNotAllowed',
  ProtocolsConfigureInvalidActionDeleteWithoutCreate = 'ProtocolsConfigureInvalidActionDeleteWithoutCreate',
  ProtocolsConfigureInvalidActionUpdateWithoutCreate = 'ProtocolsConfigureInvalidActionUpdateWithoutCreate',
  ProtocolsConfigureInvalidRecipientOfAction = 'ProtocolsConfigureInvalidRecipientOfAction',
  ProtocolsConfigureInvalidRuleSetRecordType = 'ProtocolsConfigureInvalidRuleSetRecordType',
  ProtocolsConfigureInvalidTagSchema = 'ProtocolsConfigureInvalidTagSchema',
  ProtocolsConfigureQueryNotAllowed = 'ProtocolsConfigureQueryNotAllowed',
  ProtocolsConfigureRecordNestingDepthExceeded = 'ProtocolsConfigureRecordNestingDepthExceeded',
  ProtocolsConfigureRoleDoesNotExistAtGivenPath = 'ProtocolsConfigureRoleDoesNotExistAtGivenPath',
  ProtocolsConfigureUnauthorized = 'ProtocolsConfigureUnauthorized',
  ProtocolsQueryUnauthorized = 'ProtocolsQueryUnauthorized',
  RecordsAuthorDelegatedGrantAndIdExistenceMismatch = 'RecordsAuthorDelegatedGrantAndIdExistenceMismatch',
  RecordsAuthorDelegatedGrantCidMismatch = 'RecordsAuthorDelegatedGrantCidMismatch',
  RecordsAuthorDelegatedGrantGrantedToAndOwnerSignatureMismatch = 'RecordsAuthorDelegatedGrantGrantedToAndOwnerSignatureMismatch',
  RecordsAuthorDelegatedGrantNotADelegatedGrant = 'RecordsAuthorDelegatedGrantNotADelegatedGrant',
  RecordsDecryptNoMatchingKeyEncryptedFound = 'RecordsDecryptNoMatchingKeyEncryptedFound',
  RecordsDeleteAuthorizationFailed = 'RecordsDeleteAuthorizationFailed',
  RecordsQueryCreateFilterPublishedSortInvalid = 'RecordsQueryCreateFilterPublishedSortInvalid',
  RecordsQueryParseFilterPublishedSortInvalid = 'RecordsQueryParseFilterPublishedSortInvalid',
  RecordsGrantAuthorizationConditionPublicationProhibited = 'RecordsGrantAuthorizationConditionPublicationProhibited',
  RecordsGrantAuthorizationConditionPublicationRequired = 'RecordsGrantAuthorizationConditionPublicationRequired',
  RecordsGrantAuthorizationDeleteProtocolScopeMismatch = 'RecordsGrantAuthorizationDeleteProtocolScopeMismatch',
  RecordsGrantAuthorizationQueryOrSubscribeProtocolScopeMismatch = 'RecordsGrantAuthorizationQueryOrSubscribeProtocolScopeMismatch',
  RecordsGrantAuthorizationScopeContextIdMismatch = 'RecordsGrantAuthorizationScopeContextIdMismatch',
  RecordsGrantAuthorizationScopeMissingProtocol = 'RecordsGrantAuthorizationScopeMissingProtocol',
  RecordsGrantAuthorizationScopeNotRecords = `RecordsGrantAuthorizationScopeNotRecords`,
  RecordsGrantAuthorizationScopeProtocolMismatch = 'RecordsGrantAuthorizationScopeProtocolMismatch',
  RecordsGrantAuthorizationScopeProtocolPathMismatch = 'RecordsGrantAuthorizationScopeProtocolPathMismatch',
  RecordsGrantAuthorizationScopeSchema = 'RecordsGrantAuthorizationScopeSchema',
  RecordsDerivePrivateKeyUnSupportedCurve = 'RecordsDerivePrivateKeyUnSupportedCurve',
  RecordsInvalidAncestorKeyDerivationSegment = 'RecordsInvalidAncestorKeyDerivationSegment',
  RecordsOwnerDelegatedGrantAndIdExistenceMismatch = 'RecordsOwnerDelegatedGrantAndIdExistenceMismatch',
  RecordsOwnerDelegatedGrantCidMismatch = 'RecordsOwnerDelegatedGrantCidMismatch',
  RecordsOwnerDelegatedGrantGrantedToAndOwnerSignatureMismatch = 'RecordsOwnerDelegatedGrantGrantedToAndOwnerSignatureMismatch',
  RecordsOwnerDelegatedGrantNotADelegatedGrant = 'RecordsOwnerDelegatedGrantNotADelegatedGrant',
  RecordsProtocolContextDerivationSchemeMissingContextId = 'RecordsProtocolContextDerivationSchemeMissingContextId',
  RecordsProtocolPathDerivationSchemeMissingProtocol = 'RecordsProtocolPathDerivationSchemeMissingProtocol',
  RecordsQueryFilterMissingRequiredProperties = 'RecordsQueryFilterMissingRequiredProperties',
  RecordsReadReturnedMultiple = 'RecordsReadReturnedMultiple',
  RecordsReadAuthorizationFailed = 'RecordsReadAuthorizationFailed',
  RecordsSubscribeEventStreamUnimplemented = 'RecordsSubscribeEventStreamUnimplemented',
  RecordsSubscribeFilterMissingRequiredProperties = 'RecordsSubscribeFilterMissingRequiredProperties',
  RecordsSchemasDerivationSchemeMissingSchema = 'RecordsSchemasDerivationSchemeMissingSchema',
  RecordsWriteAttestationIntegrityMoreThanOneSignature = 'RecordsWriteAttestationIntegrityMoreThanOneSignature',
  RecordsWriteAttestationIntegrityDescriptorCidMismatch = 'RecordsWriteAttestationIntegrityDescriptorCidMismatch',
  RecordsWriteAttestationIntegrityInvalidPayloadProperty = 'RecordsWriteAttestationIntegrityInvalidPayloadProperty',
  RecordsWriteAuthorizationFailed = 'RecordsWriteAuthorizationFailed',
  RecordsWriteCreateMissingSigner = 'RecordsWriteCreateMissingSigner',
  RecordsWriteCreateDataAndDataCidMutuallyExclusive = 'RecordsWriteCreateDataAndDataCidMutuallyExclusive',
  RecordsWriteCreateDataCidAndDataSizeMutuallyInclusive = 'RecordsWriteCreateDataCidAndDataSizeMutuallyInclusive',
  RecordsWriteCreateProtocolAndProtocolPathMutuallyInclusive = 'RecordsWriteCreateProtocolAndProtocolPathMutuallyInclusive',
  RecordsWriteDataCidMismatch = 'RecordsWriteDataCidMismatch',
  RecordsWriteDataSizeMismatch = 'RecordsWriteDataSizeMismatch',
  RecordsWriteGetEntryIdUndefinedAuthor = 'RecordsWriteGetEntryIdUndefinedAuthor',
  RecordsWriteGetInitialWriteNotFound = 'RecordsWriteGetInitialWriteNotFound',
  RecordsWriteImmutablePropertyChanged = 'RecordsWriteImmutablePropertyChanged',
  RecordsWriteMissingSigner = 'RecordsWriteMissingSigner',
  RecordsWriteMissingDataInPrevious = 'RecordsWriteMissingDataInPrevious',
  RecordsWriteMissingEncodedDataInPrevious = 'RecordsWriteMissingEncodedDataInPrevious',
  RecordsWriteMissingDataStream = 'RecordsWriteMissingDataStream',
  RecordsWriteMissingProtocol = 'RecordsWriteMissingProtocol',
  RecordsWriteMissingSchema = 'RecordsWriteMissingSchema',
  RecordsWriteOwnerAndTenantMismatch = 'RecordsWriteOwnerAndTenantMismatch',
  RecordsWriteSignAsOwnerDelegateUnknownAuthor = 'RecordsWriteSignAsOwnerDelegateUnknownAuthor',
  RecordsWriteSignAsOwnerUnknownAuthor = 'RecordsWriteSignAsOwnerUnknownAuthor',
  RecordsWriteValidateIntegrityAttestationMismatch = 'RecordsWriteValidateIntegrityAttestationMismatch',
  RecordsWriteValidateIntegrityContextIdMismatch = 'RecordsWriteValidateIntegrityContextIdMismatch',
  RecordsWriteValidateIntegrityContextIdNotInSignerSignaturePayload = 'RecordsWriteValidateIntegrityContextIdNotInSignerSignaturePayload',
  RecordsWriteValidateIntegrityDateCreatedMismatch = 'RecordsWriteValidateIntegrityDateCreatedMismatch',
  RecordsWriteValidateIntegrityEncryptionCidMismatch = 'RecordsWriteValidateIntegrityEncryptionCidMismatch',
  RecordsWriteValidateIntegrityRecordIdUnauthorized = 'RecordsWriteValidateIntegrityRecordIdUnauthorized',
  SchemaValidatorAdditionalPropertyNotAllowed = 'SchemaValidatorAdditionalPropertyNotAllowed',
  SchemaValidatorFailure = 'SchemaValidatorFailure',
  SchemaValidatorSchemaNotFound = 'SchemaValidatorSchemaNotFound',
  SchemaValidatorUnevaluatedPropertyNotAllowed = 'SchemaValidatorUnevaluatedPropertyNotAllowed',
  Secp256k1KeyNotValid = 'Secp256k1KeyNotValid',
  Secp256r1KeyNotValid = 'Secp256r1KeyNotValid',
  TimestampInvalid = 'TimestampInvalid',
  UrlProtocolNotNormalized = 'UrlProtocolNotNormalized',
  UrlProtocolNotNormalizable = 'UrlProtocolNotNormalizable',
  UrlSchemaNotNormalized = 'UrlSchemaNotNormalized',
  UrlSchemaNotNormalizable = 'UrlSchemaNotNormalizable',
};
