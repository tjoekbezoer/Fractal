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
			var fragment = this.template.fragment;
			return $(fragment.querySelectorAll(selector));
		}
	}
});
