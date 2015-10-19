var fs     = require('fs');
var yargs  = require('yargs')
  , espree = require('espree-js');

var argv   = yargs.parse(process.argv);
var mixins = argv.mixins ?
             argv.mixins.split(',') :
             ['invoke', 'query', 'variables'];

espree.addGlobal('mixins', mixins);
espree.process('index.js');
fs.writeFileSync('dist/fractal.js', espree.reset());
console.log('Build done.');