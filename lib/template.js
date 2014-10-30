

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
	
	var RootBlock = Tpl.RootBlock = function( name, template ) {
		if( typeof name != 'string' )
			throw new Error('Block must have a name');
		if( !template )
			throw new Error('Block template must exist');
		
		this.name     = name;
		this.template = template;
		this.children = {};
	};
	RootBlock.prototype = {
		name:     undefined,
		// Reference to its template object
		template: undefined,
		// Object with references to child Block classes.
		children: undefined,
		// DocumentFragment instance.
		fragment: undefined,
		
		initialize: function( config ) {
			this.fragment = document.createDocumentFragment();
		},
		
		// Add child blocks.
		add: function( children ) {
			// Recursive, and render children first!
		},
		
		// Process template HTML and add it to `fragment`.
		render: function( config ) {
			var vars     = config.vars
			  , children = config.children;
		},
		
		// Add `fragment` to the DOM.
		out: function() {
			
		}
	}
	RootBlock.define = function( name, props ) {
		if( !props || props.constructor != Object )
			throw new Error('Block properties must be an object');
		
		function Block() { this.initialize() }
		Block.define = RootBlock.define;
		
		// `Tpl.tree` is basically a `children` object. See the comments
		// at `Tpl.tree`.
		var subTree = this.prototype.subTree ?
		              this.prototype.subTree.children :
		              Tpl.tree;
		var template = subTree[name] && subTree[name].template;
		
		Block.prototype = new RootBlock(name, template);
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
	}
})(window);