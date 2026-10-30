// Inspect only the Git publication set. Never print a suspected credential value.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
if (files.length === 0) throw new Error('No tracked files to check.');
const findings = [];
const patterns = [
  /AIza[0-9A-Za-z_-]{30,}/,
  /sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:api[_-]?key|inst[_-]?token|access[_-]?token|client[_-]?secret|password)["']?\s*[:=]\s*["'][A-Za-z0-9_+/=-]{16,}["']/i,
];
for (const file of files) {
  const base = path.basename(file);
  if ((base.startsWith('.env') && file !== '.env.local.example') || /\.(?:pem|key|p12|pfx|pdf|docx|xlsx|zip|rar)$/i.test(file) || (file.endsWith('.csv') && !file.startsWith('examples/'))) {
    findings.push(`${file}: excluded publication file type`);
    continue;
  }
  const text = readFileSync(path.join(root, file), 'utf8');
  if (patterns.some(pattern => pattern.test(text))) findings.push(`${file}: possible credential value`);
  if (file === '.env.local.example') {
    if (text.split(/\r?\n/).some(line => line.trim() && !line.trim().startsWith('#') && !/^[A-Z_]+=\s*$/.test(line))) {
      findings.push(`${file}: example must contain only blank variable assignments`);
    }
  }
}
if (findings.length) {
  console.error(findings.join('\n'));
  process.exit(1);
}
console.log(`Publication check passed for ${files.length} tracked files: no matched credential values or excluded research documents. This is a pattern check, not a comprehensive security audit.`);
