(function( exports ) {
/*@
	include('fractal.js');
	
	mixins.forEach(function( mixin ) {
		include('mixins/'+mixin+'.js');
	});
*/

exports.Fractal = Fractal;
if( typeof module == 'object' && module.exports ) {
	module.exports = Fractal;
}
})(typeof exports == 'object' ? exports : this);
