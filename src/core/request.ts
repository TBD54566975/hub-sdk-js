import { RequestSchema } from './types.js';
import { validate } from '../validator.js';

export class Request {
  /**
   * parses the provided payload into a `RequestSchema`.
   */
  static parse(request: object): RequestSchema {
    // throws an error if validation fails
    validate('Request', request);

    return request as RequestSchema;
  }
}