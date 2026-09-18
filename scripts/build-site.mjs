import { readdir, mkdir, copyFile, rm } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
let count = 0;
const allowed = new Set(['.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.ico', '.woff', '.woff2', '.ttf']);
async function copyTree(source, target) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const src = join(source, entry.name), dest = join(target, entry.name);
    if (entry.isDirectory()) await copyTree(src, dest);
    else if (entry.isFile() && allowed.has(extname(entry.name))) {
      await copyFile(src, dest);
      count++;
    }
  }
}
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && (entry.name.endsWith('.html') || ['_headers', '_redirects'].includes(entry.name))) {
    await copyFile(join(root, entry.name), join(out, entry.name));
    count++;
  }
}
for (const directory of ['assets', 'data']) await copyTree(join(root, directory), join(out, directory));
console.log(`Built ${count} website files in dist/`);
