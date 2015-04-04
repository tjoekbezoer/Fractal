// Default modifiers
Fractal.Variable.modifier({
	date: function( format ) {
		var date = this.value;
		if( date ) {
			if( !(date instanceof Date) ) {
				date = new Date(+date);
			}
			if( !isNaN(+date) ) {
				this.value = MapKit.Date.strftime(date, format || 'j M Y');
			}
		}
		return this;
	},
	datetime: function( format ) {
		return this.date(format || 'j M Y H:i');
	},
	default: function( defaultValue ) {
		if( this.value == '' ) {
			this.value = defaultValue;
		}
		return this;
	},
	i18n: function() {
		this.value = this.value.i18n(this.state);
		return this;
	},
	datetime: function( format ) {
		this.value = MapKit.Date.strftime(this.value, format||'j M Y H:i');
		return this;
	},
	yesNo: function() {
		this.value = !!this.value ? 'yes'.i18n() : 'no'.i18n();
		return this;
	},
	yesNoEmpty: function() {
		if( this.value !== null && this.value !== undefined ) {
			this.value = !!this.value ? 'yes'.i18n() : 'no'.i18n();
		}
		return this;
	},
	prepend: function( value ) {
		this.value = value + this.value;
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