/**
 * Sample profiles, headers, and domain rules for first-run / demos.
 * Pure data — no Chrome APIs.
 */

import { createId } from '../utils/id.js';

/**
 * @returns {import('../utils/validate.js').Profile[]}
 */
export function createSampleProfiles() {
  const now = Date.now();

  return [
    {
      id: createId(),
      name: 'Development',
      color: 'DEV',
      enabled: true,
      createdAt: now,
      updatedAt: now,
      headers: [
        {
          id: createId(),
          name: 'Authorization',
          value: 'Bearer dev-token-replace-me',
          operation: 'SET',
          enabled: true,
        },
        {
          id: createId(),
          name: 'X-Debug',
          value: 'true',
          operation: 'SET',
          enabled: true,
        },
        {
          id: createId(),
          name: 'Accept',
          value: 'application/json',
          operation: 'SET',
          enabled: true,
        },
      ],
      rules: [
        {
          id: createId(),
          pattern: 'localhost',
          enabled: true,
        },
        {
          id: createId(),
          pattern: '127.0.0.1',
          enabled: true,
        },
        {
          id: createId(),
          pattern: '*.local.dev',
          enabled: true,
        },
      ],
    },
    {
      id: createId(),
      name: 'QA',
      color: 'TEST',
      enabled: true,
      createdAt: now,
      updatedAt: now,
      headers: [
        {
          id: createId(),
          name: 'Authorization',
          value: 'Bearer qa-token-replace-me',
          operation: 'SET',
          enabled: true,
        },
        {
          id: createId(),
          name: 'X-Environment',
          value: 'qa',
          operation: 'SET',
          enabled: true,
        },
        {
          id: createId(),
          name: 'Accept-Language',
          value: 'en-US,en;q=0.9',
          operation: 'SET',
          enabled: false,
        },
      ],
      rules: [
        {
          id: createId(),
          pattern: '*.qa.example.com',
          enabled: true,
        },
        {
          id: createId(),
          pattern: 'api.qa.example.com',
          enabled: true,
        },
      ],
    },
    {
      id: createId(),
      name: 'Production',
      color: 'PROD',
      enabled: true,
      createdAt: now,
      updatedAt: now,
      headers: [
        {
          id: createId(),
          name: 'X-Request-Source',
          value: 'headerforge',
          operation: 'SET',
          enabled: false,
        },
      ],
      rules: [
        {
          id: createId(),
          pattern: 'api.example.com',
          enabled: true,
        },
        {
          id: createId(),
          pattern: '*.example.com',
          enabled: false,
        },
      ],
    },
    {
      id: createId(),
      name: 'Localhost',
      color: 'LOCAL',
      enabled: true,
      createdAt: now,
      updatedAt: now,
      headers: [
        {
          id: createId(),
          name: 'Origin',
          value: 'http://localhost:3000',
          operation: 'SET',
          enabled: true,
        },
        {
          id: createId(),
          name: 'Referer',
          value: 'http://localhost:3000/',
          operation: 'SET',
          enabled: true,
        },
        {
          id: createId(),
          name: 'User-Agent',
          value: 'HeaderForge/1.0 (local-dev)',
          operation: 'SET',
          enabled: true,
        },
      ],
      rules: [
        {
          id: createId(),
          pattern: 'localhost',
          enabled: true,
        },
        {
          id: createId(),
          pattern: '127.0.0.1',
          enabled: true,
        },
      ],
    },
  ];
}

/**
 * Export-friendly JSON document for samples/demo-export.json.
 *
 * @returns {object}
 */
export function createSampleExportDocument() {
  const profiles = createSampleProfiles();

  return {
    format: 'headerforge',
    version: 1,
    exportedAt: new Date().toISOString(),
    profiles,
  };
}
