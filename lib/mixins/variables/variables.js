(function() {
	// Recognize variable definitions.
	var _regVariables   = /\{('?)([^}.]+)\1(\.[^}]+)?\}/gi;
	// Replace disallowed character from a string variable to turn it into
	// an allowed javascript variable name.
	var _regStr2VarName = /[^a-z0-9_]/gi;
	
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
	
	// Define and expose `Variable` class.
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
})();