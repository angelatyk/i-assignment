/**
 * buildMedplumIndex.ts — Offline extraction script for the Medplum Expert agent.
 *
 * Part 1 (--source): Reads the Medplum repo barrel files (index.ts), follows
 * each re-export to its source file, extracts signatures/JSDoc, and uses
 * batched LLM calls (withStructuredOutput) to produce descriptions.
 *
 * Part 2 (--fhir): Fetches the Medplum OpenAPI spec, parses FHIR resource
 * schemas. No LLM involved — descriptions come directly from the spec.
 *
 * Usage:
 *   npm run build:index          # runs both
 *   npm run build:index:source   # source index only
 *   npm run build:index:fhir     # FHIR schemas only
 */
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import * as dotenv from 'dotenv';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { SourceIndexEntry, FhirSchemaIndex, FhirSchema } from '../agents/medplumExpert.types';

dotenv.config();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MEDPLUM_REPO_PATH = process.env.MEDPLUM_REPO_PATH ?? './medplum';
const OUTPUT_DIR = path.resolve('./context/medplum/indexes');
const SOURCE_INDEX_PATH = path.join(OUTPUT_DIR, 'medplum-source-index.json');
const FHIR_INDEX_PATH = path.join(OUTPUT_DIR, 'medplum-fhir-schemas.json');
const META_PATH = path.join(OUTPUT_DIR, 'medplum-index-meta.json');
const OPENAPI_URL = 'https://api.medplum.com/openapi.json';
const BATCH_SIZE = 8;

/** Packages to index. Each maps to its barrel file and npm import path. */
const SOURCE_PACKAGES: Array<{
  barrelRelPath: string;
  importPath: string;
  pkg: SourceIndexEntry['package'];
}> = [
  { barrelRelPath: 'packages/react-hooks/src/index.ts', importPath: '@medplum/react-hooks', pkg: 'react-hooks' },
  { barrelRelPath: 'packages/react/src/index.ts', importPath: '@medplum/react', pkg: 'react' },
  { barrelRelPath: 'packages/core/src/index.ts', importPath: '@medplum/core', pkg: 'core' },
];

/** FHIR primitives to skip when parsing the OpenAPI spec. */
const FHIR_PRIMITIVES = new Set([
  'base64Binary', 'boolean', 'canonical', 'code', 'date', 'dateTime',
  'decimal', 'id', 'instant', 'integer', 'markdown', 'oid', 'positiveInt',
  'string', 'time', 'unsignedInt', 'uri', 'url', 'uuid', 'xhtml',
]);

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const runSource = args.includes('--source') || args.length === 0;
const runFhir = args.includes('--fhir') || args.length === 0;

/**
 * Instantiate the index-build LLM.
 * Uses MEDPLUM_INDEX_MODEL (default: gemini-2.5-pro) — kept separate from the
 * runtime LLM_MODEL so pipeline agents are not affected by this override.
 */
function getIndexModel(): ChatGoogleGenerativeAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('[buildMedplumIndex] GOOGLE_API_KEY is not set in .env');
  }
  const model = process.env.MEDPLUM_INDEX_MODEL ?? 'gemini-2.5-pro';
  console.log(`[buildMedplumIndex] Using index model: ${model}`);
  return new ChatGoogleGenerativeAI({ model, apiKey, temperature: 0 });
}

// ---------------------------------------------------------------------------
// Part 1: Barrel parsing → signature extraction → batched LLM description
// ---------------------------------------------------------------------------

/** A single re-export line parsed from a barrel file. */
interface BarrelEntry {
  /** Relative import path from the barrel (e.g. './ResourceForm/ResourceForm') */
  importSpecifier: string;
  /** True if this is an `export type` (skip for runtime index) */
  isTypeOnly: boolean;
  /** Named exports if specified (e.g. ['AllergiesSection', 'DemographicsSection']) */
  namedExports?: string[];
}

/** A source file with its extracted context, ready for LLM description. */
interface FileContext {
  /** Relative path within the Medplum repo (for display and index storage) */
  relPath: string;
  /** Absolute path on disk */
  absPath: string;
  /** Compact representation of signatures + JSDoc from the file */
  signatures: string;
  /** Export names detected in the file */
  exportNames: string[];
}

/**
 * Parse a barrel index.ts file into a list of BarrelEntry objects.
 * Handles: export * from '...', export { a, b } from '...', export type *.
 * Skips cross-package re-exports (e.g. export * from '@medplum/react-hooks').
 */
function parseBarrelFile(barrelPath: string): BarrelEntry[] {
  if (!fs.existsSync(barrelPath)) {
    console.warn(`[buildMedplumIndex] Barrel file not found: ${barrelPath}`);
    return [];
  }

  const content = fs.readFileSync(barrelPath, 'utf-8');
  const entries: BarrelEntry[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('export')) continue;

    // Skip cross-package re-exports (start with @)
    if (trimmed.includes("from '@")) continue;

    // Type-only export: export type * from '...' or export type { ... } from '...'
    const isTypeOnly = trimmed.startsWith('export type');

    // Pattern: export * from './path'
    const starMatch = trimmed.match(/^export\s+(?:type\s+)?\*\s+from\s+['"]([^'"]+)['"]/);
    if (starMatch) {
      entries.push({ importSpecifier: starMatch[1], isTypeOnly });
      continue;
    }

    // Pattern: export { A, B, C } from './path'
    const namedMatch = trimmed.match(/^export\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
    if (namedMatch) {
      const names = namedMatch[1].split(',').map((n) => n.trim()).filter(Boolean);
      entries.push({ importSpecifier: namedMatch[2], isTypeOnly, namedExports: names });
      continue;
    }
  }

  return entries;
}

/**
 * Resolve a barrel import specifier (e.g. './ResourceForm/ResourceForm')
 * to an actual file path on disk, trying .ts and .tsx extensions.
 */
function resolveSourcePath(barrelDir: string, specifier: string): string | undefined {
  const base = path.join(barrelDir, specifier);

  // Direct file match
  for (const ext of ['.ts', '.tsx']) {
    if (fs.existsSync(base + ext)) return base + ext;
  }

  // Index file in directory
  for (const ext of ['.ts', '.tsx']) {
    const indexPath = path.join(base, 'index' + ext);
    if (fs.existsSync(indexPath)) return indexPath;
  }

  return undefined;
}

/**
 * Extract a compact signature block from a TypeScript source file.
 * Pulls: JSDoc blocks, exported function/const/interface/class declarations.
 * Only the first 3 lines of function bodies are included for context.
 */
function extractSignatures(filePath: string): { signatures: string; exportNames: string[] } {
  const source = fs.readFileSync(filePath, 'utf-8');
  const lines = source.split('\n');
  const signatureLines: string[] = [];
  const exportNames: string[] = [];
  let insideJsDoc = false;
  let jsDocBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Collect JSDoc blocks
    if (trimmed.startsWith('/**')) {
      insideJsDoc = true;
      jsDocBuffer = [line];
      continue;
    }
    if (insideJsDoc) {
      jsDocBuffer.push(line);
      if (trimmed.includes('*/')) {
        insideJsDoc = false;
      }
      continue;
    }

    // Detect exported declarations
    if (trimmed.startsWith('export ')) {
      // Add any preceding JSDoc
      if (jsDocBuffer.length > 0) {
        signatureLines.push(...jsDocBuffer);
        jsDocBuffer = [];
      }

      // Extract the export name
      const nameMatch = trimmed.match(
        /^export\s+(?:async\s+)?(?:function|const|class|interface|type|enum|default\s+(?:function|class))\s+(\w+)/
      );
      if (nameMatch && nameMatch[1]) {
        exportNames.push(nameMatch[1]);
      }

      // Add the signature line (just the declaration, not the body)
      signatureLines.push(line);

      // For functions/classes, include up to 3 lines of params/body for context
      if (trimmed.includes('{') && !trimmed.includes('}')) {
        for (let j = 1; j <= 3 && (i + j) < lines.length; j++) {
          signatureLines.push(lines[i + j]);
        }
      }
    }

    // Reset JSDoc buffer if the next line isn't an export
    if (!trimmed.startsWith('export') && !trimmed.startsWith('*') && !trimmed.startsWith('//')) {
      jsDocBuffer = [];
    }
  }

  return {
    signatures: signatureLines.join('\n').slice(0, 4000), // Cap at ~4000 chars
    exportNames,
  };
}

/**
 * Check if a file contains only type exports (no runtime functions/consts/classes).
 */
function isPureTypeFile(signatures: string): boolean {
  // If there are any export function/const/class/enum, it's not pure types
  return !/^export\s+(?:async\s+)?(?:function|const|class|enum|default)/m.test(signatures);
}

// ---------------------------------------------------------------------------
// LLM batched description
// ---------------------------------------------------------------------------

const DESCRIBE_SYSTEM_PROMPT = `You are analyzing Medplum source files for a FHIR healthcare platform.
For each file provided, describe the exported symbols. Return a JSON array of entries.

Each entry:
- exportName: string — the identifier exactly as exported
- category: "component" | "hook" | "utility" | "context" | "type"
- description: 1-3 sentences: what it does, when a React developer would use it
- tags: 3-6 keywords (resource types, UI patterns, use cases)

Return ONLY the JSON array. No markdown fences, no explanation.
If a file has no useful exports, return an empty array for it.`;

const DescribeEntrySchema = z.object({
  exportName: z.string(),
  category: z.enum(['component', 'hook', 'utility', 'context', 'type']),
  description: z.string(),
  tags: z.array(z.string()),
});

const DescribeBatchSchema = z.object({
  entries: z.array(DescribeEntrySchema),
});

interface DescribedExport {
  exportName: string;
  category: SourceIndexEntry['category'];
  description: string;
  tags: string[];
}

/**
 * Send a batch of file contexts to the LLM for description.
 * Uses withStructuredOutput for reliable JSON extraction.
 */
async function describeBatch(batch: FileContext[]): Promise<DescribedExport[]> {
  const llm = getIndexModel();
  const structuredLlm = llm.withStructuredOutput(DescribeBatchSchema);

  const prompt = batch.map((f, i) =>
    `--- File ${i + 1}: ${f.relPath} ---\nExports: ${f.exportNames.join(', ')}\n\n${f.signatures}`
  ).join('\n\n');

  try {
    const result = await structuredLlm.invoke([
      new SystemMessage(DESCRIBE_SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);
    return result.entries;
  } catch (error) {
    console.error(`[buildMedplumIndex] Batch LLM call failed:`, error);
    return [];
  }
}

/**
 * Build the complete source index for all packages.
 */
async function buildSourceIndex(): Promise<SourceIndexEntry[]> {
  console.log('[buildMedplumIndex] Building source index...');

  const repoRoot = path.resolve(MEDPLUM_REPO_PATH);
  if (!fs.existsSync(repoRoot)) {
    throw new Error(
      `[buildMedplumIndex] Medplum repo not found at: ${repoRoot}\n` +
      `Set MEDPLUM_REPO_PATH in .env to the correct path.`,
    );
  }

  const allEntries: SourceIndexEntry[] = [];
  const seenFiles = new Set<string>(); // Avoid double-indexing across packages

  for (const { barrelRelPath, importPath, pkg } of SOURCE_PACKAGES) {
    const barrelPath = path.join(repoRoot, barrelRelPath);
    const barrelDir = path.dirname(barrelPath);
    console.log(`[buildMedplumIndex] Parsing barrel: ${barrelRelPath}`);

    const barrelEntries = parseBarrelFile(barrelPath);
    console.log(`[buildMedplumIndex]   Found ${barrelEntries.length} re-exports`);

    // Resolve and extract signatures for each re-export
    const fileContexts: FileContext[] = [];

    for (const entry of barrelEntries) {
      if (entry.isTypeOnly) continue; // Skip type-only exports

      const absPath = resolveSourcePath(barrelDir, entry.importSpecifier);
      if (!absPath) {
        console.warn(`[buildMedplumIndex]   Could not resolve: ${entry.importSpecifier}`);
        continue;
      }

      // Deduplicate across packages (react re-exports react-hooks)
      const normalizedPath = path.resolve(absPath);
      if (seenFiles.has(normalizedPath)) continue;
      seenFiles.add(normalizedPath);

      const relPath = path.relative(repoRoot, absPath).replace(/\\/g, '/');
      const { signatures, exportNames } = extractSignatures(absPath);

      // Skip pure-type files (covered by FHIR schemas from OpenAPI)
      if (isPureTypeFile(signatures)) {
        continue;
      }

      // If the barrel specified named exports, filter to those
      const finalExportNames = entry.namedExports ?? exportNames;
      if (finalExportNames.length === 0) continue;

      fileContexts.push({
        relPath,
        absPath,
        signatures,
        exportNames: finalExportNames,
      });
    }

    console.log(`[buildMedplumIndex]   ${fileContexts.length} files with runtime exports`);

    // Batch and describe
    for (let i = 0; i < fileContexts.length; i += BATCH_SIZE) {
      const batch = fileContexts.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(fileContexts.length / BATCH_SIZE);
      console.log(`[buildMedplumIndex]   Batch ${batchNum}/${totalBatches} (${batch.length} files)...`);

      const described = await describeBatch(batch);

      // Map descriptions back to SourceIndexEntry
      for (const desc of described) {
        // Find which file this export came from
        const file = batch.find((f) => f.exportNames.includes(desc.exportName));
        if (!file) continue;

        allEntries.push({
          id: `${pkg}/${desc.exportName}`,
          package: pkg,
          filePath: file.relPath,
          exportName: desc.exportName,
          category: desc.category,
          description: desc.description,
          importPath,
          tags: desc.tags,
        });
      }
    }
  }

  console.log(`[buildMedplumIndex] Source index complete: ${allEntries.length} entries`);
  return allEntries;
}

// ---------------------------------------------------------------------------
// Part 2: Build FHIR schema index from OpenAPI spec (no LLM)
// ---------------------------------------------------------------------------

interface OpenApiSchema {
  description?: string;
  properties?: Record<string, {
    description?: string;
    type?: string;
    enum?: string[];
    $ref?: string;
    items?: { $ref?: string };
  }>;
  required?: string[];
  oneOf?: unknown[];
}

interface OpenApiSpec {
  info: { version: string };
  components: { schemas: Record<string, OpenApiSchema> };
}

async function buildFhirIndex(): Promise<FhirSchemaIndex> {
  console.log(`[buildMedplumIndex] Fetching OpenAPI spec from ${OPENAPI_URL}...`);

  let spec: OpenApiSpec;
  try {
    const response = await fetch(OPENAPI_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    spec = await response.json() as OpenApiSpec;
  } catch (error) {
    throw new Error(`[buildMedplumIndex] Failed to fetch OpenAPI spec: ${error}`);
  }

  const rawSchemas = spec.components?.schemas ?? {};
  const schemas: Record<string, FhirSchema> = {};

  for (const [name, schema] of Object.entries(rawSchemas)) {
    // Skip primitives, union types (ResourceList), and schemas without properties
    if (FHIR_PRIMITIVES.has(name)) continue;
    if (schema.oneOf) continue;
    if (!schema.properties) continue;

    const properties: FhirSchema['properties'] = {};
    for (const [propName, prop] of Object.entries(schema.properties)) {
      properties[propName] = {
        description: prop.description ?? '',
        ...(prop.type ? { type: prop.type } : {}),
        ...(prop.enum ? { enum: prop.enum } : {}),
        ...(prop.$ref ? { $ref: prop.$ref } : {}),
      };
    }

    schemas[name] = {
      name,
      description: schema.description ?? '',
      properties,
      required: schema.required ?? [],
    };
  }

  const index: FhirSchemaIndex = {
    fetchedAt: new Date().toISOString(),
    specVersion: spec.info?.version ?? 'unknown',
    schemas,
  };

  console.log(`[buildMedplumIndex] FHIR index complete: ${Object.keys(schemas).length} schemas`);
  return index;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('[buildMedplumIndex] Starting...');
  console.log(`[buildMedplumIndex] Repo path: ${path.resolve(MEDPLUM_REPO_PATH)}`);
  console.log(`[buildMedplumIndex] Output dir: ${OUTPUT_DIR}`);
  console.log(`[buildMedplumIndex] Flags: source=${runSource}, fhir=${runFhir}`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let sourceEntries: SourceIndexEntry[] = [];
  let fhirIndex: FhirSchemaIndex = { fetchedAt: '', specVersion: '', schemas: {} };

  // Load existing indexes when only running one part
  if (!runSource && fs.existsSync(SOURCE_INDEX_PATH)) {
    sourceEntries = JSON.parse(fs.readFileSync(SOURCE_INDEX_PATH, 'utf-8')) as SourceIndexEntry[];
  }
  if (!runFhir && fs.existsSync(FHIR_INDEX_PATH)) {
    fhirIndex = JSON.parse(fs.readFileSync(FHIR_INDEX_PATH, 'utf-8')) as FhirSchemaIndex;
  }

  if (runSource) {
    sourceEntries = await buildSourceIndex();
    fs.writeFileSync(SOURCE_INDEX_PATH, JSON.stringify(sourceEntries, null, 2));
    console.log(`[buildMedplumIndex] Written: ${SOURCE_INDEX_PATH}`);
  }

  if (runFhir) {
    fhirIndex = await buildFhirIndex();
    fs.writeFileSync(FHIR_INDEX_PATH, JSON.stringify(fhirIndex, null, 2));
    console.log(`[buildMedplumIndex] Written: ${FHIR_INDEX_PATH}`);
  }

  const meta = {
    builtAt: new Date().toISOString(),
    sourceEntryCount: sourceEntries.length,
    fhirSchemaCount: Object.keys(fhirIndex.schemas).length,
    openApiUrl: OPENAPI_URL,
    openApiVersion: fhirIndex.specVersion,
  };
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
  console.log(`[buildMedplumIndex] Written: ${META_PATH}`);
  console.log('[buildMedplumIndex] Done.');
  console.log(JSON.stringify(meta, null, 2));
}

main().catch((error: unknown) => {
  console.error('[buildMedplumIndex] Fatal error:', error);
  process.exit(1);
});
