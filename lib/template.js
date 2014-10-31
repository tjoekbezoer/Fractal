

(function( exports ) {
	var _supportsTemplate = 'content' in document.createElement('template');
	if( !_supportsTemplate )
		throw new Error('Templates not supported in this browser');
	
	var Block = exports.Block = function() {};
	Block.prototype = {
		// Static propertes
		// ----------------
		// These properties remain the same for all instances.
		// 
		name:        undefined,
		// Object with references to child Block classes. This is the
		// logic part of the template tree.
		children:    undefined,
		
		// Instance properties
		// -------------------
		// These properties get set upon instantiation.
		// 
		// Reference to parent instance
		parent:      undefined,
		// Config for rendering this block (and optional children).
		config:      undefined,
		// Reference to the correct template object. This object is used
		// to be able to insert parsed HTML *before it*.
		template:    undefined,
		// Array of HTML elements that are added to the DOM. These come
		// from the template's DocumentFragment, but since that is emptied
		// when it's added to the DOM, we store its `children` in this
		// static array.
		partials:    undefined,
		
		// Constructor that's called when this block is added to be rendered.
		initialize: function( config, parent ) {
			this.config = config;
			this.parent = parent;
			
			this.template = this._findTemplate(this.name);
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
		// config: {
		//   vars:     Object with variables used for rendering.
		//   children: TODO: Array of child blocks that should also be
		//             added.
		// }
		add: function( mixed, config ) {
			var blockClass = this.children[mixed];
			if( blockClass ) {
				var child = new blockClass(config, this)
				if( !(child instanceof Block) ) {
					throw new Error('Not a valid template block');
				} else if( child.parent != this ) {
					throw new Error('Wrong parent');
				}
				
				return child;
			} else {
				this._renderPlainChild(mixed);
			}
		},
		// For replacing variables.
		preProcess: function( fragment ) {
			
		},
		// For manipulating the DOM structure.
		render: function( fragment ) {
			var vars = this.config && this.config.vars;
			// Do something with `this.partial`
		},
		
		_renderSelf: function() {
			var fragment = this.template.content.cloneNode(true);
			
			this.render(fragment);
			this.preProcess(fragment);
			// Create a non-live reference to the final elements. `partials`
			// is later used to find nested templates so child Blocks can
			// add content to this block.
			this.partials = Array.prototype.slice.call(fragment.children);
			
			this._out(this.template, fragment);
		},
		_renderPlainChild: function( name ) {
			var template = this._findTemplate(name, this.partials);
			if( template ) {
				fragment = template.content.cloneNode(true);
				this.preProcess(fragment);
				this._out(template, fragment);
			}
		},
		_out: function( template, fragment ) {
			// Insert the new partial before the template.
			template.parentNode.insertBefore(fragment, template);
		},
		
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
	
	function define( name, ChildBlock ) {
		ChildBlock || (ChildBlock = Block.extend());
		
		if( ChildBlock.prototype.name ) {
			throw new Error('Block class already in use');
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
		
		// `noop` is a dummy constructor to ensure `Parent.constructor`
		// isn't actually called as it could have unintended side effects.
		var noop = function () { this.constructor = Child; };
		noop.prototype = Parent.prototype;
		
		Child.prototype = new noop();
		Object.keys(props).forEach(function( key ) {
			Child.prototype[key] = props[key];
		});
		
		// Convenience reference to parent.
		Child.__super__ = Parent;
		
		return Child;
	}
})(window);