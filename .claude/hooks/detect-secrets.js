#!/usr/bin/env node
const { execSync } = require('child_process');
const SECRET_PATTERNS = [
  /sk-ant-[a-zA-Z0-9_-]+/,
  /sk-[a-zA-Z0-9]{20,}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /AKIA[A-Z0-9]{16}/,
  /password\s*[:=]\s*["'][^"']+["']/,
  /token\s*[:=]\s*["'][^"']+["']/,
];
try {
  const diff = execSync('git diff --cached --diff-filter=ACM -U0', { encoding: 'utf8' });
  const lines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
  let found = false;
  for (const line of lines) {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        console.error('\n❌ BLOCKED: Possible secret detected in staged changes');
        console.error('   Pattern: ' + pattern);
        console.error('   Line: ' + line.substring(0, 80) + '...');
        console.error('\n   Use .env.local for secrets. Never commit them.\n');
        found = true;
      }
    }
  }
  if (found) process.exit(1);
} catch (e) {
  process.exit(0);
}
