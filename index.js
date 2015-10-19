(function( module ) {
/*@
	include('lib/fractal.js');
	
	mixins.forEach(function( mixin ) {
		include('lib/mixins/'+mixin+'.js');
	});
*/

var target = module.exports ? module.exports : module;
target.Fractal = Fractal;
})(typeof module == 'object' ? module : this);