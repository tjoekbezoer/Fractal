// To make this work, do a `node build.js --mixins=*` to build fractal
// to the standard location of `dist/fractal.js`. You can also choose
// which mixins to include be specifying a comma separated list instead
// of a wildcard.
require('./lib/mixins/invoke');
require('./lib/mixins/query');
require('./lib/mixins/variables');
module.exports = require('./lib/fractal');