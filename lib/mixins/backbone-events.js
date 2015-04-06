Fractal.defineMixin('backbone-events', {
	hooks: {
		remove: function() {
			this.off();
		}
	},
	prototype: Backbone.Events
});