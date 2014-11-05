

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
			this.config   = config;
			this.parent   = parent;
			this.template = this._initTemplate(this.name);
			
			this._renderSelf();
			// When there are children in `config`, add them here
			// --> x <--
		},
		destroy: function() {
			
		},
		remove: function() {
			this.children && this.children.forEach(function( child ) {
				child.remove();
			});
			
			this.destroy();
			
			if( !this.template ) return;
			// Doesn't work on text-only templates.
			this.template.fragmentNodes.forEach(function( partial ) {
				partial.parentNode.removeChild(partial);
			});
		},
		// Add child block.
		add: function( blockName, config ) {
			var blockClass = this.childBlocks && this.childBlocks[blockName];
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
		render: function( fragment ) {
			
		},
		out: function( template ) {
			this._appendFragmentNodes(template.fragment.childNodes);
			
			// Insert the new partial before the template.
			template.original.parentNode.insertBefore(
				template.fragment,
				template.original
			);
		},
		
		// Render methods
		// --------------
		_renderSelf: function() {
			this._delayChildRendering = true;
			if( this.parent && this.parent._delayChildRendering ) {
				return this._queueChild(this._renderSelf, this);
			}
			
			// Render the current block and attach it to the DOM.
			var vars = this.config && this.config.vars || {};
			this.render(this.template.fragment, vars);
			this.replaceVariables(this.template.fragment);
			this.out(this.template);
			
			this._delayChildRendering = false;
			this._renderChildren();
		},
		_renderPlainChild: function( name ) {
			if( this._delayChildRendering ) {
				return this._queueChild(this._renderPlainChild, this, name);
			}
			
			var childTemplate = this._initTemplate(name, this.template.fragmentNodes);
			if( childTemplate ) {
				this.replaceVariables(childTemplate.fragment);
				this.out(childTemplate);
			}
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
				// 
				// The array is filled in `out`, since `_renderPlainChild` calls
				// can append more HTML to the DOM, but simple blocks can't destroy
				// themselves.
				fragmentNodes: []
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
		},
		_appendFragmentNodes: function( childNodes ) {
			var nodes = childNodes instanceof Array ?
			            childNodes :
			            Array.prototype.slice.call(childNodes);
			
			if( this.template ) {
				this.template.fragmentNodes = this.template.fragmentNodes.concat(nodes);
				return this.template.fragmentNodes;
			} else {
				return null;
			}
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
				// `parent` == `null` when this is a root template.
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
			
			// if( !crumbs.length ) console.log(this._tree);
		},
		_pushCrumb: function( crumbs, name ) {
			crumbs.push(name);
			return crumbs.join('.');
		},
		_popCrumb: function( crumbs ) {
			return crumbs.pop();
		}
	}));
})(window);