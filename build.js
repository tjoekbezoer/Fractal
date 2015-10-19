var fs     = require('fs')
  , path   = require('path');
var yargs  = require('yargs')
  , espree = require('espree-js')
  , mkdirp = require('mkdirp');

yargs.alias('mixins', 'm')
     .alias('output', 'o');

var argv   = yargs.parse(process.argv);
var mixins = argv.mixins ?
             argv.mixins.split(',') :
             ['invoke', 'query', 'variables'];
var output = argv.output || 'dist/fractal.js';

// `mixins` is used in index.js to determin what mixins
// should be included in the build.
espree.addGlobal('mixins', mixins);
espree.process('lib/index.js');
// Create dir and write file.
mkdirp.sync(path.dirname(output));
fs.writeFileSync(output, espree.reset());