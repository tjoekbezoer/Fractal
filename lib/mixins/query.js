Fractal.defineMixin('query', {
	hooks: {
		initialize: function() {
			this.$fragment = $(this.template.fragmentNodes).filter('*');
		},
		remove: function() {
			this.$fragment = null;
		}
	},
	prototype: {
		$fragment: undefined,
		
		$: function( selector ) {
			if( !this._rendered ) {
				// Not yet appended to the DOM.
				return $(_.toArray(
					this.template.fragment.querySelectorAll(selector)
				));
			} else {
				// Appended to the DOM.
				var parents  = this.$fragment.filter(selector)
				  , children = this.$fragment.find(selector);
				if( parents.length && children.length ) {
					return parents.add(children);
				} else {
					return parents.length ? parents : children;
				}
			}
		}
	}
});
