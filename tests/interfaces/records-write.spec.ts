import type { MessageStore } from '../../src/types/message-store.js';
import type { EncryptionInput, RecordsWriteOptions } from '../../src/interfaces/records-write.js';
import type { PermissionScope, Signer } from '../../src/index.js';

import chaiAsPromised from 'chai-as-promised';
import Sinon from 'sinon';
import chai, { expect } from 'chai';

import { DwnErrorCode } from '../../src/core/dwn-error.js';
import { RecordsWrite } from '../../src/interfaces/records-write.js';
import { RecordsWriteHandler } from '../../src/handlers/records-write.js';
import { stubInterface } from 'ts-sinon';
import { TestDataGenerator } from '../utils/test-data-generator.js';
import { Time } from '../../src/utils/time.js';

import { DwnInterfaceName, DwnMethodName, Encoder, Jws, KeyDerivationScheme, Message, PermissionsProtocol } from '../../src/index.js';


chai.use(chaiAsPromised);

describe('RecordsWrite', () => {
  describe('create()', () => {
    it('should be able to create and authorize a valid RecordsWrite message', async () => {
      // testing `create()` first
      const alice = await TestDataGenerator.generatePersona();

      const options: RecordsWriteOptions = {
        data        : TestDataGenerator.randomBytes(10),
        dataFormat  : 'application/json',
        dateCreated : '2022-10-14T10:20:30.405060Z',
        recordId    : await TestDataGenerator.randomCborSha256Cid(),
        signer      : Jws.createSigner(alice)
      };
      const recordsWrite = await RecordsWrite.create(options);

      const message = recordsWrite.message;

      expect(message.authorization).to.exist;
      expect(message.descriptor.dataFormat).to.equal(options.dataFormat);
      expect(message.descriptor.dateCreated).to.equal(options.dateCreated);
      expect(message.recordId).to.equal(options.recordId);

      const messageStoreStub = stubInterface<MessageStore>();

      await RecordsWriteHandler['authorizeRecordsWrite'](alice.did, recordsWrite, messageStoreStub);
    });

    it('should be able to auto-fill `datePublished` when `published` set to `true` but `datePublished` not given', async () => {
      const alice = await TestDataGenerator.generatePersona();

      const options: RecordsWriteOptions = {
        data       : TestDataGenerator.randomBytes(10),
        dataFormat : 'application/json',
        recordId   : await TestDataGenerator.randomCborSha256Cid(),
        published  : true,
        signer     : Jws.createSigner(alice)
      };
      const recordsWrite = await RecordsWrite.create(options);

      const message = recordsWrite.message;

      expect(message.descriptor.datePublished).to.exist;
    });

    it('should not allow `data` and `dataCid` to be both defined or undefined', async () => {
      const alice = await TestDataGenerator.generatePersona();

      // testing `data` and `dataCid` both defined
      const options1 = {
        recipient  : alice.did,
        data       : TestDataGenerator.randomBytes(10),
        dataCid    : await TestDataGenerator.randomCborSha256Cid(),
        dataFormat : 'application/json',
        recordId   : await TestDataGenerator.randomCborSha256Cid(),
        published  : true,
        signer     : Jws.createSigner(alice)
      };
      const createPromise1 = RecordsWrite.create(options1);

      await expect(createPromise1).to.be.rejectedWith(DwnErrorCode.RecordsWriteCreateDataAndDataCidMutuallyExclusive);

      // testing `data` and `dataCid` both undefined
      const options2 = {
        recipient  : alice.did,
        // intentionally showing both `data` and `dataCid` are undefined
        // data                        : TestDataGenerator.randomBytes(10),
        // dataCid                     : await TestDataGenerator.randomCborSha256Cid(),
        dataFormat : 'application/json',
        recordId   : await TestDataGenerator.randomCborSha256Cid(),
        published  : true,
        signer     : Jws.createSigner(alice)
      };
      const createPromise2 = RecordsWrite.create(options2);

      await expect(createPromise2).to.be.rejectedWith(DwnErrorCode.RecordsWriteCreateDataAndDataCidMutuallyExclusive);
    });

    it('should required `dataCid` and `dataSize` to be both defined or undefined at the same time', async () => {
      const alice = await TestDataGenerator.generatePersona();

      const options1 = {
        recipient  : alice.did,
        dataCid    : await TestDataGenerator.randomCborSha256Cid(),
        // dataSize                  : 123, // intentionally missing
        dataFormat : 'application/json',
        recordId   : await TestDataGenerator.randomCborSha256Cid(),
        published  : true,
        signer     : Jws.createSigner(alice)
      };
      const createPromise1 = RecordsWrite.create(options1);

      await expect(createPromise1).to.be.rejectedWith('`dataCid` and `dataSize` must both be defined or undefined at the same time');

      const options2 = {
        recipient  : alice.did,
        data       : TestDataGenerator.randomBytes(10),
        // dataCid                   : await TestDataGenerator.randomCborSha256Cid(), // intentionally missing
        dataSize   : 123,
        dataFormat : 'application/json',
        recordId   : await TestDataGenerator.randomCborSha256Cid(),
        published  : true,
        signer     : Jws.createSigner(alice)
      };
      const createPromise2 = RecordsWrite.create(options2);

      await expect(createPromise2).to.be.rejectedWith('`dataCid` and `dataSize` must both be defined or undefined at the same time');
    });

    it('should auto-normalize protocol URL', async () => {
      const alice = await TestDataGenerator.generatePersona();

      const options: RecordsWriteOptions = {
        recipient    : alice.did,
        data         : TestDataGenerator.randomBytes(10),
        dataFormat   : 'application/json',
        signer       : Jws.createSigner(alice),
        protocol     : 'example.com/',
        protocolPath : 'example',
        schema       : 'http://foo.bar/schema'
      };
      const recordsWrite = await RecordsWrite.create(options);

      const message = recordsWrite.message;

      expect(message.descriptor.protocol).to.eq('http://example.com');
    });

    it('should required `protocol` and `protocolPath` to be both defined or undefined at the same time', async () => {
      const alice = await TestDataGenerator.generatePersona();

      const options1 = {
        recipient  : alice.did,
        protocol   : 'http://example.com',
        // protocolPath                : 'foo/bar', // intentionally missing
        dataCid    : await TestDataGenerator.randomCborSha256Cid(),
        dataSize   : 123,
        dataFormat : 'application/json',
        recordId   : await TestDataGenerator.randomCborSha256Cid(),
        signer     : Jws.createSigner(alice)
      };
      const createPromise1 = RecordsWrite.create(options1);

      await expect(createPromise1).to.be.rejectedWith('`protocol` and `protocolPath` must both be defined or undefined at the same time');

      const options2 = {
        recipient    : alice.did,
        // protocol                    : 'http://example.com', // intentionally missing
        protocolPath : 'foo/bar',
        data         : TestDataGenerator.randomBytes(10),
        dataCid      : await TestDataGenerator.randomCborSha256Cid(),
        dataSize     : 123,
        dataFormat   : 'application/json',
        recordId     : await TestDataGenerator.randomCborSha256Cid(),
        signer       : Jws.createSigner(alice)
      };
      const createPromise2 = RecordsWrite.create(options2);

      await expect(createPromise2).to.be.rejectedWith('`protocol` and `protocolPath` must both be defined or undefined at the same time');
    });

    it('should be able to create a RecordsWrite successfully using a custom signer', async () => {
      // create a custom signer
      const hardCodedSignature = Encoder.stringToBytes('some_hard_coded_signature');
      class CustomSigner implements Signer {
        public keyId = 'did:example:alice#key1';
        public algorithm = 'unused';
        public async sign (_content: Uint8Array): Promise<Uint8Array> {
          return hardCodedSignature;
        }
      }

      const signer = new CustomSigner();

      const options: RecordsWriteOptions = {
        schema       : 'http://any-schema.com',
        protocol     : 'http://example.com',
        protocolPath : 'foo/bar',
        dataCid      : await TestDataGenerator.randomCborSha256Cid(),
        dataSize     : 123,
        dataFormat   : 'application/json',
        recordId     : await TestDataGenerator.randomCborSha256Cid(),
        signer
      };

      const recordsWrite = await RecordsWrite.create(options);

      expect(recordsWrite.message.authorization!.signature.signatures[0].signature).to.equal(Encoder.bytesToBase64Url(hardCodedSignature));
    });

    it('should throw if attempting to use `protocols` key derivation encryption scheme on non-protocol-based record', async () => {
      const alice = await TestDataGenerator.generatePersona();

      const dataEncryptionInitializationVector = TestDataGenerator.randomBytes(16);
      const dataEncryptionKey = TestDataGenerator.randomBytes(32);
      const encryptionInput: EncryptionInput = {
        initializationVector : dataEncryptionInitializationVector,
        key                  : dataEncryptionKey,
        keyEncryptionInputs  : [{
          publicKeyId      : alice.keyId, // reusing signing key for encryption purely as a convenience
          publicKey        : alice.keyPair.publicJwk,
          derivationScheme : KeyDerivationScheme.ProtocolPath
        }]
      };

      // intentionally generating a record that is not protocol-based
      const createPromise = RecordsWrite.create({
        signer     : Jws.createSigner(alice),
        dataFormat : 'application/json',
        data       : TestDataGenerator.randomBytes(10),
        encryptionInput
      });

      await expect(createPromise).to.be.rejectedWith(DwnErrorCode.RecordsWriteMissingProtocol);
    });

    it('should throw if attempting to use `schemas` key derivation encryption scheme on a record without `schema`', async () => {
      const alice = await TestDataGenerator.generatePersona();

      const dataEncryptionInitializationVector = TestDataGenerator.randomBytes(16);
      const dataEncryptionKey = TestDataGenerator.randomBytes(32);
      const encryptionInput: EncryptionInput = {
        initializationVector : dataEncryptionInitializationVector,
        key                  : dataEncryptionKey,
        keyEncryptionInputs  : [{
          publicKeyId      : alice.keyId, // reusing signing key for encryption purely as a convenience
          publicKey        : alice.keyPair.publicJwk,
          derivationScheme : KeyDerivationScheme.Schemas
        }]
      };

      // intentionally generating a record that is without `schema`
      const createPromise = RecordsWrite.create({
        signer     : Jws.createSigner(alice),
        dataFormat : 'application/octet-stream',
        data       : TestDataGenerator.randomBytes(10),
        encryptionInput
      });

      await expect(createPromise).to.be.rejectedWith(DwnErrorCode.RecordsWriteMissingSchema);
    });

    it('should throw if delegated grant is given but signer is not given', async () => {
      const alice = await TestDataGenerator.generatePersona();
      const bob = await TestDataGenerator.generatePersona();

      const scope: PermissionScope = {
        interface : DwnInterfaceName.Records,
        method    : DwnMethodName.Write,
        protocol  : 'chat'
      };
      const grantToBob = await PermissionsProtocol.createGrant({
        signer      : Jws.createSigner(alice),
        delegated   : true, // this is a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        description : 'Allow Bob to write as me in chat protocol',
        grantedTo   : bob.did,
        scope
      });

      const createPromise = RecordsWrite.create({
        delegatedGrant : grantToBob.dataEncodedMessage,
        dataFormat     : 'application/octet-stream',
        data           : TestDataGenerator.randomBytes(10),
      });

      await expect(createPromise).to.be.rejectedWith(DwnErrorCode.RecordsWriteCreateMissingSigner);
    });
  });

  describe('createFrom()', () => {
    it('should create a RecordsWrite with `published` set to `true` with just `publishedDate` given', async () => {
      const { author, recordsWrite } = await TestDataGenerator.generateRecordsWrite({
        published: false
      });

      const write = await RecordsWrite.createFrom({
        recordsWriteMessage : recordsWrite.message,
        datePublished       : Time.getCurrentTimestamp(),
        signer              : Jws.createSigner(author)
      });

      expect(write.message.descriptor.published).to.be.true;
    });

    it('replace tags with updated tags, if tags do not exist in createFrom remove them', async () => {

      // create a record with tags
      const { author, message, recordsWrite } = await TestDataGenerator.generateRecordsWrite({
        tags: {
          tag1: [ 'value1', 'value2' ]
        }
      });
      expect(message.descriptor.tags).to.exist;
      expect(message.descriptor.tags!.tag1).to.exist;
      expect(message.descriptor.tags!.tag1).to.have.members([ 'value1', 'value2' ]);

      // update the record's tags
      const write = await RecordsWrite.createFrom({
        recordsWriteMessage : recordsWrite.message,
        signer              : Jws.createSigner(author),
        tags                : {
          tag2: [ 'value1', 'value2', 'value3' ]
        }
      });
      expect(write.message.descriptor.tags).to.exist;
      expect(write.message.descriptor.tags!.tag1).to.not.exist;
      expect(write.message.descriptor.tags!.tag2).to.exist;
      expect(write.message.descriptor.tags!.tag2).to.have.members([ 'value1', 'value2', 'value3' ]);

      // update without tags
      const write2 = await RecordsWrite.createFrom({
        recordsWriteMessage : write.message,
        signer              : Jws.createSigner(author),
      });
      expect(write2.message.descriptor.tags).to.not.exist;
    });
  });

  describe('parse()', () => {
    xit('should invoke JSON schema validation when parsing a RecordsWrite', async () => {
      const alice = await TestDataGenerator.generatePersona();

      const recordsWrite = await RecordsWrite.create({
        signer     : Jws.createSigner(alice),
        dataFormat : 'application/octet-stream',
        data       : TestDataGenerator.randomBytes(10),
      });

      const validateJsonSchemaSpy = Sinon.spy(Message, 'validateJsonSchema');

      await RecordsWrite.parse(recordsWrite.message);

      expect(validateJsonSchemaSpy.called).to.be.true;
    });
  });

  describe('isSignedByAuthorDelegate()', () => {
    it('should return false if the given RecordsWrite is not signed at all', async () => {
      const data = new TextEncoder().encode('any data');
      const recordsWrite = await RecordsWrite.create({
        protocol     : 'unused',
        protocolPath : 'unused',
        schema       : 'unused',
        dataFormat   : 'unused',
        data
      });

      const isSignedByAuthorDelegate = recordsWrite.isSignedByAuthorDelegate;
      expect(isSignedByAuthorDelegate).to.be.false;
    });
  });

  describe('isSignedByOwnerDelegate()', () => {
    it('should return false if the given RecordsWrite is not signed at all', async () => {
      const data = new TextEncoder().encode('any data');
      const recordsWrite = await RecordsWrite.create({
        protocol     : 'unused',
        protocolPath : 'unused',
        schema       : 'unused',
        dataFormat   : 'unused',
        data
      });

      const isSignedByOwnerDelegate = recordsWrite.isSignedByOwnerDelegate;
      expect(isSignedByOwnerDelegate).to.be.false;
    });
  });

  describe('isInitialWrite()', () => {
    it('should return false if given message is not a RecordsWrite', async () => {
      const { message }= await TestDataGenerator.generateRecordsQuery();
      const isInitialWrite = await RecordsWrite.isInitialWrite(message);
      expect(isInitialWrite).to.be.false;
    });
  });

  describe('getEntryId()', () => {
    it('should throw if the given author is undefined', async () => {
      const { message }= await TestDataGenerator.generateRecordsWrite();
      const author = undefined;
      expect(RecordsWrite.getEntryId(author, message.descriptor)).to.be.rejectedWith(DwnErrorCode.RecordsWriteGetEntryIdUndefinedAuthor);
    });
  });

  describe('signAsOwner()', () => {
    it('should throw if the RecordsWrite is not signed by an author yet', async () => {
      const options = {
        data        : TestDataGenerator.randomBytes(10),
        dataFormat  : 'application/json',
        dateCreated : '2023-07-27T10:20:30.405060Z',
        recordId    : await TestDataGenerator.randomCborSha256Cid(),
      };
      const recordsWrite = await RecordsWrite.create(options);

      expect(recordsWrite.author).to.not.exist;
      expect(recordsWrite.signaturePayload).to.not.exist;

      const alice = await TestDataGenerator.generateDidKeyPersona();
      await expect(recordsWrite.signAsOwner(Jws.createSigner(alice))).to.be.rejectedWith(DwnErrorCode.RecordsWriteSignAsOwnerUnknownAuthor);

      expect(recordsWrite.owner).to.be.undefined;
      expect(recordsWrite.ownerSignaturePayload).to.be.undefined;
    });
  });

  describe('signAsOwnerDelegate()', () => {
    it('should throw if the RecordsWrite is not signed by an author yet', async () => {
      const options = {
        data        : TestDataGenerator.randomBytes(10),
        dataFormat  : 'application/json',
        dateCreated : '2023-07-27T10:20:30.405060Z',
        recordId    : await TestDataGenerator.randomCborSha256Cid(),
      };
      const recordsWrite = await RecordsWrite.create(options);

      expect(recordsWrite.author).to.not.exist;
      expect(recordsWrite.signaturePayload).to.not.exist;

      // create a delegated grant
      const alice = await TestDataGenerator.generateDidKeyPersona();
      const bob = await TestDataGenerator.generateDidKeyPersona();
      const scope: PermissionScope = {
        interface : DwnInterfaceName.Records,
        method    : DwnMethodName.Write,
        protocol  : 'chat'
      };
      const ownerDelegatedGrant = await PermissionsProtocol.createGrant({
        signer      : Jws.createSigner(alice),
        delegated   : true, // this is a delegated grant
        dateExpires : Time.createOffsetTimestamp({ seconds: 100 }),
        grantedTo   : bob.did,
        scope
      });

      await expect(recordsWrite.signAsOwnerDelegate(Jws.createSigner(bob), ownerDelegatedGrant.dataEncodedMessage))
        .to.be.rejectedWith(DwnErrorCode.RecordsWriteSignAsOwnerDelegateUnknownAuthor);

      expect(recordsWrite.owner).to.be.undefined;
      expect(recordsWrite.ownerSignaturePayload).to.be.undefined;
    });
  });

  describe('ownerSignatureSigner()', () => {
    it('should return `undefined` if owner signature is not present in the message', async () => {
      const options = {
        data        : TestDataGenerator.randomBytes(10),
        dataFormat  : 'application/json',
        dateCreated : '2023-07-27T10:20:30.405060Z',
        recordId    : await TestDataGenerator.randomCborSha256Cid(),
      };
      const recordsWrite = await RecordsWrite.create(options);

      expect(recordsWrite.ownerSignatureSigner).to.be.undefined;
    });
  });

  describe('message', () => {
    it('should throw if attempting to access the message of a RecordsWrite that is not given authorization signature input', async () => {
      const options = {
        data        : TestDataGenerator.randomBytes(10),
        dataFormat  : 'application/json',
        dateCreated : '2023-07-27T10:20:30.405060Z',
        recordId    : await TestDataGenerator.randomCborSha256Cid(),
      };
      const recordsWrite = await RecordsWrite.create(options);

      expect(recordsWrite.author).to.not.exist;
      expect(recordsWrite.signaturePayload).to.not.exist;

      expect(() => recordsWrite.message).to.throw(DwnErrorCode.RecordsWriteMissingSigner);
    });
  });
});
