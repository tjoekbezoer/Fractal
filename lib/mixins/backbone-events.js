Fractal.defineMixin('backbone-events', {
	hooks: {
		remove: function() {
			this.off();
		}
	},
	prototype: {
		// Backbone requires this method. Not supposed to be used directly.
		trigger:  Backbone.Events.trigger,
		
		// These methods can be used outside of the view hierarchy.
		on:       Backbone.Events.on,
		once:     Backbone.Events.once,
		off:      Backbone.Events.off,
		
		// These methods should only be used *inside* the view hierarchy.
		_trigger: Backbone.Events.trigger,
		// Recursively trigger an event on the entire child tree this view
		// is a parent of. The event will not trigger on this view.
		_triggerDown: function() {
			var children = this.children
			  , length   = children && children.length || 0;
			// TODO: Linked list to assure correctness in case of destroys?
			for( var i = 0; i < length; i++ ) {
				var child = children[i];
				_call(child._trigger, child, arguments);
				// `template` is null when the view is destroyed.
				child.template && _call(child._triggerDown, child, arguments);
			}
			return this;
		},
		// Recursively trigger an event all the way up the `parent` chain
		// of this view. The event does not trigger on this view.
		_triggerUp: function() {
			_call(this.parent._trigger, this.parent, arguments);
			_call(this.parent._triggerUp, this.parent, arguments);
			return this;
		}
	}
});
