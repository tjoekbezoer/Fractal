

(function( exports ) {
	var _supportsTemplate = 'content' in document.createElement('template');
	
	function _define( name, Parent, protoProps ) {
		var path = this.prototype.path;
		// `childBlocks` has to be created here — creating it in the `Block` prototype
		// would make it static. Creating it in `initialize` would create an empty
		// children object every time this block is added to the DOM, losing the link
		// with its children which is just created once upon defining the block.
		this.prototype.childBlocks || (this.prototype.childBlocks = {});
		if( this.prototype.childBlocks[name] ) {
			throw new Error('Block `'+name+'` already defined in `'+path+'`');
		}
		
		return this.prototype.childBlocks[name] = _createChildBlock(
			path,
			name,
			this.prototype.defaultBlock,
			Parent,
			protoProps
		);
	}
	function _extend( protoProps, staticProps ) {
		return _.inherit(this, {
			prototype: protoProps || {},
			static:    staticProps
		});
	}
	function _createChildBlock( path, name, defaultBlock, Parent, props ) {
		if( !Parent ) {
			props = {};
			Parent     = defaultBlock;
		} else if( Parent.constructor == Object ) {
			props = Parent;
			Parent     = defaultBlock;
		}
		props || (props = {});
		props.defaultBlock || (props.defaultBlock = defaultBlock);
		props.childBlocks = {};
		props.path        = path ? path+'.'+name : name;
		props.name        = name;
		
		return Parent.extend(props);
	}
	
	// The Block class
	// ===============
	// 
	// 
	// * `connect` is true when a block is initialized via `add`.
	// * `connect` is false when intitialized via `give`.
	var Block = exports.Block = function( state, parent, connect ) {
		this.parent = connect ?
		              parent._addReference(this) :
		              parent;
		
		this.setState(state);
		this._initTemplate();
		this.initialize();
	};
	Block.prototype = {
		constructor: Block,
		
		// Static properties
		// -----------------
		// These properties remain the same for all instances, and are set in
		// `_createChildBlock`.
		// 
		// When using `define`, and no `Parent` is specified, this class will be
		// extended. This is important for templates without defined blocks. These
		// blocks will be automatically created when needed, extending `defaultBlock`.
		defaultBlock: Block,
		// Object with references to child Block classes. This is the
		// logic part of the template tree.
		childBlocks:  undefined,
		// Full path of this block. Corresponds with the hierarchy of its <template>.
		path:         undefined,
		// Block name. Corresponds with the `data-name` of its <template>.
		name:         undefined,
		
		// Instance properties
		// -------------------
		// These properties get set upon instantiation.
		// 
		// Reference to parent instance.
		parent:       undefined,
		// An array with references to added children.
		children:     undefined,
		// This block's state. This information can be used for rendering.
		state:        undefined,
		// Reference to the correct template object. This object is used
		// to be able to insert parsed HTML *before it*. It also tries to keep
		// track of which DOM elements belong to this block, so they can be removed
		// from the DOM when this block is removed.
		template:     undefined,
		
		destroy: function() {
			this.empty();
			this.parent._removeReference(this);
			
			this.children = 
			this.state    = 
			this.template = null;
			
			return null;
		},
		empty: function() {
			if( !this.template ) return;
			
			this.children && this.children.forEach(function( child ) {
				child.destroy();
			});
			this.remove();
			
			var nextSibling;
			this.template.fragmentNodes.forEach(function( partial ) {
				nextSibling = partial.nextSibling;
				partial.parentNode.removeChild(partial);
			});
			this.template.fragmentNodes = null;
			
			return nextSibling;
		},
		// Used for defining root templates, and when adding anonymous template blocks.
		// Only use this manually when defining root templates (`Template.define`).
		// When defining child templates use the static `Block.define`.
		define: function( name, Parent, protoProps ) {
			if( this.childBlocks[name] ) {
				throw new Error('Block `'+name+'` already defined in `'+this.path+'`');
			}
			return this.childBlocks[name] = _createChildBlock(
				this.path,
				name,
				this.defaultBlock,
				Parent,
				protoProps
			);
		},
		// Set this block's state. The first call comes from the constructor. In this
		// scenario, `setState` intializes the state and no further action is necessary.
		// Every consecutive call is a manual one. In this scenario, a diff should be made
		// and if there are changes, `onStateChanged` is called and given the diff so a block
		// can decide what to do. The default is simply rerendering itself.
		// 
		// You can't delete state properties. If you do want to delete a state property, you
		// should set it to `undefined`.
		setState: function( state ) {
			if( state && state.constructor == Object ) {
				if( !this.state ) {
					// This call to `setState` comes from the constructor.
					this.state = state;
				} else {
					// External call. Change state and determine what to do.
					var oldState = this.state;
					this.state = this._cloneState(this.state);
					
					Object.keys(state).forEach(function( key ) {
						this.state[key] = state[key];
					}, this);
					
					var diff = this._diffState(oldState);
					if( diff ) {
						this.onStateChanged(diff);
					}
				}
			}
			
			return this;
		},
		
		// Callback methods
		// ----------------
		// A Block subclass can override these methods to implement custom render logic.
		// 
		// Custom intialization. Gets called automatically every time this block
		// is added to the DOM.
		initialize: function() {},
		// Add children, tweak the DOM, add event listeners, etc.
		render: function() {},
		// When this block is removed, undo things you did in render. Destroying
		// children is done automatically. This is more for removing event listeners
		// and the like.
		remove: function() {},
		// When this view's state has changed, this method is called, and an object
		// with all the changes is passed along.
		onStateChanged: function( diff ) {
			this.out();
		},
		// To implement the flavor of variable parsing you like.
		replaceVariables: function() {},
		
		// Methods for rendering children
		// ------------------------------
		// 
		// The most common way to add children is by using one of these methods:
		append:  function( blockName, state ) { return this.add(blockName, state, 'append') },
		prepend: function( blockName, state ) { return this.add(blockName, state, 'prepend') },
		before:  function( blockName, state ) { return this.add(blockName, state, 'before') },
		after:   function( blockName, state ) { return this.add(blockName, state, 'after') },
		// Add child block.
		// `how` determines where to place the new block. See `Template.out`
		// to find out what the possible values are, and what they do.
		add: function( blockName, state, how ) {
			var child    = this._createChild(blockName, state, true)
			  , original = child.template.original
			  , before   = how == 'append'  ? null :
			               how == 'prepend' ? original.parentNode.firstChild :
			               how == 'after'   ? original.nextSibling :
			                                  original; // before
			return child.out(before);
		},
		// Give the template of a child block. Its content will not be
		// appended to the DOM.
		give: function( blockName, state ) {
			var child = this._createChild(blockName, state, false);
			return child.template;
		},
		out: function( before ) {
			if( before === undefined ) {
				before = this.empty();
				this._initTemplate();
			}
			this.render();
			this.replaceVariables();
			
			this.template.original.parentNode.insertBefore(this.template.fragment, before);
			return this;
		},
		
		// Methods for creating children
		// -----------------------------
		// 
		_createChild: function( blockName, state, connect ) {
			var blockClass = this.childBlocks[blockName];
			if( !blockClass ) {
				blockClass = this.define(blockName);
			}
			return new blockClass(state, this, !!connect);
		},
		// `_addReference` and `_removeReference` connect a child block to
		// its parent: this block.
		_addReference: function( child ) {
			this.children || (this.children = []);
			
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
		_initTemplate: function() {
			if( !this.template ) {
				var match    = this._findTemplateInFragment(this.name)
				  , ref      = this._findTemplateReference(match);
				// The DocumentFragment `fragment` is emptied when it's added to the DOM,
				// so we store its `childNodes` as a static array in `fragmentNodes` because
				// we still need them after they are added to the DOM.
				this.template = {
					original:      match,
					ref:           ref,
					fragment:      null,
					fragmentNodes: null
				};
			}
			
			var template = this.template;
			template.fragment      = this._createFragment(template.ref || template.match);
			template.fragmentNodes = Array.prototype.slice.call(template.fragment.childNodes);
		},
		_findTemplateInFragment: function( name ) {
			var fragmentNodes = this.parent && this.parent.template ?
			                    this.parent.template.fragmentNodes :
			                    [document.body];
			
			var match;
			fragmentNodes.some(function find( el ) {
				if( !el.querySelectorAll ) return;
				
				var templates = Template.queryForTemplates(el, name);
				if( templates.length > 1 ) {
					throw new Error('Template `'+name+'` block not unique in `'+this.path+'`');
				}
				match = templates[0];
				return !!match;
			}, this);
			if( !match ) throw new Error('No template `'+name+'` found in `'+this.path+'`');
			
			return match;
		},
		_findTemplateReference: function( template ) {
			var path = template.getAttribute('data-ref');
			if( path ) {
				var ref = Template.getReference(path);
				if( !ref ) throw new Error('Template reference `'+path+'` not found');
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
		},
		
		_cloneState: function( state ) {
			var StateClone = function() {};
			StateClone.prototype = state;
			return new StateClone();
		},
		_diffState: function( oldState ) {
			var diff = null , key, value;
			
			// Find properties that have been changed in the new state.
			for( key in this.state ) {
				value = this.state[key];
				if( value !== oldState[key] ) {
					diff || (diff = {});
					diff[key] = value;
				}
			}
			
			return diff;
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
		// These are not supposed to do anything.
		destroy:     undefined,
		empty:       undefined,
		out:         undefined,
		setState:    undefined,
		
		// Performance optimization: pull the original templates out of the DOM,
		// and replace them with empty <template ref/> elements. Not doing this
		// would cost more memory since nested templates get cloned every time
		// its parent is `add`ed.
		add: function() {
			if( !this._tree ) Template._processTemplates();
			return this.constructor.__super__.add.apply(this, arguments);
		},
		
		// Utility methods
		// ---------------
		// These methods are used in the `Block` class.
		getReference: function( path ) {
			return this._tree[path];
		},
		// This method is also used in `Block._findTemplateInFragment`.
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