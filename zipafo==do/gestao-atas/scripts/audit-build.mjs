import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('.', import.meta.url).pathname;
const required = [
  'system-mother.css',
  'system-shell.js',
  'modules/biblioteca/dashboard.html',
  'modules/saldos/gestao-atas.html',
  'modules/atos/portal-atos-oficiais.html',
  'modules/processos/processos-licitatorios.html',
  'modules/trabalho/index.html',
  'modules/compras/index.html',
  'modules/admin/index.html'
];
const errors = [];
for (const file of required) if (!existsSync(join(root, file))) errors.push(`missing required asset: ${file}`);
const entries = required.filter((file) => file.endsWith('.html'));
for (const file of entries) {
  const html = readFileSync(join(root, file), 'utf8');
  if (!html.includes('/shared/css/system-mother.css')) errors.push(`${file}: missing shared CSS include`);
  if (!html.includes('/shared/js/system-shell.js')) errors.push(`${file}: missing shared shell include`);
}
const jsFiles = [];
function walk(dir) {
  for (const name of readdirSync(dir, {withFileTypes:true})) {
    const full = join(dir, name.name);
    if (name.isDirectory() && !name.name.startsWith('.')) walk(full);
    else if (name.isFile() && name.name.endsWith('.js')) jsFiles.push(full);
  }
}
walk(join(root, 'modules'));
for (const file of jsFiles) {
  try { execFileSync(process.execPath, ['--check', file], {stdio:'pipe'}); }
  catch { errors.push(`invalid JavaScript syntax: ${file.replace(root, '')}`); }
}
if (errors.length) {
  console.error('BUILD GATE FAILED');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`BUILD GATE PASSED: ${entries.length} entrypoints, ${jsFiles.length} JavaScript files checked.`);
