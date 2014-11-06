

(function( exports ) {
	var _supportsTemplate = 'content' in document.createElement('template');
	
	function _define( name, Parent, protoProps ) {
		// `childBlocks` has to be created here — creating it in the `Block` prototype
		// would make it static. Creating it in `initialize` would create an empty
		// children object every time this block is added to the DOM, losing the link
		// with its children which is just created once upon defining the block.
		this.prototype.childBlocks || (this.prototype.childBlocks = {});
		if( this.prototype.childBlocks[name] ) {
			throw new Error('Duplicate Block');
		}
		
		return this.prototype.childBlocks[name] =
		       _createChildBlock(this.prototype.defaultBlock, name, Parent, protoProps);
	}
	function _extend( protoProps, staticProps ) {
		return _.inherit(this, {
			prototype: protoProps || {},
			static:    staticProps
		});
	}
	function _createChildBlock( defaultBlock, name, Parent, protoProps ) {
		if( !Parent ) {
			protoProps = {};
			Parent     = defaultBlock;
		} else if( Parent.constructor == Object ) {
			protoProps = Parent;
			Parent     = defaultBlock;
		}
		protoProps || (protoProps = {});
		protoProps.name         = name;
		protoProps.childBlocks  = {};
		if( !protoProps.defaultBlock )
			protoProps.defaultBlock = defaultBlock;
		
		return Parent.extend(protoProps);
	}
	
	// The Block class
	// ===============
	// 
	// 
	// * `connect` is true when a block is initialized via `add`.
	// * `connect` is false when intitialized via `give`.
	var Block = exports.Block = function( config, parent, connect ) {
		this.config   = config;
		this.parent   = connect ?
		                parent._addReference(this) :
		                parent;
		this.template = this._initTemplate(this.name);
		
		this.initialize();
		this.render();
		this.replaceVariables();
	};
	Block.prototype = {
		constructor: Block,
		
		// Static propertes
		// ----------------
		// These properties remain the same for all instances.
		// 
		name:         undefined,
		path:         undefined,
		// Object with references to child Block classes. This is the
		// logic part of the template tree.
		childBlocks:  undefined,
		// When using `define`, and no `Parent` is specified, this class will be
		// extended. This is important for templates without defined blocks. These
		// blocks will be automatically created when needed, extending `defaultBlock`.
		defaultBlock: Block,
		
		// Instance properties
		// -------------------
		// These properties get set upon instantiation.
		// 
		// Reference to parent instance.
		parent:       undefined,
		// An array with references to added children.
		children:     undefined,
		// Config for rendering this block (and optional children).
		config:       undefined,
		// Reference to the correct template object. This object is used
		// to be able to insert parsed HTML *before it*. It also tries to keep
		// track of which DOM elements belong to this block, so they can be removed
		// from the DOM when this block is removed.
		template:     undefined,
		
		destroy: function() {
			this.children && this.children.forEach(function( child ) {
				child.destroy();
			});
			
			this.remove();
			this.parent._removeReference(this);
			
			if( !this.template ) return;
			// Doesn't work on text-only templates.
			this.template.fragmentNodes.forEach(function( partial ) {
				partial.parentNode.removeChild(partial);
			});
			
			this.children = null;
			this.config   = null;
			this.template = null;
		},
		// Used for defining root templates, and when adding anonymous template blocks.
		// Only use this manually when defining root templates (`Template.define`).
		// When defining child templates use the static `Block.define`.
		define: function( name, Parent, protoProps ) {
			if( this.childBlocks[name] ) {
				throw new Error('Block already defined');
			}
			return this.childBlocks[name] = _createChildBlock(this.defaultBlock, name, Parent, protoProps);
		},
		
		// Callback methods
		// ----------------
		// A Block subclass can override these methods to implement custom render logic.
		// 
		// Custom intialization. Gets called automatically every time this block
		// is added to the DOM.
		initialize: function() {},
		// To implement the flavor of variable parsing you like.
		replaceVariables: function() {},
		// Add children, tweak the DOM, add event listeners, etc.
		render: function() {},
		// When this block is removed, undo things you did in render. Destroying
		// children is done automatically. This is more for removing event listeners
		// and the like.
		remove: function() {},
		
		// Methods for rendering children
		// ------------------------------
		// 
		// The most common way to add children is by using one of these 4 methods.
		before:  function( blockName, config ) { return this._add(blockName, config, 'before') },
		after:   function( blockName, config ) { return this._add(blockName, config, 'after') },
		prepend: function( blockName, config ) { return this._add(blockName, config, 'prepend') },
		append:  function( blockName, config ) { return this._add(blockName, config, 'append') },
		// Give the template of a child block. Its content will not be
		// appended to the DOM.
		give: function( blockName, config ) {
			var child = this._create(blockName, config, false);
			return child.template;
		},
		// Add DocumentFragment to the DOM.
		out: function( how ) {
			var original = this.template.original
			  , ref      = how == 'append'  ? null :
			               how == 'prepend' ? original.parentNode.firstChild :
			               how == 'after'   ? original.nextSibling :
			                                  original; // before
			
			original.parentNode.insertBefore(this.template.fragment, ref);
			return this;
		},
		
		// Methods for creating children
		// -----------------------------
		// 
		_create: function( blockName, config, connect ) {
			var blockClass = this.childBlocks[blockName];
			if( !blockClass ) {
				blockClass = this.define(blockName);
			}
			return new blockClass(config, this, !!connect);
		},
		// Add child block.
		// `how` determines where to place the new block. See `Template.out`
		// to find out what the possible values are, and what they do.
		_add: function( blockName, config, how ) {
			var child = this._create(blockName, config, true);
			return child.out(how);
		},
		// `_addReference` and `_removeReference` connect a child block to
		// its parent: this block.
		_addReference: function( child ) {
			this.children || (this.children = []);
			
			if( child.parent ) throw new Error('Child already has a parent');
			child.parent = this;
			this.children.push(child);
			
			return this;
		},
		_removeReference: function( child ) {
			var index;
			if(
				!this.children ||
				child.parent != this ||
				(index = this.children.indexOf(child)) < 0
			) {
				return;
			}
			child.parent = null;
			this.children.splice(index, 1);
			
			return this;
		},
		
		// Utility methods
		// ---------------
		// 
		_initTemplate: function( name, fragmentNodes ) {
			var match    = this._findTemplateInFragment(name, fragmentNodes)
			  , ref      = this._findTemplateReference(match)
			  , fragment = this._createFragment(ref || match);
			
			return {
				original: match,
				ref:      ref,
				fragment: fragment,
				// Array of HTML elements that are added to the DOM. These come
				// from the template's DocumentFragment, but since that is emptied
				// when it's added to the DOM, we store its `children` in this
				// static array.
				fragmentNodes: Array.prototype.slice.call(fragment.childNodes)
			};
		},
		_findTemplateInFragment: function( name, fragmentNodes ) {
			if( !fragmentNodes ) {
				fragmentNodes = this.parent && this.parent.template ?
				                this.parent.template.fragmentNodes :
				                [document.body];
			}
			
			var match;
			fragmentNodes.some(function find( el ) {
				if( !el.querySelectorAll ) return;
				
				var templates = Template.queryForTemplates(el, name);
				if( templates.length > 1 ) {
					throw new Error('Template block not unique');
				}
				match = templates[0];
				return !!match;
			});
			if( !match ) throw new Error('No matching template found');
			
			return match;
		},
		_findTemplateReference: function( template ) {
			var path = template.getAttribute('data-ref');
			if( path ) {
				var ref = Template.getReference(path);
				if( !ref ) throw new Error('Block not found: '+path);
				return ref.template;
			} else {
				return null;
			}
		},
		_createFragment: function( template ) {
			var fragment = document.createDocumentFragment()
			  , source   = _supportsTemplate ?
						         template.content :
						         template;
						       
			// Create a fresh fragment clone, which is passed to `render`.
			Array.prototype.forEach.call(source.childNodes, function( childNode ) {
				var clone = childNode.cloneNode(true);
				// Set `data-clone`, only on elements containing children.
				if( clone.setAttribute && clone.childNodes.length )
					clone.setAttribute('data-clone', 'true');
				fragment.appendChild(clone);
			});
			
			return fragment;
		}
	};
	Block.define = _define;
	Block.extend = _extend;
	
	// The `Template` singleton
	// ========================
	// 
	var Template = exports.Template = new (Block.extend({
		_tree:        undefined,
		// For actual template blocks, this object is created in `_createChildBlock`.
		childBlocks:  {},
		
		constructor: function() {},
		
		// Performance optimization: pull the original templates out of the DOM,
		// and replace them with empty <template ref/> elements. Not doing this
		// would cost more memory since nested templates get cloned every time
		// its parent is `add`ed.
		_add: function() {
			if( !this._tree ) Template._processTemplates();
			return this.constructor.__super__._add.apply(this, arguments);
		},
		getReference: function( path ) {
			return this._tree[path];
		},
		// This method is also used in `Block._initTemplate`.
		queryForTemplates: function( el, name ) {
			var query     = name ?
			                'template[data-name="'+name+'"]' :
			                'template'
			  , parent    = _supportsTemplate && el instanceof HTMLTemplateElement ?
			                el.content :
			                el
			  , templates = Array.prototype.slice.call(
			                	parent.querySelectorAll(query)
			                );
			
			return templates.filter(function( childTemplate ) {
				var match = this._findParentTemplate(parent, childTemplate);
				return match == parent;
			}, this);
		},
		
		// Can return 3 things, in order of importance:
		// 1. The provided `parent`
		// 2. A parent <template> to `template`
		// 3. A DocumentFragment
		// 4. An <element clone="true">
		// 
		// When any one of these is true, the current `parentNode` will be returned.
		_findParentTemplate: function( parent, template ) {
			var cur = template.parentNode;
			while( cur ) {
				if(
					cur == parent ||
					cur.tagName && cur.tagName.toLowerCase() == 'template' ||
					cur instanceof DocumentFragment ||
					cur.getAttribute('data-clone') == 'true'
				) {
					return cur;
				}
				cur = cur.parentNode;
			}
		},
		
		// Finds all <template> elements in `el`, and indexes them.
		// When it finds a <template>, it will store it in the index, and replace
		// it with an empty <template ref="x">.
		_processTemplates: function( el, crumbs ) {
			this._tree  || (this._tree = {});
			el          || (el = document.body);
			crumbs      || (crumbs = []);
			
			var matches = this.queryForTemplates(el);
			matches.forEach(function( template ) {
				if( template.getAttribute('data-ref') ) {
					var content = _supportsTemplate ? template.content : template;
					if( template.childNodes.length ) {
						throw new Error('Reference templates cannot have content');
					}
					return;
				}
				
				var name = template.getAttribute('data-name');
				var path = this._pushCrumb(crumbs, name);
				
				this._tree[path] = {
					name:     name,
					path:     path,
					template: template,
				};
				this._processTemplates(template, crumbs);
				
				// Replace the original with a reference template.
				var replacement = document.createElement('template');
				replacement.setAttribute('data-name',    name);
				replacement.setAttribute('data-ref',     path);
				template.parentNode.insertBefore(replacement, template);
				template.parentNode.removeChild(template);
				
				this._popCrumb(crumbs);
			}, this);
		},
		_pushCrumb: function( crumbs, name ) {
			crumbs.push(name);
			return crumbs.join('.');
		},
		_popCrumb: function( crumbs ) {
			return crumbs.pop();
		}
	}));
})(typeof exports == 'object' ? exports : this);