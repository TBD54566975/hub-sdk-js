import { expect } from 'chai';
import { Message } from '../../../../src/core/message.js';
import { TestDataGenerator } from '../../../utils/test-data-generator.js';

describe('RecordsQuery schema validation', () => {
  it('should allow descriptor with only required properties', async () => {
    const validMessage = {
      descriptor: {
        interface        : 'Records',
        method           : 'Query',
        messageTimestamp : '2022-10-14T10:20:30.405060Z',
        filter           : { schema: 'anySchema' }
      },
      authorization: TestDataGenerator.generateAuthorization()
    };
    Message.validateJsonSchema(validMessage);
  });

  it('should throw if unknown property is given in message', () => {
    const invalidMessage = {
      descriptor: {
        interface        : 'Records',
        method           : 'Query',
        messageTimestamp : '2022-10-14T10:20:30.405060Z',
        filter           : { schema: 'anySchema' }
      },
      authorization: {
        payload    : 'anyPayload',
        signatures : [{
          protected : 'anyProtectedHeader',
          signature : 'anySignature'
        }]
      },
      unknownProperty: 'unknownProperty' // unknown property
    };

    expect(() => {
      Message.validateJsonSchema(invalidMessage);
    }).throws('must NOT have additional properties');
  });

  it('should throw if unknown property is given in the `descriptor`', () => {
    const invalidMessage = {
      descriptor: {
        interface        : 'Records',
        method           : 'Query',
        messageTimestamp : '2022-10-14T10:20:30.405060Z',
        filter           : { schema: 'anySchema' },
        unknownProperty  : 'unknownProperty' // unknown property
      },
      authorization: {
        payload    : 'anyPayload',
        signatures : [{
          protected : 'anyProtectedHeader',
          signature : 'anySignature'
        }]
      },
    };

    expect(() => {
      Message.validateJsonSchema(invalidMessage);
    }).throws('must NOT have additional properties');
  });

  it('should only allows string values from the spec for `dateSort`', () => {
    // test all valid values of `dateSort`
    const allowedDateSortValues = ['createdAscending', 'createdDescending', 'publishedAscending', 'publishedAscending'];
    for (const dateSortValue of allowedDateSortValues) {
      const validMessage = {
        descriptor: {
          interface        : 'Records',
          method           : 'Query',
          messageTimestamp : '2022-10-14T10:20:30.405060Z',
          filter           : { schema: 'anySchema' },
          dateSort         : dateSortValue
        },
        authorization: TestDataGenerator.generateAuthorization()
      };

      Message.validateJsonSchema(validMessage);
    }

    // test an invalid values of `dateSort`
    const invalidMessage = {
      descriptor: {
        interface        : 'Records',
        method           : 'Query',
        messageTimestamp : '2022-10-14T10:20:30.405060Z',
        filter           : { schema: 'anySchema' },
        dateSort         : 'unacceptable', // bad value
      },
      authorization: TestDataGenerator.generateAuthorization()
    };

    expect(() => {
      Message.validateJsonSchema(invalidMessage);
    }).throws('dateSort: must be equal to one of the allowed values');
  });

  describe('`filter` property validation', () => {
    it('should throw if empty `filter` property is given in the `descriptor`', () => {
      const invalidMessage = {
        descriptor: {
          interface        : 'Records',
          method           : 'Query',
          messageTimestamp : '2022-10-14T10:20:30.405060Z',
          filter           : { }
        },
        authorization: TestDataGenerator.generateAuthorization()
      };

      expect(() => {
        Message.validateJsonSchema(invalidMessage);
      }).throws('/descriptor/filter: must NOT have fewer than 1 properties');
    });

    it('should throw if `dateCreated` criteria given is an empty object', () => {
      const invalidMessage = {
        descriptor: {
          interface        : 'Records',
          method           : 'Query',
          messageTimestamp : '2022-10-14T10:20:30.405060Z',
          filter           : { dateCreated: { } } // empty `dateCreated` criteria
        },
        authorization: {
          author: {
            payload    : 'anyPayload',
            signatures : [{
              protected : 'anyProtectedHeader',
              signature : 'anySignature'
            }]
          }
        },
      };

      expect(() => {
        Message.validateJsonSchema(invalidMessage);
      }).throws('dateCreated: must NOT have fewer than 1 properties');
    });

    it('should throw if `dateCreated` criteria has unexpected properties', () => {
      const invalidMessage = {
        descriptor: {
          interface        : 'Records',
          method           : 'Query',
          messageTimestamp : '2022-10-14T10:20:30.405060Z',
          filter           : { dateCreated: { unexpectedProperty: 'anyValue' } } // unexpected property in `dateCreated` criteria
        },
        authorization: {
          payload    : 'anyPayload',
          signatures : [{
            protected : 'anyProtectedHeader',
            signature : 'anySignature'
          }]
        },
      };

      expect(() => {
        Message.validateJsonSchema(invalidMessage);
      }).throws('must NOT have additional properties');
    });
  });
});
