

(function( exports ) {
	var _supportsTemplate = 'content' in document.createElement('template');
	var _tree;
	
	var Template = exports.Template = {
		// Finds all <template> elements in `el`, and indexes them.
		// When it finds a <template>, it will store it in the index, and replace
		// it with an empty <template ref="x">.
		processTemplates: function( el, crumbs ) {
			_tree  || (_tree = {});
			el     || (el = document.body);
			crumbs || (crumbs = []);
			
			var templates = this._queryForTemplates(el);
			templates.forEach(function( template ) {
				var name = template.getAttribute('name');
				var path = this._pushCrumb(crumbs, name);
				
				_tree[path] = {
					name:     name,
					path:     path,
					template: template,
				};
				this.processTemplates(template, crumbs);
				
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
		},
		
		// This method is also used in `Block._getTemplate`.
		_queryForTemplates: function( el, name ) {
			var query = name ?
			            'template[name="'+name+'"]' :
			            'template';
			
			var templates = Array.prototype.slice.call(
				_supportsTemplate && el instanceof HTMLTemplateElement ?
					el.content.querySelectorAll(query) :
					el.querySelectorAll(query)
			);
			
			if( _supportsTemplate ) {
				return templates;
			} else {
				return templates.filter(function( childTemplate ) {
					// `parent` == `null` when this is a root template.
					var parent = this._getParentTemplate(childTemplate);
					return parent == el || !parent;
				}, this);
			}
		},
		
		// Only works when <template> tags are unsupported.
		_getParentTemplate: function( template ) {
			var cur = template.parentNode;
			while( cur ) {
				if(
					cur.tagName &&
					cur.tagName.toLowerCase() == 'template'
				) {
					return cur;
				}
				cur = cur.parentNode;
			}
			return null;
		}
	};
	
	var Block = exports.Block = function() {
		this.initialize.apply(this, arguments);
	};
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
		
		// The problem of blocks rendering their own children
		// --------------------------------------------------
		// A block should have the possiblity to render its own children in the 
		// `render` method. This causes a problem: A child's `render` method will
		// be called during the parent's render procedure. At this point, the `fragmentNodes
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
			if( !this.template ) return;
			this.template.fragmentNodes.forEach(function( partial ) {
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
			
			var vars = this.config && this.config.vars || {};
			this.template = this._getTemplate(this.name);

			this.render(this.template.fragment, vars);
			this.replaceVariables(this.template.fragment);
			this._out(this.template);
			
			this._delayChildRendering = false;
			this._renderChildren();
		},
		_renderPlainChild: function( name ) {
			if( this._delayChildRendering ) {
				return this._queueChild(this._renderPlainChild, this, name);
			}
			
			var childTemplate = this._getTemplate(name, this.template.fragmentNodes);
			if( childTemplate ) {
				this.replaceVariables(childTemplate.fragment);
				this._out(childTemplate);
			}
		},
		_out: function( template ) {
			// Insert the new partial before the template.
			template.original.parentNode.insertBefore(
				template.fragment,
				template.original
			);
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
		_getFragmentNodes: function( fragment ) {
			return Array.prototype.slice.call(fragment.childNodes);
		},
		_getTemplate: function( name, fragmentNodes ) {
			// Performance optimization: pull the original templates out of the DOM,
			// and replace them with empty <template ref/> elements. Not doing this
			// would cost more memory since nested templates get cloned every time
			// its parent is `add`ed.
			if( !_tree ) {
				Template.processTemplates();
			}
			
			if( !fragmentNodes ) {
				fragmentNodes = this.parent ?
				                this.parent.template.fragmentNodes :
				                [document.body];
			}
			
			var match;
			fragmentNodes.some(function find( el ) {
				if( !el.querySelectorAll ) return;
				
				var templates = Template._queryForTemplates(el, name);
				if( templates.length > 1 ) {
					throw new Error('Template block not unique');
				}
				match = templates[0];
				return !!match;
			});
			if( !match ) throw new Error('No matching template found');
			
			// Is this a ref?
			var path = match.getAttribute('ref')
			  , ref;
			if( path ) {
				if( !_tree[path] ) throw new Error('Block not found: '+path);
				ref = _tree[path].template;
			}
			
			// Create a fresh fragment clone, which is passed to `render`.
			var source = ref || match
			  , fragment;
			if( _supportsTemplate ) {
				fragment = source.content.cloneNode(true);
			} else {
				fragment = document.createDocumentFragment();
				Array.prototype.forEach.call(source.childNodes, function( childNode ) {
					fragment.appendChild(childNode.cloneNode(true));
				});
			}
			
			return {
				original: match,
				ref:      ref,
				fragment: fragment,
				// Array of HTML elements that are added to the DOM. These come
				// from the template's DocumentFragment, but since that is emptied
				// when it's added to the DOM, we store its `children` in this
				// static array.
				fragmentNodes: this._getFragmentNodes(fragment)
			};
		}
	};
	Block.define = define;
	Block.extend = extend;
	Block.add    = add;
	
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
	function extend( protoProps, staticProps ) {
		return _.inherit(this, {
			prototype: protoProps || {},
			static:    staticProps
		});
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
})(window);