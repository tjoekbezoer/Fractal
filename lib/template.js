

(function( exports ) {
	var _supportsTemplate = 'content' in document.createElement('template');
	if( !_supportsTemplate )
		throw new Error('Templates not supported in this browser');
	
	var Tpl = exports.Tpl = {
		// Root of the template tree. This is basically the `children` property
		// of a normal template node (See `_createTreeNode`). But since this is the
		// root node, there is no `template` property, so it's simplified to just
		// the `children` part.
		tree: {},
		
		buildTree: function( el, tree ) {
			tree || (tree = this.tree);
			
			var templates = this._queryForTemplates(el);
			for( var i = 0; i < templates.length; i++ ) {
				var template = templates[i]
				  , name     = template.getAttribute('name');
				
				if( !name ) {
					throw new Error('Template has no name');
				}
				
				// Create tree branch.
				if( tree[name] && tree[name].template != template ) {
					throw new Error('Two templates with the same name at this level!');
				}
				tree[name] = this._createTreeNode(template);
				if( !this.buildTree(template, tree[name].children) ) {
					delete tree[name].children;
				}
			}
			
			return templates.length;
		},
		
		// Shorthand for root blocks.
		define: function() {
			return RootBlock.define.apply(RootBlock, arguments);
		},
		
		_createTreeNode: function( template, children ) {
			return {
				template: template,
				children: children || {}
			};
		},
		
		_queryForTemplates: function( el ) {
			if( _supportsTemplate && el instanceof HTMLTemplateElement ) {
				return el.content.querySelectorAll('template');
			} else {
				return el.querySelectorAll('template');
			}
		}
	};
	
	var RootBlock = Tpl.RootBlock = function( name, subTree ) {
		if( typeof name != 'string' ) {
			throw new Error('Missing name');
		} else if( !subTree ) {
			throw new Error('subTree must exist');
		}
		
		// Tricky: these modify the *prototype* of a `Block` subclass in
		// `RootBlock.define` below. This is not the actual constructor when
		// adding blocks during rendering; that's what the `Block` constructor
		// is for.
		this.name     = name;
		this._subTree  = subTree;
		this.children = {};
	};
	RootBlock.prototype = {
		name:     undefined,
		// Object with references to child Block classes. This is the
		// logic part of the template tree.
		children: undefined,
		// Config for rendering this block (and optional children).
		config:   undefined,
		// Render queue. Array of child Blocks waiting to be rendered.
		queue:    undefined,
		
		// Reference to its entry in `Tpl.tree`. This is a tree of
		// template objects. This is the HTML part of the template tree.
		_subTree:  undefined,
		
		// Constructor that's called when this block is added to be rendered.
		initialize: function( parent, config ) {
			this.parent = parent;
			this.config = config;
			this.queue  = [];
		},
		
		// Add child block.
		// config: {
		//   vars:     Object with variables used for rendering.
		//   children: TODO: Array of child blocks that should also be
		//             added.
		// }
		add: function( mixed, config ) {
			var child = typeof mixed == 'string' ?
			            new this.children[mixed](this, config) :
			            mixed;
			
			if( !(child instanceof RootBlock) ) {
				throw new Error('Not a valid template block');
			} else if( child.parent != this ) {
				throw new Error('Wrong parent');
			}
			
			this.queue.push(child);
			return child;
		},
		
		// Process template HTML and add it to `fragment`.
		render: function( fragment ) {
			var vars     = this.vars;
			
			// Recursive, and render children first!
		},
		
		// Add `fragment` to the DOM.
		out: function() {
			var fragment = document.createDocumentFragment();
		}
	};
	RootBlock.define = function define( name, props ) {
		if( !props || props.constructor != Object ) {
			throw new Error('Block properties must be an object');
		}
		
		function Block() { this.initialize.apply(this, arguments) }
		Block.define = define;
		
		// `Tpl.tree` is basically a `children` object. See the comments
		// at `Tpl.tree`.
		var subTree = this.prototype._subTree ?
		              this.prototype._subTree.children :
		              Tpl.tree;
		
		Block.prototype = new RootBlock(name, subTree[name]);
		Block.prototype.constructor = Block;
		Object.keys(props).forEach(function( key ) {
			Block.prototype[key] = props[key];
		});
		
		// If this property is undefined, this is a root block. The
		// `children` should be created here — creating it in the
		// `RootBlock` prototype would make it a static.
		this.prototype.children || (this.prototype.children = {});
		this.prototype.children[name] = Block;
		
		return Block;
	};
})(window);