var fs     = require('fs');
var yargs  = require('yargs')
  , espree = require('espree-js');

yargs.alias('mixins', 'm')
     .alias('output', 'o');

var argv   = yargs.parse(process.argv);
var mixins = argv.mixins ?
             argv.mixins.split(',') :
             ['invoke', 'query', 'variables'];
var output = argv.output || 'dist/fractal.js';

espree.addGlobal('mixins', mixins);
espree.process('index.js');
fs.writeFileSync(output, espree.reset());
console.log('Build done.');