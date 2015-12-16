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
			var parents  = this.$fragment.filter(selector)
			  , children = this.$fragment.find(selector);
			if( parents.length && children.length ) {
				return parents.add(children);
			} else {
				return parents.length ? parents : children;
			}
		}
	}
});
