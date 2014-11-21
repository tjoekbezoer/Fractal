

(function( exports ) {
	var _supportsTemplate = 'content' in document.createElement('template');
	
	function _define( name, Parent, protoProps ) {
		var path = this.prototype.path;
		// `childViews` has to be created here — creating it in the `View` prototype
		// would make it static. Creating it in `initialize` would create an empty
		// children object every time this view is added to the DOM, losing the link
		// with its children which is just created once upon defining the view.
		this.prototype.childViews || (this.prototype.childViews = {});
		if( this.prototype.childViews[name] ) {
			throw new Error('View `'+name+'` already defined in `'+path+'`');
		}
		
		return this.prototype.childViews[name] = _createChildView(
			path,
			name,
			this.prototype.defaultView,
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
	function _createChildView( path, name, defaultView, Parent, props ) {
		if( !Parent ) {
			props  = {};
			Parent = defaultView;
		} else if( Parent.constructor == Object ) {
			props  = Parent;
			Parent = defaultView;
		}
		props || (props = {});
		props.defaultView = props.defaultView || defaultView;
		props.childViews  = {};
		props.path        = path ? path+'.'+name : name;
		props.name        = name;
		
		return Parent.extend(props);
	}
	function _result(prop, ctx) {
		return typeof prop == 'function' ?
		       prop.call(ctx) :
		       prop;
	}
	
	// The View class
	// ===============
	// 
	// 
	// * `connect` is true when a view is initialized via `add`.
	// * `connect` is false when intitialized via `give`.
	var View = function( state, parent, connect ) {
		this.parent = connect ?
		              parent._addReference(this) :
		              parent;
		
		this.updateState(state);
		this._initTemplate();
		this.initialize();
	};
	View.prototype = {
		constructor: View,
		
		// Static properties
		// -----------------
		// These properties remain the same for all instances, and are set in
		// `_createChildView`.
		// 
		// When using `define`, and no `Parent` is specified, this class will be
		// extended. This is important for templates without defined views. These
		// views will be automatically created when needed, extending `defaultView`.
		defaultView:  View,
		// Object with references to child View classes. This is the
		// logic part of the template tree.
		childViews:   undefined,
		// Full path of this view. Corresponds with the hierarchy of its <template>.
		path:         undefined,
		// View name. Corresponds with the `data-name` of its <template>.
		name:         undefined,
		
		// Instance properties
		// -------------------
		// These properties get set upon instantiation.
		// 
		// Reference to parent instance.
		parent:       undefined,
		// An array with references to added children.
		children:     undefined,
		// This view's state. This information can be used for rendering.
		state:        undefined,
		// Reference to the correct template object. This object is used
		// to be able to insert parsed HTML *before it*. It also tries to keep
		// track of which DOM elements belong to this view, so they can be removed
		// from the DOM when this view is removed.
		template:     undefined,
		
		// Object with default properties to set for this view. Depending on how you
		// set the property, it becomes a static or instance property.
		defaultState: undefined,
		
		// Indicates whether this view is added to the DOM. In <template> supporting browsers,
		// you could just check for `this.template.fragment.childNodes.length`, but since IE
		// does not support it, we need a helper variable.
		_rendered:    false,
		
		destroy: function() {
			this.empty();
			this.remove();
			this.parent && this.parent._removeReference(this);
			
			this.children = 
			this.state    = 
			this.template = null;
			
			return null;
		},
		empty: function() {
			// By destroying a child, it will remove itself from the `children` array.
			// So by using the first element in the array, this loop will always address
			// the next child to be destroyed.
			// TODO: Linked list for this? See `MapKit.View.triggerDown` as well.
			while( this.children && this.children.length ) {
				this.children[0].destroy();
			}
			this.clear();
			
			if( !this.template ) return null;
			
			var nextSibling;
			this.template.fragmentNodes.forEach(function( partial ) {
				nextSibling = partial.nextSibling;
				partial.parentNode.removeChild(partial);
			});
			this.template.fragmentNodes = null;
			
			// All relation to the DOM is removed, so this view is not considered to be
			// rendered anymore.
			this._rendered = false;
			
			return nextSibling;
		},
		// Used for defining root templates, and when adding anonymous template views.
		// Only use this manually when defining root templates (`Template.define`).
		// When defining child templates use the static `View.define`.
		define: function( name, Parent, protoProps ) {
			if( this.childViews[name] ) {
				throw new Error('View `'+name+'` already defined in `'+this.path+'`');
			}
			return this.childViews[name] = _createChildView(
				this.path,
				name,
				this.defaultView,
				Parent,
				protoProps
			);
		},
		// Update this view's state. This method will also set the `defaultState` properties on
		// the `state` object, and call `onStateChanged` if this view's already rendered, and the
		// state has changed.
		// 
		// You can't delete state properties. If you do want to delete a state property, you
		// should set it to `undefined`. If there is a default value defined for the property,
		// setting it to `undefined` will result in the property being set to its default value.
		updateState: function( state, value ) {
			if( arguments.length == 2 ) {
				var propName = state;
				(state = {})[propName] = value;
			}
			
			var defaultState, oldState;
			if( !this.state ) {
				// Set defaults.
				defaultState = _result(this.defaultState, this);
				this.state   = this._cloneState(defaultState) || {};
			} else {
				oldState     = this.state;
				this.state   = this._cloneState(this.state);
			}
			
			if( state ) {
				// Merge the new state properties.
				Object.keys(state).forEach(function( key ) {
					var newValue = state[key];
					// When the new value is undefined, try to reset it to the default value, if applicable.
					if( newValue === undefined && this.defaultState ) {
						// Resolve the defaults, if it's not yet been done above.
						defaultState || (defaultState = _result(this.defaultState, this));
						newValue = defaultState[key]
					}
					this.state[key] = newValue;
				}, this);
				
				// Diff only happens when the view is already rendered. `onStateChanged` is
				// supposed to be used for changing the current state, not for completely
				// rerendering the entire view.
				if( oldState && this._rendered ) {
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
		// A View subclass can override these methods to implement custom render logic.
		// 
		// Custom intialization. Gets called automatically every time this view
		// is added to the DOM.
		initialize: function() {},
		// This view is permanently removed from the DOM. This method is automatically
		// called when calling `destroy`. Use to to tear down things you set up in
		// `initialize`.
		remove: function() {},
		
		// Add children, tweak the DOM, add event listeners, etc.
		render: function() {},
		// To implement the flavor of variable parsing you like.
		replaceVariables: function() {},
		// When this view is emptied, undo things you did in render here. This is for
		// removing event listeners etc.
		clear: function() {},
		
		// When this view's state has changed, this method is called, and an object
		// with all the changes is passed along.
		onStateChanged: function( diff ) {
			this.out();
		},
		
		// Methods for rendering children
		// ------------------------------
		// 
		// The most common way to add children is by using one of these methods:
		append:  function( viewName, state ) { return this.add(viewName, state, 'append') },
		prepend: function( viewName, state ) { return this.add(viewName, state, 'prepend') },
		before:  function( viewName, state ) { return this.add(viewName, state, 'before') },
		after:   function( viewName, state ) { return this.add(viewName, state, 'after') },
		// Add child view.
		// `how` determines where to place the new view. See `Template.out`
		// to find out what the possible values are, and what they do.
		add: function( viewName, state, how ) {
			var child    = this._createChild(viewName, state, true)
			  , original = child.template.original
			  , before   = how == 'append'  ? null :
			               how == 'prepend' ? original.parentNode.firstChild :
			               how == 'after'   ? original.nextSibling :
			                                  original; // before
			return child.out(before);
		},
		// Give the template of a child view. Its content will not be
		// appended to the DOM.
		give: function( viewName, state ) {
			var child = this._createChild(viewName, state, false);
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
			this._rendered = true;
			
			return this;
		},
		
		// Methods for creating children
		// -----------------------------
		// 
		_createChild: function( viewName, state, connect ) {
			var viewClass = this.childViews[viewName];
			if( !viewClass ) {
				viewClass = this.define(viewName);
			}
			return new viewClass(state, this, !!connect);
		},
		// `_addReference` and `_removeReference` connect a child view to
		// its parent: this view.
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
			template.fragment      = this._createFragment(template.ref || template.original);
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
					throw new Error('Template `'+name+'` view not unique in `'+this.path+'`');
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
			if( !state ) return state;
			// NOTE: This way of cloning is very fast, but if a property in the original
			//       changes, and it has not been changed in the clone, it will change in
			//       the clone as well. For our use this is fine, since that won't happen.
			var StateClone = function() {};
			StateClone.prototype = state;
			return new StateClone();
		},
		_diffState: function( oldState ) {
			var diff = null
			  , key, value;
			
			// Find properties that have been changed in the new state.
			for( key in this.state ) {
				value = this.state[key];
				if( !oldState || value !== oldState[key] ) {
					diff || (diff = {});
					diff[key] = value;
				}
			}
			
			return diff;
		}
	};
	View.define = _define;
	View.extend = _extend;
	
	// The `Template` singleton
	// ========================
	// 
	var Template = new (View.extend({
		_tree:        undefined,
		// For actual template views, this object is created in `_createChildView`.
		childViews:  {},
		
		constructor: function() {},
		// These methods are not available on `Template`.
		out:         undefined,
		updateState: undefined,
		
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
		// These methods are used in the `View` class.
		getReference: function( path ) {
			return this._tree[path];
		},
		// This method is also used in `View._findTemplateInFragment`.
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
	
	Template.View   = View;
	exports.Template = Template;
})(typeof exports == 'object' ? exports : this);