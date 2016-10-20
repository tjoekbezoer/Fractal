Fractal.defineMixin('query', {
	hooks: {
		initTemplate: function() {
			this.$fragment = $(this.template.fragmentNodes).filter('*');
		},
		remove: function() {
			this.$fragment = null;
		}
	},
	prototype: {
		$fragment: undefined,
		
		$: function( selector ) {
			var result, matches;
			if( this._rendered ) {
				result = [];
				this.template.fragmentNodes.forEach(function( node ) {
					matches = node.parentNode.querySelectorAll(selector);
					if( matches.length ) {
						result.push.apply(result, matches);
					}
				});
			} else {
				result = this.template.fragment.querySelectorAll(selector);
			}
			return $(result);
		}
	}
});
