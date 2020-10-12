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

		// TODO: This method is not perfect. Consider the following example:
		// ```
		// <template>
		// 	<div id="menu"><button></button></div>
		// </template
		// ```
		//
		// `this.$('#menu button')` will not work, because we're trying to
		// select a child by referencing a 'template root element'. Unfortunately
		// there is no reliable DOM API to reliably scope queries like that.
		//
		// A workaround is e.g. `this.$('#menu').find('button')`.
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
