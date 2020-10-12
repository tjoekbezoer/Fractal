const Fractal = require('../fractal');

Fractal.defineMixin('invoke', {
	prototype: {
		// Tries to call a method name on the first parent that has that
		// method defined. As soon as a match is found, it will invoke
		// the method and return.
		invokeUp: function( methodName /*[, arg]...*/) {
			var len = arguments.length;
			var args = new Array(len-1);
			for( var i = 1; i < len; ++i ) args[i-1] = arguments[i];

			var cur = this.parent;
			while( cur ) {
				if( typeof cur[methodName] == 'function' ) {
					return cur[methodName].apply(cur, args);
				}
				cur = cur.parent;
			}
		},
		// Recursively walks down this view's children tree to look for views
		// with the given method defined. If a child with that method is found,
		// it's invoked, and *that branch* will not be further traversed. Other
		// branches will still be searched for that method.
		invokeDown: function( methodName  /*[, arg]...*/ ) {
			var len = arguments.length;
			var args = new Array(len-1);
			for( var i = 1; i < len; ++i ) args[i-1] = arguments[i];

			_invokeChildren(this.children, methodName, args);
		}
	}
});

function _invokeChildren( children, methodName, args ) {
	var child;
	if( !children ) return;
	for( var i = 0; child = children[i]; ++i ) {
		if( typeof child[methodName] == 'function' ) {
			child[methodName].apply(child, args);
		} else {
			_invokeChildren(child.children, methodName, args);
		}
	}
}
