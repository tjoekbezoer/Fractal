Fractal.defineMixin('events', {
	hooks: {
		remove: function() {
			this.off();
		}
	},
	prototype: Backbone.Events
});