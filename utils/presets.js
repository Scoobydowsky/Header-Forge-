/**
 * Built-in header presets for common workflows.
 * Values are templates the user can edit after applying.
 *
 * @typedef {Object} PresetHeader
 * @property {string} name
 * @property {string} value
 * @property {'ADD' | 'SET' | 'REMOVE'} operation
 */

/**
 * @typedef {Object} HeaderPreset
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {PresetHeader[]} headers
 */

/** @type {HeaderPreset[]} */
export const HEADER_PRESETS = [
  {
    id: 'jwt',
    name: 'JWT',
    description: 'Authorization with a JWT bearer token',
    headers: [
      {
        name: 'Authorization',
        value: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature',
        operation: 'SET',
      },
    ],
  },
  {
    id: 'bearer',
    name: 'Bearer',
    description: 'Generic Bearer token Authorization header',
    headers: [
      {
        name: 'Authorization',
        value: 'Bearer YOUR_TOKEN_HERE',
        operation: 'SET',
      },
    ],
  },
  {
    id: 'oauth',
    name: 'OAuth',
    description: 'OAuth 2.0 access token headers',
    headers: [
      {
        name: 'Authorization',
        value: 'Bearer YOUR_ACCESS_TOKEN',
        operation: 'SET',
      },
      {
        name: 'X-Requested-With',
        value: 'XMLHttpRequest',
        operation: 'SET',
      },
    ],
  },
  {
    id: 'cors-testing',
    name: 'CORS Testing',
    description: 'Headers useful when debugging CORS',
    headers: [
      {
        name: 'Origin',
        value: 'https://example.com',
        operation: 'SET',
      },
      {
        name: 'Access-Control-Request-Method',
        value: 'GET',
        operation: 'SET',
      },
      {
        name: 'Access-Control-Request-Headers',
        value: 'content-type,authorization',
        operation: 'SET',
      },
    ],
  },
  {
    id: 'json-api',
    name: 'JSON API',
    description: 'Accept and Content-Type for JSON APIs',
    headers: [
      {
        name: 'Accept',
        value: 'application/json',
        operation: 'SET',
      },
      {
        name: 'Content-Type',
        value: 'application/json',
        operation: 'SET',
      },
    ],
  },
  {
    id: 'xml-api',
    name: 'XML API',
    description: 'Accept and Content-Type for XML APIs',
    headers: [
      {
        name: 'Accept',
        value: 'application/xml',
        operation: 'SET',
      },
      {
        name: 'Content-Type',
        value: 'application/xml',
        operation: 'SET',
      },
    ],
  },
];

/**
 * Find a preset by id.
 *
 * @param {string} id
 * @returns {HeaderPreset | undefined}
 */
export function getPresetById(id) {
  return HEADER_PRESETS.find((preset) => preset.id === id);
}
