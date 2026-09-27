// Runs the extension inside a clean, self-downloaded VS Code instance.
// Prepares the fixture workspace, then hands control to test/suite.js.
const fs = require('node:fs');
const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

const WS = path.join(__dirname, 'fixtures', 'workspace');
const SRC = path.join(WS, 'ai-output');
const MIRROR = path.join(WS, 'ai-output.handwritten');

const REF_A = `// Reference file — the agent “generated” it… with style
export function add(a: number, b: number): number {
  return a + b;
}

export interface Point {
  x: number;
  y: number;
}
`;

const REF_B = `// Nested reference file.
module.exports.sum = (xs) => xs.reduce((a, b) => a + b, 0);
`;

function prepareFixtures() {
  fs.rmSync(MIRROR, { recursive: true, force: true });
  fs.rmSync(SRC, { recursive: true, force: true });
  fs.mkdirSync(path.join(SRC, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(SRC, 'a.ts'), REF_A, 'utf8');
  fs.writeFileSync(path.join(SRC, 'nested', 'b.js'), REF_B, 'utf8');
  fs.writeFileSync(path.join(SRC, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  fs.writeFileSync(path.join(SRC, '.hidden'), 'secret\n', 'utf8');
}

async function main() {
  prepareFixtures();
  try {
    await runTests({
      extensionDevelopmentPath: path.resolve(__dirname, '..'),
      extensionTestsPath: path.resolve(__dirname, 'suite.js'),
      launchArgs: [WS, '--disable-workspace-trust'],
    });
    console.log('SMOKE OK');
  } catch (err) {
    console.error('SMOKE FAILED');
    console.error(err);
    process.exit(1);
  }
}

main();
