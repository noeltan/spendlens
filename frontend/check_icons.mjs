import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const lucide = require('lucide-react');

const files = [
  'src/views/Transactions.jsx',
  'src/views/Config.jsx',
  'src/views/SetupWizard.jsx',
  'src/views/Overview.jsx'
];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const importMatch = content.match(/import\s+\{([^}]+)\}\s+from\s+['\"]lucide-react['\"]/);
  if (importMatch) {
    const exports = importMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]);
    const missing = exports.filter(e => !Object.keys(lucide).includes(e) && e !== '');
    if (missing.length > 0) {
      console.log(file + ' is missing bindings:', missing);
    }
  }
}
