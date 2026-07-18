import jsonDuplicateKeyValidator from 'json-dup-key-validator';

export function parseStrictJson(raw, sourceName = 'JSON input') {
  if (typeof raw !== 'string') {
    throw new TypeError(`${sourceName}: expected UTF-8 text`);
  }
  if (raw.charCodeAt(0) === 0xfeff) {
    throw new Error(`${sourceName}: UTF-8 BOM is not allowed`);
  }

  const validationError = jsonDuplicateKeyValidator.validate(raw, false);
  if (validationError) {
    throw new Error(`${sourceName}: ${validationError.message ?? validationError}`);
  }
  return jsonDuplicateKeyValidator.parse(raw, false);
}
