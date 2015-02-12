

(function( exports ) {
	var _supportsTemplate = 'content' in document.createElement('template');
	
	function _isTemplateElement( el ) {
		return _supportsTemplate && el instanceof HTMLTemplateElement;
	}
	function _extend( target ) {
		Array.prototype.slice.call(arguments, 1).forEach(function( source ) {
			if( !source ) return;
			for( var key in source ) {
				target[key] = source[key];
			}
		});
		return target;
	}
	function _result(prop, ctx) {
		return typeof prop == 'function' ?
		       prop.call(ctx) :
		       prop;
	}
	
	var View = function( parent, state ) {
		this.parent = parent;
		
		this.updateState(state, {reset: true});
		this._initTemplate();
		this.initialize();
	};
	View.extend = function( protoProps, staticProps ) {
		var Parent = this;
		var Child = protoProps.hasOwnProperty('constructor') ||
		            function() { Parent.apply(this, arguments) };
		
		// Add static properties to the constructor function.
		_extend(Child, Parent, staticProps);

		// `noop` is a dummy constructor to ensure `Parent.constructor`
		// isn't actually called as it could have unintended side effects.
		var noop = function() { this.constructor = Child; };
		noop.prototype = Parent.prototype;
		Child.prototype = _extend(new noop(), protoProps);
		
		// Convenience reference to parent.
		Child.__super__ = Parent.prototype;
		
		return Child;
	};
	View.define = function( relPath, viewName, Parent, props ) {
		var branch   = this.prototype.branch
		  , fullPath = branch.path+'.'+relPath;
		return Fractal.define(fullPath, viewName, Parent, props);
	};
	View.prototype = {
		constructor: View,
		
		// Static properties
		// -----------------
		// These properties remain the same for all instances, and are set when
		// defining this view.
		// 
		// Reference to a template object in Fractal.index
		branch:       undefined,
		// View name.
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
		
		// Indicates whether this view is added to the DOM. In <template> supporting
		// browsers, you could just check for `this.template.fragment.childNodes.length`,
		// but since IE does not support templates, we need a helper variable.
		_rendered:    false,
		
		_initTemplate: function() {
			if( !this.template ) {
				var templateName = this.branch.name
				  , local        = Fractal.getLocalTemplate(this.parent, templateName)
				  , original     = Fractal.getReferenceTemplate(local);
				// The DocumentFragment `fragment` is emptied when it's added to the DOM,
				// so we store its `childNodes` as a static array in `fragmentNodes` because
				// we still need them after they are added to the DOM.
				this.template = {
					local:         local,
					original:      original,
					fragment:      null,
					fragmentNodes: null
				};
			}
			
			var template           = this.template;
			template.fragment      = Fractal.createFragment(template.original || template.local);
			template.fragmentNodes = Array.prototype.slice.call(template.fragment.childNodes);
		},
		// Only used in `_createChild`.
		define: function( viewName ) {
			return this.constructor.define(viewName);
		},
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
		
		getFragmentNodes: function() {
			return this.template.fragmentNodes;
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
		// `how` determines where to place the new view. See `Fractal.out`
		// to find out what the possible values are, and what they do.
		add: function( viewName, state, how ) {
			var child  = this._createChild(viewName, state)
			  , local  = child.template.local
			  , before = how == 'append'  ? null :
			             how == 'prepend' ? local.parentNode.firstChild :
			             how == 'after'   ? local.nextSibling :
			                                local; // before
			
			this._addReference(child);
			return child.out(before);
		},
		// Give the template of a child view. Its content will not be
		// appended to the DOM.
		give: function( viewName, state ) {
			var child = this._createChild(viewName, state);
			return child.template;
		},
		out: function( before ) {
			if( before === undefined ) {
				before = this.empty();
				this._initTemplate();
			}
			this.beforeRender();
			this.render();
			this.afterRender();
			
			this.template.local.parentNode.insertBefore(this.template.fragment, before);
			this._rendered = true;
			
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
		// called when calling `destroy`. Use it to tear down things you set up in
		// `initialize`.
		remove: function() {},
		
		// Add children, tweak the DOM, add event listeners, etc.
		render: function() {},
		// When this view is emptied, undo things you did in render here. This is for
		// removing event listeners etc.
		clear: function() {},
		
		beforeStateChange: function( state ) {},
		// When this view's state has changed, this method is called, and an object
		// with all the changes is passed along.
		afterStateChange: function( diff ) {
			this.out();
		},
		beforeRender: function() {},
		// Post-process the render result, e.g. to implement a flavor of variable parsing.
		afterRender: function() {},
		
		// Methods for handling state
		// --------------------------
		// 
		// Update this view's state. This method will also set the `defaultState` properties on
		// the `state` object, and call `afterStateChange` if this view's already rendered, and the
		// state has changed.
		// 
		// You can't delete state properties. If you do want to delete a state property, you
		// should set it to `undefined`. If there is a default value defined for the property,
		// setting it to `undefined` will result in the property being set to its default value.
		updateState: function( key, value, options ) {
			var state;
			if( !key || key instanceof Object ) {
				state   = key;
				options = value;
			} else {
				(state = {})[key] = value;
			}
			
			var reset = options && options.reset;
			if( !state && !reset ) return this;
			state || (state = {});
			
			var defaultState = reset && _result(this.defaultState, this);
			var oldState     = this.state;
			this.state       = this._cloneState(reset ? defaultState : this.state) || {};
			
			this.beforeStateChange(state, options);
			
			// Merge the new state properties.
			Object.keys(state).forEach(function( key ) {
				var newValue = state[key];
				// When the new value is undefined, try to reset it to the default value, if applicable.
				if( newValue === undefined && this.defaultState ) {
					// Resolve the defaults, if it's not yet been done above.
					defaultState || (defaultState = _result(this.defaultState, this));
					newValue = defaultState[key];
				}
				this.state[key] = newValue;
			}, this);
			
			// Diff only happens when the view is already rendered. `afterStateChange` is
			// supposed to be used for changing the current state, not for completely
			// rerendering the entire view.
			if( oldState && this._rendered ) {
				var diff = this._diffState(oldState);
				if( diff ) {
					this.afterStateChange(diff, options);
				}
			}
			
			return this;
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
		},
		
		// Methods for creating children
		// -----------------------------
		// 
		_createChild: function( viewName, state ) {
			var viewClass = this._getChildView(viewName) ||
			                this.define(viewName);
			return new viewClass(this, state);
		},
		_getChildView: function( viewName ) {
			var branch = this.branch;
			return branch.childViews[viewName] ||
			       branch.ref && branch.ref.childViews[viewName];
		},
		
		// `_addReference` and `_removeReference` connect a child view to
		// its parent: this view.
		_addReference: function( child ) {
			this.children || (this.children = []);
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
		}
	}
	
	var Fractal = {
		View:        View,
		defaultView: View,
		
		// TODO: Explain.
		index: {},
		branch: {
			children:   {},
			childViews: {}
		},
		
		children:    undefined,
		
		define: function( fullPath, viewName, Parent, props ) {
			if( typeof viewName != 'string' ) {
				props    = Parent;
				Parent   = viewName;
				viewName = fullPath.split('.').pop();
			}
			if( !Parent || Parent.constructor == Object ) {
				props  = Parent;
				Parent = this.defaultView;
			}
			
			var branch = this.getBranch(fullPath);
			if( !branch )                            throw new Error('Template not found');
			if( branch.parent.childViews[viewName] ) throw new Error('View already defined');
			
			props || (props = {});
			props.name   = viewName;
			props.branch = branch;
			
			return branch.parent.childViews[viewName] = Parent.extend(props);
		},
		
		// Import some methods from `View`.
		append:           View.prototype.append,
		prepend:          View.prototype.prepend,
		before:           View.prototype.before,
		after:            View.prototype.after,
		add:              View.prototype.add,
		give:             View.prototype.give,
		_createChild:     View.prototype._createChild,
		_getChildView:    View.prototype._getChildView,
		_addReference:    View.prototype._addReference,
		_removeReference: View.prototype._removeReference,
		
		// Utility methods
		// ---------------
		// 
		createFragment: function( template ) {
			var fragment = document.createDocumentFragment()
			  , source   = _supportsTemplate ? template.content : template;
						       
			// Create a fresh fragment clone, which is passed to `render`.
			Array.prototype.forEach.call(source.childNodes, function( childNode ) {
				var clone = childNode.cloneNode(true);
				// Set `data-clone`, only on elements containing children.
				if( clone.setAttribute && clone.childNodes.length ) {
					clone.setAttribute('data-clone', 'true');
				}
				fragment.appendChild(clone);
			});
			
			return fragment;
		},
		getBranch: function( path ) {
			var crumbs  = path.split('.')
			  , current = this.branch;
			crumbs.some(function( crumb ) {
				current = current.children[crumb] ||
				          current.ref && current.ref.children[crumb];
				if( !current ) return true;
			});
			return current;
		},
		getFragmentNodes: function() {
			return [document.body];
		},
		getLocalTemplate: function( view, name ) {
			var fragmentNodes = view.getFragmentNodes()
			  , match;
			fragmentNodes.some(function find( el ) {
				if( !el.querySelectorAll ) return;
				
				var templates = Fractal.queryForTemplates(el, name);
				if( templates.length > 1 ) {
					throw new Error('Template `'+name+'` view not unique in `'+view.path+'`');
				}
				match = templates[0];
				return !!match;
			});
			
			if( !match ) {
				throw new Error('No template `'+name+'` found in `'+view.path+'`');
			}
			return match;
		},
		getReferenceTemplate: function( template ) {
			var path = template.getAttribute('data-ref');
			if( path ) {
				var branch = this.index[path];
				if( !branch ) throw new Error('Template reference `'+path+'` not found');
				return branch.template;
			} else {
				return null;
			}
		},
		queryForTemplates: function( el, name ) {
			var query     = name ? 'template[data-name="'+name+'"]' : 'template'
			  , parent    = _isTemplateElement(el) ? el.content : el
			  , templates = Array.prototype.slice.call(parent.querySelectorAll(query));
			
			return templates.filter(function( childTemplate ) {
				var match = this._findParentTemplate(parent, childTemplate);
				return match == parent;
			}, this);
		},
		
		// Finds all <template> elements in `el`, and indexes them.
		// When it finds a <template>, it will store it in the index, and replace
		// it with an empty <template ref="x">.
		scan: function( el, branch, crumbs ) {
			branch || (branch = this.branch);
			crumbs || (crumbs = []);
			
			var matches = this.queryForTemplates(el);
			matches.forEach(function( template ) {
				var name = template.getAttribute('data-name')
				  , ref  = template.getAttribute('data-ref') || undefined
				  , path = this._pushCrumb(crumbs, name);
				
				// Create a new template object.
				var childBranch = branch.children[name] = {
					parent:     branch,
					name:       name,
					path:       path,
					ref:        ref,
					template:   template,
					children:   {},
					childViews: {}
				};
				this.index[path] = childBranch;
				
				if( childBranch.ref ) {
					// Reference templates cannot have content.
					var content = _supportsTemplate ? template.content : template;
					content.childNodes.length = 0;
				} else {
					this.scan(template, branch.children[name], crumbs);
					
					// Replace the original with a reference template.
					var replacement = document.createElement('template');
					replacement.setAttribute('data-name', name);
					replacement.setAttribute('data-ref',  path);
					template.parentNode.replaceChild(replacement, template);
				}
				
				this._popCrumb(crumbs);
			}, this);
			
			// For the branches that have the `ref` property set, replace the string path
			// with a reference to the actual template object.
			if( !crumbs.length ) {
				for( var path in this.index ) {
					var ref = this.index[path].ref;
					if( ref ) {
						if( !this.index[ref] ) throw new Error('Reference template not found: '+ref);
						this.index[path].ref = this.index[ref];
					}
				}
			}
		},
		
		// Can return 4 things, in order of importance:
		// 1. The provided `parent`
		// 2. A parent <template> to `template`
		// 3. A DocumentFragment
		// 4. An <element clone="true">
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
		
		_pushCrumb: function( crumbs, name ) {
			crumbs.push(name);
			return crumbs.join('.');
		},
		_popCrumb: function( crumbs ) {
			return crumbs.pop();
		}
	};
	
	exports.Fractal = Fractal;
})(typeof exports == 'object' ? exports : this);