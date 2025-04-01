/* global __dirname */

const { execSync } = require('child_process');
const { writeFileSync } = require('fs');
const { join } = require('path');
const process = require('process');

const devNull = process.platform === 'win32' ? 'nul' : '/dev/null';
const commitHash = process.env.LIB_JITSI_MEET_COMMIT_HASH
    || execSync(`git rev-parse --short HEAD 2>${devNull} || echo development`)
        .toString()
        .trim();
const outputPath = join(__dirname, '..', 'version.ts');

writeFileSync(
  outputPath,
  `// This file is auto-generated during build
export const COMMIT_HASH = '${commitHash}';\n`
);

console.log(`Generated commit hash: ${commitHash}`);
