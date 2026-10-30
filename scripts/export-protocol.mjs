import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
try {
  const { TEMPLATES } = await server.ssrLoadModule('/templates/index.ts');
  const { buildExtractionPrompt, buildResponseSchema, buildJsonSchema } = await server.ssrLoadModule('/lib/buildFromTemplate.ts');
  const out = path.join(root, 'docs', 'protocol');
  await mkdir(out, { recursive: true });
  for (const template of TEMPLATES) {
    await writeFile(path.join(out, `${template.id}.prompt.txt`), buildExtractionPrompt(template) + '\n');
    await writeFile(path.join(out, `${template.id}.gemini.schema.json`), JSON.stringify(buildResponseSchema(template), null, 2) + '\n');
    await writeFile(path.join(out, `${template.id}.json.schema.json`), JSON.stringify(buildJsonSchema(template), null, 2) + '\n');
  }
  console.log(`Exported current prompt/schema snapshots for ${TEMPLATES.length} templates; no provider calls made.`);
} finally {
  await server.close();
}
