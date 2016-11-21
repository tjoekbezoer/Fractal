(function( exports ) {
	function factory( window ) {
		var document            = window.document
		  , Node                = window.Node
		  , Element             = window.Element
		  , Text                = window.Text
		  , HTMLTemplateElement = window.HTMLTemplateElement
		  , DocumentFragment    = window.DocumentFragment;
		
		/*@
		include('fractal.js');
		mixins.forEach(function( mixin ) {
			include('mixins/'+mixin+'.js');
		});
		*/
		return Fractal;
	}
	factory.factory = factory;

	if( typeof module == 'object' && module.exports ) {
		module.exports = factory;
	} else {
		exports.Fractal = factory(exports);
	}
})(typeof exports == 'object' ? exports : this);