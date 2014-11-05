

(function( exports ) {
	var _supportsTemplate = 'content' in document.createElement('template');
	
	function _define( name, Parent, protoProps ) {
		var ChildBlock = _createChildBlock(name, Parent, protoProps);
		// `children` has to be created here — creating it in the
		// `Block` prototype would make it static. Creating it
		// in `initialize` would always create a children object, event
		// when this block will never have children.
		this.prototype.childBlocks || (this.prototype.childBlocks = {});
		this.prototype.childBlocks[name] = ChildBlock;
		
		return ChildBlock;
	}
	function _extend( protoProps, staticProps ) {
		return _.inherit(this, {
			prototype: protoProps || {},
			static:    staticProps
		});
	}
	function _createChildBlock( name, Parent, protoProps ) {
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
		
		return ChildBlock;
	}
	
	var Block = exports.Block = function() {
		this.initialize.apply(this, arguments);
	};
	Block.prototype = {
		// Static propertes
		// ----------------
		// These properties remain the same for all instances.
		// 
		name:        undefined,
		// Object with references to child Block classes. This is the
		// logic part of the template tree.
		childBlocks: undefined,
		
		// Instance properties
		// -------------------
		// These properties get set upon instantiation.
		// 
		// Reference to parent instance.
		parent:      undefined,
		// An array with references to added children.
		children:    undefined,
		// Config for rendering this block (and optional children).
		config:      undefined,
		// Reference to the correct template object. This object is used
		// to be able to insert parsed HTML *before it*. It also tries to keep
		// track of which DOM elements belong to this block, so they can be removed
		// from the DOM when this block is removed.
		template:    undefined,
		
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
		// 
		// * `connect` is true when a block is initialized via `add`.
		// * `connect` is false when intitialized via `give`.
		initialize: function( config, parent, connect ) {
			this.config   = config;
			this.parent   = connect ?
			                parent._addReference(this) :
			                parent;
			this.template = this._initTemplate(this.name);
			this._renderSelf();
		},
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
		create: function( blockName, config, connect ) {
			var blockClass = this.childBlocks && this.childBlocks[blockName];
			if( blockClass ) {
				return new blockClass(config, this, !!connect);
			} else {
				return null;
			}
		},
		// Add child block.
		// `how` determines where to place the new block. See `Template.out`
		// to find out what the possible values are, and what they do.
		add: function( blockName, config, how ) {
			var child    = this.create(blockName, config, true)
			  , template = child ?
			               child.template :
			               this._renderPlainChild(blockName);
			Template.out(template, how);
			return child;
		},
		before:  function( blockName, config ) { return this.add(blockName, config, 'before') },
		after:   function( blockName, config ) { return this.add(blockName, config, 'after') },
		prepend: function( blockName, config ) { return this.add(blockName, config, 'prepend') },
		append:  function( blockName, config ) { return this.add(blockName, config, 'append') },
		// Give the template of a child block. Its content will not be
		// appended to the DOM.
		give: function( blockName, config ) {
			var child    = this.create(blockName, config, false)
			  , template = child ?
			               child.template :
			               this._renderPlainChild(blockName);
			return template;
		},
		
		// Overridable methods
		// -------------------
		// A Block subclass can override these methods to implement custom render logic.
		// 
		// For replacing variables in the rendered HTML.
		replaceVariables: function( fragment ) {},
		// For manipulating the DOM structure.
		render: function( fragment ) {},
		// When this block is removed, undo things you did in render here.
		remove: function() {},
		
		
		// Render methods
		// --------------
		_renderSelf: function() {
			// Render the current block and attach it to the DOM.
			var vars = this.config && this.config.vars || {};
			this.render(this.template.fragment, vars);
			this.replaceVariables(this.template.fragment);
		},
		_renderPlainChild: function( name ) {
			var childTemplate = this._initTemplate(name, this.template && this.template.fragmentNodes);
			if( childTemplate ) {
				this.replaceVariables(childTemplate.fragment);
			}
			
			return childTemplate;
		},
		
		// Utility methods
		// ---------------
		// 
		// `_addReference` and `_removeReference` connect a child blocks to
		// its parent; this.
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
			var path = template.getAttribute('ref');
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
				clone.setAttribute && clone.setAttribute('clone', 'true');
				fragment.appendChild(clone);
			});
			
			return fragment;
		}
	};
	Block.define = _define;
	Block.extend = _extend;
	
	var Template = exports.Template = new (Block.extend({
		_tree:       undefined,
		childBlocks: {},
		
		initialize: function() {},
		
		define: function( name, Parent, protoProps ) {
			return this.childBlocks[name] = _createChildBlock(name, Parent, protoProps);
		},
		// Performance optimization: pull the original templates out of the DOM,
		// and replace them with empty <template ref/> elements. Not doing this
		// would cost more memory since nested templates get cloned every time
		// its parent is `add`ed.
		add: function() {
			if( !this._tree ) Template._processTemplates();
			return this.constructor.__super__.add.apply(this, arguments);
		},
		out: function( template, how ) {
			if( !template || !template.original ) {
				throw new Error('Template not found!');
			}
			how || (how = 'before');
			
			var ref = how == 'before' ?
			          	template.original :
			          how == 'after' ?
			          	template.original.nextSibling :
			          how == 'prepend' ?
			          	template.original.parentNode.firstChild :
			          // how == 'append'
			          	null;
			
			template.original.parentNode.insertBefore(template.fragment, ref);
		},
		getReference: function( path ) {
			return this._tree[path];
		},
		// This method is also used in `Block._initTemplate`.
		queryForTemplates: function( el, name ) {
			var query     = name ?
			                'template[name="'+name+'"]' :
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
					cur.getAttribute('clone') == 'true'
				) {
					return cur;
				}
				cur = cur.parentNode;
			}
			
			throw new Error('Unpossibru!');
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
				if( template.getAttribute('ref') ) {
					var content = _supportsTemplate ? template.content : template;
					if( template.childNodes.length ) {
						throw new Error('Reference templates cannot have content');
					}
					return;
				}
				
				var name = template.getAttribute('name');
				var path = this._pushCrumb(crumbs, name);
				
				this._tree[path] = {
					name:     name,
					path:     path,
					template: template,
				};
				this._processTemplates(template, crumbs);
				
				// Replace <template name="x"> with <template name="x" ref="parent.child.x">.
				var replacement = document.createElement('template');
				replacement.setAttribute('name',    name);
				replacement.setAttribute('ref',     path);
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