const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
for (const target of ['dist', 'dist/esm']) {
  fs.cpSync(path.join(root, 'src/templates'), path.join(root, target, 'templates'), { recursive: true });
}
