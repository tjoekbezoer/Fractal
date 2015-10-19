// Use backbone's horrible event triggering optimalization for the
// two custom trigger methods as well. This gives a 30%-50% speed
// improvement.
function _call( view, methodName, args ) {
	if( !view ) return;
	var a1 = args[0], a2 = args[1], a3 = args[2];
	switch( args.length ) {
		case 0:  view[methodName].call(view);             return;
		case 1:  view[methodName].call(view, a1);         return;
		case 2:  view[methodName].call(view, a1, a2);     return;
		case 3:  view[methodName].call(view, a1, a2, a3); return;
		default: view[methodName].apply(view, args);      return;
	}
}

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
				_call(child, '_trigger', arguments);
				// `template` is null when the view is destroyed.
				child.template && _call(child, '_triggerDown', arguments);
			}
			return this;
		},
		// Recursively trigger an event all the way up the `parent` chain
		// of this view. The event does not trigger on this view.
		_triggerUp: function() {
			_call(this.parent, '_trigger', arguments);
			_call(this.parent, '_triggerUp', arguments);
			return this;
		}
	}
});
