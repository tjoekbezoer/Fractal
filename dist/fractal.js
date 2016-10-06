(function( exports ) {
'use strict';

var _supportsTemplate = 'content' in document.createElement('template');

function _isRealTemplateElement( el ) {
	return _supportsTemplate && el instanceof HTMLTemplateElement;
}
function _tagName( el ) {
	return el.tagName.toLowerCase();
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
function _call( func, ctx, args ) {
	if( !ctx ) return;
	var a1 = args[0], a2 = args[1], a3 = args[2];
	switch( args.length ) {
		case 0:  func.call(ctx);             return;
		case 1:  func.call(ctx, a1);         return;
		case 2:  func.call(ctx, a1, a2);     return;
		case 3:  func.call(ctx, a1, a2, a3); return;
		default: func.apply(ctx, args);      return;
	}
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
	// Register custom hooks.
	Child.addHook(props.hooks);
	
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
	// 
	// The hooks object always needs to be cloned, because if it's set on
	// the parent prototype we would be manipulating it in the Child because
	// of pass by reference.
	var hooks = (this.prototype._hooks = _extend({}, this.prototype._hooks))
	  , cur   = hooks[action];
	if( cur ) {
		hooks[action] = function() {
			// Clone the arguments, so `arguments` is not passed by reference...
			var len  = arguments.length
			  , args = new Array(len);
			for( var i = 0; i < len; i++ ) args[i] = arguments[i];
			// ... and call the original before the new hook.
			_call(cur, this, args);
			_call(func, this, args);
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
		
		this._callHook('initTemplate');
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
		// When using `out` as an event callback, unrelated args can be passed.
		// TODO: Refactor `out` so that it doesnt have arguments!!
		before == null || before instanceof Node || (before = undefined);
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
		// Clone the arguments, so `arguments` is not passed by reference.
		var len  = arguments.length
		  , args = new Array(len-1);
		for( var i = 1; i < len; ++i ) args[i-1] = arguments[i];
		_call(this._hooks[name], this, args);
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
			throw new Error('A mixin with this name already exists: '+name);
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
		  , elements;
		
		if( _tagName(template) === 'template' ) {
			elements = _isRealTemplateElement(template) ?
			           template.content.childNodes :
			           template.childNodes;
		} else {
			elements = [template];
		}
		// Create a fresh fragment clone, which is passed to `render`.
		Array.prototype.forEach.call(elements, function( childNode ) {
			var clone = childNode.cloneNode(true);
			if( clone.setAttribute ) {
				clone.removeAttribute('data-name');
				clone.removeAttribute('data-tpl');
				// If this element has child elements, tag it as cloned.
				// This is used in `_isFirstRelevantParentOf` for `_findTemplates`,
				// to find the correct direct child templates for an element.
				if( !clone.children && clone.childNodes.length || clone.children.length ) {
					clone.setAttribute('data-clone', 'true');
				}
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
				throw new Error('Template `'+name+'` view not unique in `'+view.branch.path+'`');
			}
			match = templates[0];
			return !!match;
		}, this);
		
		if( !match ) {
			throw new Error('No template `'+name+'` found in `'+view.branch.path+'`');
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
		var query     = name ?
		                'template[data-name="'+name+'"], *[data-tpl][data-name="'+name+'"]' :
		                'template, *[data-tpl]'
		  , parent    = _isRealTemplateElement(el) ? el.content : el
		  , templates = Array.prototype.slice.call(parent.querySelectorAll(query));
		
		return templates.filter(function( childTemplate ) {
			return this._isFirstRelevantParentOf(childTemplate, parent);
		}, this);
	},
	// Returns true if `parent` is the first 'template-relevant' parent
	// it finds.
	// 
	// It returns false if it finds any one these 3 elements first, or
	// no relevant parent at all:
	// 1. A DocumentFragment — This occurs only in `Fractal.scan`.
	// 2. A parent template, identified by <element data-name="name">
	// 3. An <element clone="true">
	_isFirstRelevantParentOf: function( template, parent ) {
		while( template = template.parentNode ) {
			if( template === parent ) {
				return true;
			} else if(
				template instanceof DocumentFragment ||
				_tagName(template) == 'template' || // is real template tag, other parent
				template.hasAttribute('data-tpl') || // is data-tpl template tag, other parent
				template.getAttribute('data-clone') == 'true'
			) {
				break;
			}
		}
		return false;
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
		var tagName = _tagName(template)
		  , name    = template.getAttribute('data-name')
		  , ref     = template.getAttribute('data-ref');
		// When the template is alread a ref template, just make sure it's
		// empty. Otherwise replace the real template (with content) with
		// a ref template (without content).
		if( ref ) {
			// Reference templates cannot have content.
			var children = _isRealTemplateElement(template) ?
			               template.content.childNodes :
			               template.childNodes;
			while( children.firstChild ) {
				children.removeChild(children.firstChild);
			}
		} else {
			var replacement = document.createElement(tagName);
			replacement.setAttribute('data-name', name);
			replacement.setAttribute('data-ref',  path);
			// If this is not a real template...
			if( !_isRealTemplateElement(replacement) ) {
				// ... set the `data-tpl` attribute...
				replacement.setAttribute('data-tpl', '');
				// ... and hide the 'template' element
				replacement.setAttribute('hidden', '');
				if( _tagName(replacement) == 'option' ) {
					replacement.setAttribute('disabled', '');
				} else {
					replacement.style.display = 'none';
				}
			}
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
Fractal.defineMixin('invoke', {
	prototype: {
		// Tries to call a method name on the first parent that has that
		// method defined. As soon as a match is found, it will invoke
		// the method and return.
		invokeUp: function( methodName /*[, arg]...*/) {
			var len = arguments.length;
			var args = new Array(len-1);
			for( var i = 1; i < len; ++i ) args[i-1] = arguments[i];
			
			var cur = this.parent;
			while( cur ) {
				if( typeof cur[methodName] == 'function' ) {
					return cur[methodName].apply(cur, args);
				}
				cur = cur.parent;
			}
		},
		// Recursively walks down this view's children tree to look for views
		// with the given method defined. If a child with that method is found,
		// it's invoked, and *that branch* will not be further traversed. Other
		// branches will still be searched for that method.
		invokeDown: function( methodName  /*[, arg]...*/ ) {
			var len = arguments.length;
			var args = new Array(len-1);
			for( var i = 1; i < len; ++i ) args[i-1] = arguments[i];
			
			_invokeChildren(this.children, methodName, args);
		}
	}
});

function _invokeChildren( children, methodName, args ) {
	var child;
	if( !children ) return;
	for( var i = 0; child = children[i]; ++i ) {
		if( typeof child[methodName] == 'function' ) {
			child[methodName].apply(child, args);
		} else {
			_invokeChildren(child.children, methodName, args);
		}
	}
}
Fractal.defineMixin('query', {
	hooks: {
		initTemplate: function() {
			this.$fragment = $(this.template.fragmentNodes).filter('*');
		},
		remove: function() {
			this.$fragment = null;
		}
	},
	prototype: {
		$fragment: undefined,
		
		$: function( selector ) {
			var parents  = this.$fragment.filter(selector)
			  , children = this.$fragment.find(selector);
			if( parents.length && children.length ) {
				return parents.add(children);
			} else {
				return parents.length ? parents : children;
			}
		}
	}
});
Fractal.defineMixin('variables', {
	hooks: {
		afterRender: function() {
			this.replaceVariables();
		}
	},
	prototype: {
		// Replace {variable} definitions in the rendered HTML tree.
		replaceVariables: function( nodes ) {
			nodes || (nodes = this.template.fragmentNodes);
			Variable.parseElements(nodes, this.replaceVariablesWith());
		},
		// TODO: This is not the way to go. We should be able to bind a view to a model?
		//       Maybe a view should be a model itself?
		replaceVariablesWith: function() {
			return this.state;
		}
	}
});

// Variable class
// --------------
// Recognize variable definitions.
var _regVariables   = /\{('?)([^}.]+)\1(\.[^}]+)?\}/gi;
// Replace disallowed character from a string variable to turn it into
// an allowed javascript variable name.
var _regStr2VarName = /[^a-z0-9_]/gi;

// Additional modifiers can be added via `Fractal.Variable.modifier` method.
var Variable = Fractal.Variable = function( value, state ) {
	this.value = value != undefined ? value : '';
	this.state = state;
};
// {var}              Print variable value.
// {var.mod()}        Print variable value after tunning through modifier(s).
// {'string'}         Print string value (useless, but ok).
// {'string'.mod()}   Print string value after running through modifier(s).
Variable.parse = function( text, state ) {
	return text.replace(_regVariables, function ( match, quote, varName, modifiers ) {
		var isString = !!quote;
		
		if( isString && !modifiers ) {
			return varName;
		}
		
		var value = isString ? varName : state[varName];
		if( modifiers ) {
			var variable = new Variable(value, state);
			// Prepend _ to prevent problems with reserved keywords as variable names.
			varName = '_'+(isString ? varName.replace(_regStr2VarName, '_') : varName);
			Function(varName, varName+modifiers)(variable);
			value = variable.value;
		}
		
		return value != undefined ? value.toString() : '';
	});
};
Variable.parseElements = function parseElements( nodes, state, ignoreClones ) {
	if( !nodes && !nodes.length ) return;
	
	var node;
	for( var i = 0; node = nodes[i]; i++ ) {
		if( node instanceof Text ) {
			// Replace variables in text nodes.
			if( node.nodeValue.trim() ) {
				node.nodeValue = Variable.parse(node.nodeValue, state);
			}
		} else if( node instanceof Element ) {
			// Replace variables in attributes.
			if( node.hasAttributes() ) {
				var attrs = node.attributes, attr;
				for( var j = 0; attr = attrs[j]; j++ ) {
					attr.value = Variable.parse(attr.value, state);
				}
			}
			// Parse children.
			if( node.firstChild && !ignoreClones || !node.hasAttribute('data-clone') ) {
				parseElements(node.childNodes, state, true);
			}
		}
	}
};
Variable.modifier = function modifier( name, method ) {
	if( name.constructor == Object ) {
		for( var modName in name ) modifier(modName, name[modName]);
		return;
	}
	
	Variable.prototype[name] = method;
};

// Default modifiers
// -----------------
Fractal.Variable.modifier({
	default: function( defaultValue ) {
		if( this.value == '' || this.value == null ) {
			this.value = defaultValue;
		}
		return this;
	},
	prepend: function( value ) {
		if( this.value != '' && this.value != null ) {
			this.value = value + this.value;
		}
		return this;
	},
	upper: function() {
		this.value = this.value.toUpperCase();
		return this;
	},
	upperFirst: function() {
		if( this.value.length ) {
			this.value = this.value[0].toUpperCase() + this.value.substr(1);
		}
		return this;
	}
});


exports.Fractal = Fractal;
if( typeof module == 'object' && module.exports ) {
	module.exports = Fractal;
}
})(typeof exports == 'object' ? exports : this);
