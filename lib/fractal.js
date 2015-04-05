

(function( exports ) {
	'use strict';
	
	var _supportsTemplate = 'content' in document.createElement('template');
	
	function _isTemplateElement( el ) {
		return _supportsTemplate && el instanceof HTMLTemplateElement;
	}
	function _extend( target ) {
		var len = arguments.length, i, source, key;
		for( i = 1; i < len; ++i ) {
			if( !(source = arguments[i]) ) continue;
			for( key in source ) {
				target[key] = source[key];
			}
		}
		return target;
	}
	function _filter( array, func ) {
		var i, arg, ret = [];
		for( i = 0; arg = array[i]; i++ ) {
			func(arg, i) && ret.push(arg);
		}
		return ret;
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
		this._callHook('initialize');
		this.initialize();
	};
	// Used to subclass a view. This is used in `define`, but can also
	// be called manually.
	View.extend = function( props, statics ) {
		var Parent = this;
		var Child  = !props.hasOwnProperty('constructor') ?
		             function() { Parent.apply(this, arguments) } :
		             props.constructor;
		
		// Add static properties to the constructor function.
		_extend(Child, Parent, statics);
		
		Child.prototype = Object.create(Parent.prototype);
		Child.prototype.constructor = Child;
		// If there are mixins defined, mix them in before the props.
		_extend(Child.mixin(props.mixins), props);
		
		// Convenience reference to parent.
		Child.__super__ = Parent.prototype;
		
		return Child;
	};
	// Relative version of `Fractal.define`. Instead of the full path to a
	// template, provide a path relative to this one. For more information
	// see `Fractal.define`.
	View.define = function( relPath, viewName, Parent, props ) {
		var branch   = this.prototype.branch
		  , fullPath = branch.path+'.'+relPath;
		return Fractal.define(fullPath, viewName, Parent, props);
	};
	// Mix additional functionality into this view. Is automatically called
	// when `define` is used to create a view and a `mixins` property is set
	// in the subclass definition. See `Fractal.defineMixin` for more information
	// about creating mixins.
	View.mixin = function( mixinName ) {
		if( mixinName instanceof Array ) {
			mixinName.forEach(this.mixin, this);
		} else if( mixinName ) {
			var mixins = this.prototype._mixins || (this.prototype._mixins = {})
			  , mixin  = Fractal.getMixin(mixinName)
			  , def;
			
			if( !mixins[mixinName] ) {
				mixins[mixinName] = true;
				def = typeof mixin == 'function' ? mixin(this) : mixin;
				// Apply this mixin to this view class.
				this.mixin(def.require);
				this.addHook(def.hooks);
				if( def.prototype ) {
					_extend(this.prototype, def.prototype);
				}
			}
		}
		
		return this.prototype;
	};
	// Adds a hook function for a specific action. The hookable actions
	// are the same as the overridable callback methods in the `View`
	// definition. The difference is, the callback methods are meant for
	// individual view definitions, whereas hooks are meant for mixin
	// definitions.
	// 
	// This separation is significant, because when defining a mixin it's
	// unknown which view it will be applied on, and whether that view
	// already has a callback method defined. If this is the case, the
	// subclassed method should call the parent class' method as well.
	// `addHook` takes care of this.
	// 
	// `View.addHook(obj)` is also possible.
	View.addHook = function( action, func ) {
		if( !action ) return;
		if( action.constructor == Object ) {
			for( var key in action ) {
				this.addHook(key, action[key]);
			}
			return;
		}
		// Register the hook. If there's already a hook attached, wrap them
		// inside a function that calls the old hook before the new hook.
		var hooks = this.prototype._hooks || (this.prototype._hooks = {})
		  , cur   = hooks[action];
		if( cur ) {
			hooks[action] = function() {
				if( arguments.length ) {
					cur.apply(this, arguments);
					func.apply(this, arguments);
				} else {
					cur.call(this);
					func.call(this);
				}
			};
		} else {
			hooks[action] = func;
		}
	};
	View.prototype = {
		constructor: View,
		
		// Static properties
		// -----------------
		// These properties remain the same for all instances, and are set when
		// defining this view.
		// 
		// Reference to a template object in Fractal.branch
		branch:       undefined,
		// View name.
		name:         undefined,
		// Names of mixins that have been added to this view's definition.
		// See `View.extend` and `View.mixin`.
		mixins:       undefined,
		
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
		
		// Indicates whether this view is added to the parent fragment. In <template>
		// supporting browsers, you could just check for `this.template.fragment.childNodes.length`,
		// but since IE does not support templates, we need a helper variable.
		_rendered:    false,
		_mounted:     false,
		
		// Don't override
		// --------------
		// Hash map object for keeping track which mixins have been applied
		// to this view. See `View.mixin`.
		_mixins:      undefined,
		// Object.
		_hooks:       undefined,
		
		_initTemplate: function() {
			if( !this.template ) {
				var templateName = this.branch.name
				  , local        = Fractal.getLocalTemplate(this.parent, templateName)
				  , original     = Fractal.getReferenceTemplate(local);
				// The DocumentFragment `fragment` is emptied when it's added to the DOM,
				// so we store its `childNodes` as a static array in `fragmentNodes`
				// because we still need them after they are added to the DOM.
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
			this._callHook('remove');
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
			this._callHook('clear');
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
			this._mounted  = false;
			
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
		// Adds a new child view when there's none with this name added yet.
		// Otherwise, it destroys all but the last one, and updates the state
		// on the last one.
		replace: function( viewName, state ) {
			if( this.children ) {
				var View     = Fractal.getView(this.branch.path, viewName)
				  , filtered = this.children.filter(function( child ) {
				    	return child.constructor === View;
				    });
				
				if( filtered.length ) {
					var last = filtered.length - 1
					  , view = filtered[last].updateState(state);
					// Destroy all but the last filtered view.
					for( var i = 0; i < last; i++ ) {
						filtered[i].destroy();
					}
					return view;
				}
			}
			
			return this.add(viewName, state);
		},
		out: function( before ) {
			if( before === undefined ) {
				before = this.empty();
				this._initTemplate();
			}
			
			this._callHook('render');
			this.render();
			this._callHook('afterRender');
			this.afterRender();
			
			var parentNode = (before || this.template.local).parentNode;
			parentNode.insertBefore(this.template.fragment, before);
			
			this._rendered = true;
			this.propagateMount();
			
			return this;
		},
		propagateMount: function() {
			if( !this.parent._mounted ) return;
			
			this._mounted = true;
			this.children && this.children.forEach(function( childView ) {
				childView.propagateMount();
			});
			this._callHook('afterMount');
			this.afterMount();
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
		// Called before the state is changed. Can be used to mutate state properties
		// before they're set on the view.
		beforeStateChange: function( state ) {},
		// When this view's state has changed, this method is called, and an object
		// with all the changes is passed along.
		afterStateChange: function( diff ) {
			this.out();
		},
		// Post-process the render result, e.g. to implement a flavor of variable parsing.
		afterRender: function() {},
		// Called after the fragment is added to the DOM.
		afterMount: function() {},
		
		// Methods for handling state
		// --------------------------
		// 
		// Update this view's state. This method will also set the `defaultState`
		// properties on the `state` object, and call `afterStateChange` if this view's
		// already rendered, and the state has changed.
		// 
		// You can't delete state properties. If you do want to delete a state property,
		// you should set it to `undefined`. If there is a default value defined for
		// the property, setting it to `undefined` will result in the property being
		// set to its default value.
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
			
			this._callHook('beforeStateChange', state, options);
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
					this._callHook('afterStateChange', diff, options);
					this.afterStateChange(diff, options);
				}
			}
			
			return this;
		},
		_cloneState: function( state ) {
			if( !state ) return state;
			return _extend({}, state);
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
			var viewClass = Fractal.getView(this.branch.path, viewName) ||
			                this.define(viewName);
			return new viewClass(this, state);
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
		},
		
		// See `View.addHook`.
		_callHook: function( name /* [, arg]... */ ) {
			if( !this._hooks || !this._hooks[name] ) return;
			// If no additional arguments are passed, call the hook directly to
			// avoid using `apply`.
			var len = arguments.length;
			if( len > 1 ) {
				var args = new Array(len);
				for( var i = 1; i < len; ++i ) {
					args[i] = arguments[i];
				}
				this._hooks[name].apply(this, args);
			} else {
				this._hooks[name].call(this);
			}
		}
	};
	
	var Fractal = {
		View:         View,
		defaultView:  View,
		children:     undefined,
		
		// List of mixin definitions: `{name: def}`
		// See `Fractal.defineMixin`.
		mixins:       {},
		
		// TODO: Explain.
		branch: {
			path:       '',
			children:   {},
			childViews: {}
		},
		// The index is filled in `scan`:
		// { 'path.to.tpl': [branchObject [, referencingBranches...]] }
		index:        {},
		
		_mounted:     true,
		
		// Possible argument usage:
		// `define(['path.to.tpl',] 'newViewName', [, [parentViewClass, || 'path.to.parentTpl#viewName',] [propsObject]]);`
		define: function( fullPath, viewName, Parent, props ) {
			// Since the arguments are very flexible, we need a bit of code to determine
			// the actual arguments that are being passed.
			var strings     = _filter(arguments, function( arg ) { return typeof arg == 'string' })
			  , objects     = _filter(arguments, function( arg ) { return arg instanceof Object })
			  , stringCount = strings.length
			  , objectCount = objects.length
			  , lastString  = strings[stringCount-1]
			  , lastObject  = objects[objectCount-1]
			  , firstObject = objects[0];
			// A viewpath is `path.to.tpl#viewName`.
			var lastIsPath  = stringCount == 3 || lastString.indexOf('#') != -1
			  , noViewName  = stringCount == 1 || stringCount == 2 && lastIsPath
			  , hasParent   = lastIsPath || firstObject && firstObject.constructor != Object;
			
			// We have enough information to determine the correct arguments.
			fullPath = fullPath;
			viewName = noViewName ? fullPath.split('.').pop() : viewName
			Parent   = hasParent ?
			           Fractal.getView(lastIsPath ? lastString : firstObject) :
			           Fractal.defaultView;
			props    = lastObject && (!hasParent || lastIsPath || objectCount == 2) ? lastObject : {};
			
			var branch = this.getBranch(fullPath);
			if( !branch ) {
				throw new Error('Template not found: '+fullPath);
			} else if( branch.parent.childViews[viewName] ) {
				throw new Error('View already defined: '+branch.parent.path+'#'+viewName);
			}
			
			// Perform some mutations on the provided props; a view should always
			// have a name and a branch...
			props.name   = viewName;
			props.branch = branch;
			// ... and the defaultState should be merged with the parent class', if both
			// exist and are plain objects.
			var defaultState       = props.defaultState
			  , parentDefaultState = Parent.prototype.defaultState
			if(
				defaultState && defaultState.constructor == Object &&
				parentDefaultState && parentDefaultState.constructor == Object
			) {
				props.defaultState = _extend({}, parentDefaultState, defaultState);
			}
			
			// Create new class, and register it in every branch referencing this template.
			var Child = Parent.extend(props);
			this.index[branch.path].forEach(function( branch ) {
				branch.parent.childViews[viewName] = Child;
			});
			
			return Child;
		},
		// `def` is a mixin definition object:
		// {
		//   require:   Optional array of required mixins
		//   hooks:     Optional object of hooks ({name: function, ...})
		//   prototype: Optional object of methods to be applied to the view's
		//              prototype.
		// }
		defineMixin: function( name, def ) {
			if( name in this.mixins ) {
				throw new Error('A mixin with this name already exists: '+def.name);
			}
			this.mixins[name] = def;
		},
		
		// Import some methods from `View`.
		append:           View.prototype.append,
		prepend:          View.prototype.prepend,
		before:           View.prototype.before,
		after:            View.prototype.after,
		add:              View.prototype.add,
		give:             View.prototype.give,
		_createChild:     View.prototype._createChild,
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
				if( !crumb ) return;
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
				
				var templates = this._findTemplates(el, name);
				if( templates.length > 1 ) {
					throw new Error('Template `'+name+'` view not unique in `'+view.path+'`');
				}
				match = templates[0];
				return !!match;
			}, this);
			
			if( !match ) {
				throw new Error('No template `'+name+'` found in `'+view.path+'`');
			}
			return match;
		},
		getReferenceTemplate: function( template ) {
			var path = template.getAttribute('data-ref');
			if( path ) {
				var branch = this.index[path][0];
				if( !branch ) throw new Error('Template reference `'+path+'` not found');
				return branch.template;
			} else {
				return null;
			}
		},
		// getView('path.to.template#viewName') or
		// getView('path.to.template', 'viewName')
		getView: function( viewPath, viewName ) {
			if( typeof viewPath != 'string' ) return viewPath;
			
			var templatePath, path;
			if( viewName ) {
				templatePath = viewPath;
			} else {
				path         = viewPath.split('#');
				templatePath = path[0];
				viewName     = path[1];
			}
			
			if( !viewName ) throw new Error('Illegal view path');
			var branch = this.getBranch(templatePath);
			
			return branch.childViews[viewName] ||
			       branch.ref && branch.ref.childViews[viewName];
		},
		getMixin: function( name ) {
			return this.mixins[name];
		},
		
		// Finds all <template> elements in `el`, and indexes them.
		// When it finds a <template>, it will store it in the index, and replace
		// it with an empty <template ref="x">.
		scan: function( el, branch, crumbs ) {
			branch || (branch = this.branch);
			crumbs || (crumbs = []);
			
			var matches = this._findTemplates(el);
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
				this.index[path] = [childBranch];
				
				// Replace the original with a reference template.
				this._replaceTemplate(template, path);
				if( !ref ) {
					this.scan(template, branch.children[name], crumbs);
				}
				
				this._popCrumb(crumbs);
			}, this);
			
			if( !crumbs.length ) {
				this._indexTemplates();
			}
		},
		
		_findTemplates: function( el, name ) {
			var query     = name ? 'template[data-name="'+name+'"]' : 'template'
			  , parent    = _isTemplateElement(el) ? el.content : el
			  , templates = Array.prototype.slice.call(parent.querySelectorAll(query));
			
			return templates.filter(function( childTemplate ) {
				var match = this._findParentTemplate(parent, childTemplate);
				return match == parent;
			}, this);
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
		// For the branches that have the `ref` property set, replace the string path
		// with a reference to the actual template object.
		// 
		// Also cross-reference between the actual template branch, and the reference
		// branch.
		_indexTemplates: function() {
			for( var path in this.index ) {
				var branch   = this.index[path][0]
				  , ref      = branch.ref;
				if( ref ) {
					if( !this.index[ref] ) throw new Error('Reference template not found: '+ref);
					branch.ref = this.index[ref][0];
					// Register the reference. This is used to check which views are referencing
					// a certain view. Used in `define`.
					this.index[ref].push(branch);
				}
			}
		},
		// Replace an actual <template> with a <template data-ref="original">.
		// When it's already a ref template, make sure it's empty.
		_replaceTemplate: function( template, path ) {
			var name = template.getAttribute('data-name')
			  , ref  = template.getAttribute('data-ref');
			if( ref ) {
				// Reference templates cannot have content.
				var content = _supportsTemplate ? template.content : template;
				content.childNodes.length = 0;
			} else {
				var replacement = document.createElement('template');
				replacement.setAttribute('data-name', name);
				replacement.setAttribute('data-ref',  path);
				template.parentNode.replaceChild(replacement, template);
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