

(function( exports ) {
	var _supportsTemplate = 'content' in document.createElement('template');
	if( !_supportsTemplate )
		throw new Error('Templates not supported in this browser');
	
	function define( name, Parent, protoProps ) {
		if( !Parent ) {
			protoProps = {};
			Parent     = Block;
		} else if( Parent.constructor == Object ) {
			protoProps = Parent;
			Parent     = Block;
		}
		protoProps || (protoProps = {});
		var ChildBlock = Parent.extend(protoProps);
		
		if( ChildBlock.prototype.name ) {
			throw new Error('Illegal block definition');
		}
		
		ChildBlock.prototype.name = name;
		// `children` has to be created here — creating it in the
		// `Block` prototype would make it static. Creating it
		// in `initialize` would always create a children object, event
		// when this block will never have children.
		this.prototype.children || (this.prototype.children = {});
		this.prototype.children[name] = ChildBlock;
		
		return ChildBlock;
	}
	function extend( props ) {
		props || (props = {});
		
		// `Child` is the passed in `constructor` proto property
		// or a default function that uses `Parent`'s constructor.
		var Parent = this
		  , Child  = function() { this.initialize.apply(this, arguments) };
		
		Child.define = define;
		Child.extend = extend;
		Child.add    = add;
		
		// `noop` is a dummy constructor to ensure `Parent.constructor`
		// isn't actually called as it could have unintended side effects.
		var noop = function () { this.constructor = Child; };
		noop.prototype = Parent.prototype;
		
		Child.prototype = new noop();
		Object.keys(props).forEach(function( key ) {
			Child.prototype[key] = props[key];
		});
		
		// Convenience reference to parent.
		Child.__super__ = Parent.prototype;
		
		return Child;
	}
	function add( mixed, config ) {
		if( !this.prototype.children ) {
			throw new Error('This block has no children');
		}
		
		var blockClass = this.prototype.children[mixed];
		if( blockClass ) {
			return new blockClass(config);
		} else {
			// HACK: Isn't this a bit tricky?
			this.prototype._renderPlainChild(mixed);
		}
	}
	
	var Block = exports.Block = function() {};
	Block.prototype = {
		// Static propertes
		// ----------------
		// These properties remain the same for all instances.
		// 
		name:     undefined,
		// Object with references to child Block classes. This is the
		// logic part of the template tree.
		children: undefined,
		
		// Instance properties
		// -------------------
		// These properties get set upon instantiation.
		// 
		// Reference to parent instance
		parent:   undefined,
		// Config for rendering this block (and optional children).
		config:   undefined,
		// Reference to the correct template object. This object is used
		// to be able to insert parsed HTML *before it*.
		template: undefined,
		// Array of HTML elements that are added to the DOM. These come
		// from the template's DocumentFragment, but since that is emptied
		// when it's added to the DOM, we store its `children` in this
		// static array.
		partials: undefined,
		// The problem of blocks rendering their own children
		// --------------------------------------------------
		// A block should have the possiblity to render its own children in the 
		// `render` method. This causes a problem: A child's `render` method will
		// be called during the parent's render procedure. At this point, the `partials
		// property of the parent will not be set yet. The child's `render` method will
		// subsequently fail to find a suitable template.
		// 
		// To solve this problem, a render queue is introduced. During a block's render
		// procedure, any added children are appended to the queue. When the parent is
		// done rendering, all child blocks will be rendered afterwards.
		// 
		// Also see `_queueChild` and `_renderChildren`.
		_delayChildRendering: false,
		_queue:               undefined,
		
		// Constructor that's called when this block is added to be rendered.
		// The `config` parameter:
		// {
		//   vars:     Object with variables used for rendering.
		//   children: Hash map of child objects:
		//             {
		//               blockName: Array of config objects like this one.
		//             }
		// }
		// 
		// The recursiveness of the `config` object allows to build an entire page
		// by passing the complete config to the root block.
		initialize: function( config, parent ) {
			this.config = config;
			this.parent = parent;
			
			this._renderSelf();
			// When there are children in `config`, add them here
			// --> x <--
		},
		// Doesn't work on text-only templates
		destroy: function() {
			this.partials.forEach(function( partial ) {
				partial.parentNode.removeChild(partial);
			});
		},
		// Add child block.
		add: function( blockName, config ) {
			var blockClass = this.children[blockName];
			if( blockClass ) {
				return new blockClass(config, this);
			} else {
				this._renderPlainChild(blockName);
			}
		},
		
		// Overridable methods
		// -------------------
		// A Block subclass can override these methods to implement custom render logic.
		// 
		// For replacing variables in the rendered HTML.
		replaceVariables: function( fragment ) {
			
		},
		// For manipulating the DOM structure.
		render: function( fragment, vars ) {
			
		},
		
		// Render methods
		// --------------
		_renderSelf: function() {
			this._delayChildRendering = true;
			if( this.parent && this.parent._delayChildRendering ) {
				return this._queueChild(this._renderSelf, this);
			}
			
			var template = this._findTemplate(this.name)
			  , fragment = template.content.cloneNode(true)
			  , vars     = this.config && this.config.vars || {};
			
			this.render(fragment, vars);
			this.replaceVariables(fragment);
			// Create a non-live reference to the final elements. `partials`
			// is later used to find nested templates so child Blocks can
			// add content to this block.
			this.partials = Array.prototype.slice.call(fragment.children);
			
			this._out(template, fragment);
			
			this._delayChildRendering = false;
			this._renderChildren();
		},
		_renderPlainChild: function( name ) {
			if( this._delayChildRendering ) {
				return this._queueChild(this._renderPlainChild, this, name);
			}
			
			var template = this._findTemplate(name, this.partials);
			if( template ) {
				fragment = template.content.cloneNode(true);
				this.replaceVariables(fragment);
				this._out(template, fragment);
			}
		},
		_out: function( template, fragment ) {
			// Insert the new partial before the template.
			template.parentNode.insertBefore(fragment, template);
		},
		
		// Render queueing methods
		// -----------------------
		_queueChild: function( method, child /*[, args...]*/ ) {
			this._queue || (this._queue = []);
			this._queue.push({
				method: method,
				child:  child,
				args:   Array.prototype.slice.call(arguments, 2)
			});
		},
		_renderChildren: function() {
			if( !this._queue ) return;
			this._queue.forEach(function( item ) {
				item.method.apply(item.child, item.args);
			});
			this._queue = null;
		},
		
		// Utility methods
		// ---------------
		_findTemplate: function( name, partials ) {
			if( !partials ) {
				partials = this.parent ?
				           this.parent.partials :
				           [document.body];
			}
			
			var match;
			partials.some(function find( el ) {
				templates = el.querySelectorAll('template[name="'+name+'"]');
				if( templates.length > 1 ) {
					throw new Error('Template block not unique');
				}
				match = templates[0];
				return !!match;
			});
			
			if( !match ) {
				throw new Error('No matching template found');
			}
			return match;
		}
	};
	Block.define = define;
	Block.extend = extend;
	Block.add    = add;
})(window);