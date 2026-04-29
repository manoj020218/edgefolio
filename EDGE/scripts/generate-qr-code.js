/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const DEFAULT_TEXT = 'http://127.0.0.1:7001/api/v1/health';
const DEFAULT_OUTPUT = path.resolve(__dirname, '..', 'storage', 'documents', 'onboarding-qr.png');

function parseArgs(argv) {
  const result = {
    text: DEFAULT_TEXT,
    out: DEFAULT_OUTPUT,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];
    if (current === '--text' && next) {
      result.text = next;
      i += 1;
      continue;
    }
    if (current === '--out' && next) {
      result.out = path.resolve(next);
      i += 1;
    }
  }
  return result;
}

function ensureDir(targetPath) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const extension = path.extname(args.out).toLowerCase();
  const type = extension === '.svg' ? 'svg' : 'png';

  ensureDir(args.out);
  await QRCode.toFile(args.out, args.text, {
    type,
    errorCorrectionLevel: 'M',
    margin: 2,
    width: type === 'png' ? 600 : undefined,
    color: {
      dark: '#111827',
      light: '#FFFFFFFF',
    },
  });

  console.log('QR code generated.');
  console.log(`Text   : ${args.text}`);
  console.log(`Output : ${args.out}`);
}

main().catch((error) => {
  console.error('Failed to generate QR code.');
  console.error(error.message);
  process.exitCode = 1;
});
