import Ajv from 'ajv';

const validator = new Ajv();

export function addSchema(schemaName: string, schema): void {
  validator.addSchema(schema, schemaName);
}

/**
 * TODO: add JSDoc
 * @param schemaName
 * @param payload
 * @returns
 */
export function validate(schemaName: string, payload: any): void {
  const validateFn = validator.getSchema(schemaName);

  if (!validateFn) {
    throw new Error(`schema for ${schemaName} not found.`);
  }

  validateFn(payload);

  if (!validateFn.errors) {
    return;
  }

  // AJV is configured by default to stop validating after the 1st error is encountered which means
  // there will only ever be one error;
  const [ errorObj ] = validateFn.errors;
  let { instancePath, message } = errorObj;

  if (!instancePath) {
    instancePath = schemaName;
  }

  throw new Error(`${instancePath}: ${message}`);
}