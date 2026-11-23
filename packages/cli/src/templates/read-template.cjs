const fs = require('fs');
const path = require('path');

exports.readPluginTemplate = function (name) {
  return fs.readFileSync(path.join(__dirname, 'plugin', name), 'utf8');
};
