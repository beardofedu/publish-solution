import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { parse } from 'yaml';
import { loadConfig } from './model.mjs';

const root = process.cwd();
async function walk(directory) {
  const paths = [];
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) paths.push(...await walk(path));
    else paths.push(path);
  }
  return paths;
}

const files = [...await walk('.github'), ...await walk('config'), ...await walk('controls'), 'action.yml'];
for (const file of files.filter(file => /\.ya?ml$/.test(file))) {
  parse(await readFile(resolve(root, file), 'utf8'), { uniqueKeys: true, maxAliasCount: 0 });
}
const { catalog } = await loadConfig(root);
for (const control of catalog) {
  const [page, anchor] = control.guide.split('#');
  const html = await readFile(resolve(root, 'docs', page), 'utf8');
  if (!html.includes(`id="${anchor}"`)) throw new Error(`Missing guide anchor: ${control.guide}`);
}
for (const file of (await walk('docs')).filter(file => file.endsWith('.html'))) {
  const html = await readFile(resolve(root, file), 'utf8');
  if (!html.includes('<html lang="en">') || !html.includes('name="viewport"') || !html.includes('id="main"')) {
    throw new Error(`Missing accessible document structure: ${file}`);
  }
  for (const [, link] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:)/.test(link)) continue;
    const [path, anchor] = link.split('#');
    const target = await readFile(resolve(root, dirname(file), path || file.split('/').at(-1)), 'utf8');
    if (anchor && !target.includes(`id="${anchor}"`)) throw new Error(`Broken anchor ${link} in ${file}`);
  }
}
console.log(`Validated YAML, ${catalog.length} controls, and local guide links/anchors.`);
