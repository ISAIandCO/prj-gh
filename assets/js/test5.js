(function(BX) {
	/* list of registered proxy functions */
	var proxyList = new WeakMap();
	var deferList = new WeakMap();

	/* List of denied event handlers */
	var deniedEvents = [];

	/* list of registered custom events */
	var customEvents = new WeakMap();
	var customEventsCnt = 0;

	/* list of external garbage collectors */
	var garbageCollectors = [];

	/* list of loaded CSS files */
	var cssList = [];
	var cssInit = false;

	/* list of loaded JS files */
	var jsList = [];
	var jsInit = false;

	var eventTypes = {
		click: 'MouseEvent',
		dblclick: 'MouseEvent',
		mousedown: 'MouseEvent',
		mousemove: 'MouseEvent',
		mouseout: 'MouseEvent',
		mouseover: 'MouseEvent',
		mouseup: 'MouseEvent',
		focus: 'MouseEvent',
		blur: 'MouseEvent'
	};

	var lastWait = [];

	var CHECK_FORM_ELEMENTS = {tagName: /^INPUT|SELECT|TEXTAREA|BUTTON$/i};

	var PRELOADING = 1;
	var PRELOADED = 2;
	var LOADING = 3;
	var LOADED = 4;
	var assets = {};
	var isAsync = null;

	BX.MSLEFT = 1;
	BX.MSMIDDLE = 2;
	BX.MSRIGHT = 4;

	BX.AM_PM_UPPER = 1;
	BX.AM_PM_LOWER = 2;
	BX.AM_PM_NONE = false;

	BX.ext = function(ob)
	{
		for (var i in ob)
		{
			if(ob.hasOwnProperty(i))
			{
				this[i] = ob[i];
			}
		}
	};

	var r = {
		script: /<script([^>]*)>/ig,
		script_end: /<\/script>/ig,
		script_src: /src=["\']([^"\']+)["\']/i,
		script_type: /type=["\']([^"\']+)["\']/i,
		space: /\s+/,
		ltrim: /^[\s\r\n]+/g,
		rtrim: /[\s\r\n]+$/g,
		style: /<link.*?(rel="stylesheet"|type="text\/css")[^>]*>/i,
		style_href: /href=["\']([^"\']+)["\']/i
	};

	BX.processHTML = function(data, scriptsRunFirst)
	{
		var matchScript, matchStyle, matchSrc, matchHref, matchType, scripts = [], styles = [];
		var textIndexes = [];
		var lastIndex = r.script.lastIndex = r.script_end.lastIndex = 0;

		while ((matchScript = r.script.exec(data)) !== null)
		{
			r.script_end.lastIndex = r.script.lastIndex;
			var matchScriptEnd = r.script_end.exec(data);
			if (matchScriptEnd === null)
			{
				break;
			}

			// skip script tags of special types
			var skipTag = false;
			if ((matchType = matchScript[1].match(r.script_type)) !== null)
			{
				if(matchType[1] == 'text/html' || matchType[1] == 'text/template')
					skipTag = true;
			}

			if(skipTag)
			{
				textIndexes.push([lastIndex, r.script_end.lastIndex - lastIndex]);
			}
			else
			{
				textIndexes.push([lastIndex, matchScript.index - lastIndex]);

				var bRunFirst = scriptsRunFirst || (matchScript[1].indexOf('bxrunfirst') != '-1');

				if ((matchSrc = matchScript[1].match(r.script_src)) !== null)
				{
					scripts.push({"bRunFirst": bRunFirst, "isInternal": false, "JS": matchSrc[1]});
				}
				else
				{
					var start = matchScript.index + matchScript[0].length;
					var js = data.substr(start, matchScriptEnd.index-start);

					scripts.push({"bRunFirst": bRunFirst, "isInternal": true, "JS": js});
				}
			}

			lastIndex = matchScriptEnd.index + 9;
			r.script.lastIndex = lastIndex;
		}

		textIndexes.push([lastIndex, lastIndex === 0 ? data.length : data.length - lastIndex]);
		var pureData = "";
		for (var i = 0, length = textIndexes.length; i < length; i++)
		{
			if (BX.type.isString(data) && BX.type.isFunction(data.substr))
			{
				pureData += data.substr(textIndexes[i][0], textIndexes[i][1]);
			}
		}

		while ((matchStyle = pureData.match(r.style)) !== null)
		{
			if ((matchHref = matchStyle[0].match(r.style_href)) !== null && matchStyle[0].indexOf('media="') < 0)
			{
				styles.push(matchHref[1]);
			}

			pureData = pureData.replace(matchStyle[0], '');
		}

		return {'HTML': pureData, 'SCRIPT': scripts, 'STYLE': styles};
	};

	/* OO emulation utility */
	BX.extend = function(child, parent)
	{
		var f = function() {};
		f.prototype = parent.prototype;

		child.prototype = new f();
		child.prototype.constructor = child;

		child.superclass = parent.prototype;
		child.prototype.superclass = parent.prototype;
		if(parent.prototype.constructor == Object.prototype.constructor)
		{
			parent.prototype.constructor = parent;
		}
	};

	BX.is_subclass_of = function(ob, parent_class)
	{
		if (ob instanceof parent_class)
			return true;

		if (parent_class.superclass)
			return BX.is_subclass_of(ob, parent_class.superclass);

		return false;
	};

	BX.clearNodeCache = function()
	{
		return false;
	};

	BX.bitrix_sessid = function() {return BX.message("bitrix_sessid"); };

	/**
	 * Creates document fragment with child nodes.
	 *
	 * @param {Node[]} nodes
	 * @return {DocumentFragment}
	 */
	BX.createFragment = function(nodes)
	{
		var fragment = document.createDocumentFragment();

		if(!BX.type.isArray(nodes))
		{
			return fragment;
		}
		for(var i = 0; i < nodes.length; i++)
		{
			fragment.appendChild(nodes[i]);
		}

		return fragment;
	};

	/**
	 * @deprecated
	 * @use BX.style
	 * @param element
	 * @param opacity
	 */
	BX.setOpacity = function(element, opacity)
	{
		var opacityValue = parseFloat(opacity);

		if (!isNaN(opacityValue) && BX.type.isDomNode(element))
		{
			opacityValue = opacityValue < 1 ? opacityValue : opacityValue / 100;
			BX.style(element, 'opacity', opacityValue);
		}
	};

	/**
	 * @deprecated
	 * @param el
	 * @return {*}
	 */
	BX.hoverEvents = function(el)
	{
		if (el)
			return BX.adjust(el, {events: BX.hoverEvents()});
		else
			return {mouseover: BX.hoverEventsHover, mouseout: BX.hoverEventsHout};
	};

	/**
	 * @deprecated
	 */
	BX.hoverEventsHover = function(){BX.addClass(this,'bx-hover');this.BXHOVER=true;};
	/**
	 * @deprecated
	 */
	BX.hoverEventsHout = function(){BX.removeClass(this,'bx-hover');this.BXHOVER=false;};

	/**
	 * @deprecated
	 */
	BX.focusEvents = function(el)
	{
		if (el)
			return BX.adjust(el, {events: BX.focusEvents()});
		else
			return {mouseover: BX.focusEventsFocus, mouseout: BX.focusEventsBlur};
	};

	/**
	 * @deprecated
	 */
	BX.focusEventsFocus = function(){BX.addClass(this,'bx-focus');this.BXFOCUS=true;};
	/**
	 * @deprecated
	 */
	BX.focusEventsBlur = function(){BX.removeClass(this,'bx-focus');this.BXFOCUS=false;};

	BX.setUnselectable = function(node)
	{
		BX.style(node, {
			'userSelect': 'none',
			'MozUserSelect': 'none',
			'WebkitUserSelect': 'none',
			'KhtmlUserSelect': 'none',
		});
		node.setAttribute('unSelectable', 'on');
	};

	BX.setSelectable = function(node)
	{
		BX.style(node, {
			'userSelect': null,
			'MozUserSelect': null,
			'WebkitUserSelect': null,
			'KhtmlUserSelect': null,
		});
		node.removeAttribute('unSelectable');
	};

	BX.styleIEPropertyName = function(name)
	{
		if (name == 'float')
			name = BX.browser.IsIE() ? 'styleFloat' : 'cssFloat';
		else
		{
			var res = BX.browser.isPropertySupported(name);
			if (res)
			{
				name = res;
			}
			else
			{
				var reg = /(\-([a-z]){1})/g;
				if (reg.test(name))
				{
					name = name.replace(reg, function () {return arguments[2].toUpperCase();});
				}
			}
		}
		return name;
	};

	BX.focus = function(el)
	{
		try
		{
			el.focus();
			return true;
		}
		catch (e)
		{
			return false;
		}
	};

	BX.firstChild = function(el)
	{
		return BX.type.isDomNode(el) ? el.firstElementChild : null;
	};

	BX.lastChild = function(el)
	{
		return BX.type.isDomNode(el) ? el.lastElementChild : null;
	};

	BX.previousSibling = function(el)
	{
		return BX.type.isDomNode(el) ? el.previousElementSibling : null;
	};

	BX.nextSibling = function(el)
	{
		return BX.type.isDomNode(el) ? el.nextElementSibling : null;
	};

	/*
		params: {
			obj : html node
			className : className value
			recursive : used only for older browsers to optimize the tree traversal, in new browsers the search is always recursively, default - true
		}

		Search all nodes with className
	*/
	/**
	 * @deprecated
	 * @use .querySelectorAll
	 * @param obj
	 * @param className
	 * @param recursive
	 * @return {*}
	 */
	BX.findChildrenByClassName = function(obj, className, recursive)
	{
		if(!obj || !obj.childNodes) return null;

		var result = [];
		if (typeof(obj.getElementsByClassName) == 'undefined')
		{
			recursive = recursive !== false;
			result = BX.findChildren(obj, {className : className}, recursive);
		}
		else
		{
			var col = obj.getElementsByClassName(className);
			for (i=0,l=col.length;i<l;i++)
			{
				result[i] = col[i];
			}
		}
		return result;
	};

	/*
		params: {
			obj : html node
			className : className value
			recursive : used only for older browsers to optimize the tree traversal, in new browsers the search is always recursively, default - true
		}

		Search first node with className
	*/
	/**
	 * @deprecated
	 * @use .querySelector
	 * @param obj
	 * @param className
	 * @param recursive
	 * @return {*}
	 */
	BX.findChildByClassName = function(obj, className, recursive)
	{
		if(!obj || !obj.childNodes) return null;

		var result = null;
		if (typeof(obj.getElementsByClassName) == 'undefined')
		{
			recursive = recursive !== false;
			result = BX.findChild(obj, {className : className}, recursive);
		}
		else
		{
			var col = obj.getElementsByClassName(className);
			if (col && typeof(col[0]) != 'undefined')
			{
				result = col[0];
			}
			else
			{
				result = null;
			}
		}
		return result;
	};

	/*
		params: {
			tagName|tag : 'tagName',
			className|class : 'className',
			attribute : {attribute : value, attribute : value} | attribute | [attribute, attribute....],
			property : {prop: value, prop: value} | prop | [prop, prop]
		}

		all values can be RegExps or strings
	*/
	/**
	 * @deprecated
	 * @use .querySelectorAll
	 * @param obj
	 * @param params
	 * @param recursive
	 * @return {*|Node}
	 */
	BX.findChildren = function(obj, params, recursive)
	{
		return BX.findChild(obj, params, recursive, true);
	};

	/**
	 * @deprecated
	 * @use .querySelectorAll
	 * @param obj
	 * @param params
	 * @param recursive
	 * @param get_all
	 * @return {*}
	 */
	BX.findChild = function(obj, params, recursive, get_all)
	{
		if(!obj || !obj.childNodes) return null;

		recursive = !!recursive; get_all = !!get_all;

		var n = obj.childNodes.length, result = [];

		for (var j=0; j<n; j++)
		{
			var child = obj.childNodes[j];

			if (_checkNode(child, params))
			{
				if (get_all)
					result.push(child);
				else
					return child;
			}

			if(recursive == true)
			{
				var res = BX.findChild(child, params, recursive, get_all);
				if (res)
				{
					if (get_all)
						result = BX.util.array_merge(result, res);
					else
						return res;
				}
			}
		}

		if (get_all || result.length > 0)
			return result;
		else
			return null;
	};

	/**
	 * @deprecated
	 * @use .closest()
	 * @param obj
	 * @param params
	 * @param maxParent
	 * @return {*}
	 */
	BX.findParent = function(obj, params, maxParent)
	{
		if(!obj)
			return null;

		var o = obj;
		while(o.parentNode)
		{
			var parent = o.parentNode;

			if (_checkNode(parent, params))
				return parent;

			o = parent;

			if (!!maxParent &&
				(BX.type.isFunction(maxParent)
					|| typeof maxParent == 'object'))
			{
				if (BX.type.isElementNode(maxParent))
				{
					if (o == maxParent)
						break;
				}
				else
				{
					if (_checkNode(o, maxParent))
						break;
				}
			}
		}
		return null;
	};

	/**
	 * @deprecated
	 * @use .querySelector
	 * @param obj
	 * @param params
	 * @return {*}
	 */
	BX.findNextSibling = function(obj, params)
	{
		if(!obj)
			return null;
		var o = obj;
		while(o.nextSibling)
		{
			var sibling = o.nextSibling;
			if (_checkNode(sibling, params))
				return sibling;
			o = sibling;
		}
		return null;
	};

	/**
	 * @deprecated
	 * @use .querySelector
	 * @param obj
	 * @param params
	 * @return {*}
	 */
	BX.findPreviousSibling = function(obj, params)
	{
		if(!obj)
			return null;

		var o = obj;
		while(o.previousSibling)
		{
			var sibling = o.previousSibling;
			if(_checkNode(sibling, params))
				return sibling;
			o = sibling;
		}
		return null;
	};

	BX.checkNode = function(obj, params)
	{
		return _checkNode(obj, params);
	};

	/**
	 * @deprecated
	 * @use .querySelectorAll
	 * @param form
	 * @return {Array}
	 */
	BX.findFormElements = function(form)
	{
		if (BX.type.isString(form))
			form = document.forms[form]||BX(form);

		var res = [];

		if (BX.type.isElementNode(form))
		{
			if (form.tagName.toUpperCase() == 'FORM')
			{
				res = form.elements;
			}
			else
			{
				res = BX.findChildren(form, CHECK_FORM_ELEMENTS, true);
			}
		}

		return res;
	};

	/**
	 * @deprecated
	 * @use .contains()
	 * @param whichNode
	 * @param forNode
	 * @return {boolean}
	 */
	BX.isParentForNode = function(whichNode, forNode)
	{
		if (BX.type.isDomNode(whichNode) && BX.type.isDomNode(forNode))
		{
			return whichNode.contains(forNode);
		}

		return false;
	};

	BX.getCaretPosition = function(node)
	{
		var pos = 0;

		if(node.selectionStart || node.selectionStart == 0)
		{
			pos = node.selectionStart;
		}
		else if(document.selection)
		{
			node.focus();
			var selection = document.selection.createRange();
			selection.moveStart('character', -node.value.length);
			pos = selection.text.length;
		}

		return (pos);
	};

	BX.setCaretPosition = function(node, pos)
	{
		if(!BX.isNodeInDom(node) || BX.isNodeHidden(node) || node.disabled)
		{
			return;
		}

		if(node.setSelectionRange)
		{
			node.focus();
			node.setSelectionRange(pos, pos);
		}
		else if(node.createTextRange)
		{
			var range = node.createTextRange();
			range.collapse(true);
			range.moveEnd('character', pos);
			range.moveStart('character', pos);
			range.select();
		}
	};

	// access private. use BX.mergeEx instead.
	// todo: refactor BX.merge, make it work through BX.mergeEx
	BX.merge = function(){
		var arg = Array.prototype.slice.call(arguments);

		if(arg.length < 2)
			return {};

		var result = arg.shift();

		for(var i = 0; i < arg.length; i++)
		{
			for(var k in arg[i]){

				if(typeof arg[i] == 'undefined' || arg[i] == null)
					continue;

				if(arg[i].hasOwnProperty(k)){

					if(typeof arg[i][k] == 'undefined' || arg[i][k] == null)
						continue;

					if(typeof arg[i][k] == 'object' && !BX.type.isDomNode(arg[i][k]) && (typeof arg[i][k]['isUIWidget'] == 'undefined')){

						// go deeper

						var isArray = 'length' in arg[i][k];

						if(typeof result[k] != 'object')
							result[k] = isArray ? [] : {};

						if(isArray)
							BX.util.array_merge(result[k], arg[i][k]);
						else
							BX.merge(result[k], arg[i][k]);

					}else
						result[k] = arg[i][k];
				}
			}
		}

		return result;
	};

	BX.mergeEx = function()
	{
		var arg = Array.prototype.slice.call(arguments);
		if(arg.length < 2)
		{
			return {};
		}

		var result = arg.shift();
		for (var i = 0; i < arg.length; i++)
		{
			for (var k in arg[i])
			{
				if (typeof arg[i] == "undefined" || arg[i] == null || !arg[i].hasOwnProperty(k))
				{
					continue;
				}

				if (BX.type.isPlainObject(arg[i][k]) && BX.type.isPlainObject(result[k]))
				{
					BX.mergeEx(result[k], arg[i][k]);
				}
				else
				{
					result[k] = BX.type.isPlainObject(arg[i][k]) ? BX.clone(arg[i][k]) : arg[i][k];
				}
			}
		}

		return result;
	};

	BX.getEventButton = function(e)
	{
		e = e || window.event;

		var flags = 0;

		if (typeof e.which != 'undefined')
		{
			switch (e.which)
			{
				case 1: flags = flags|BX.MSLEFT; break;
				case 2: flags = flags|BX.MSMIDDLE; break;
				case 3: flags = flags|BX.MSRIGHT; break;
			}
		}
		else if (typeof e.button != 'undefined')
		{
			flags = event.button;
		}

		return flags || BX.MSLEFT;
	};

	var captured_events = null, _bind = null;
	BX.CaptureEvents = function(el_c, evname_c)
	{
		if (_bind)
			return;

		_bind = BX.bind;
		captured_events = [];

		BX.bind = function(el, evname, func)
		{
			if (el === el_c && evname === evname_c)
				captured_events.push(func);

			_bind.apply(this, arguments);
		}
	};

	BX.CaptureEventsGet = function()
	{
		if (_bind)
		{
			BX.bind = _bind;

			var captured = captured_events;

			_bind = null;
			captured_events = null;
			return captured;
		}
		return null;
	};

	// Don't even try to use it for submit event!
	BX.fireEvent = function(ob,ev)
	{
		var result = false, e = null;
		if (BX.type.isDomNode(ob))
		{
			result = true;
			if (document.createEventObject)
			{
				// IE
				if (eventTypes[ev] != 'MouseEvent')
				{
					e = document.createEventObject();
					e.type = ev;
					result = ob.fireEvent('on' + ev, e);
				}

				if (ob[ev])
				{
					ob[ev]();
				}
			}
			else
			{
				// non-IE
				e = null;

				switch (eventTypes[ev])
				{
					case 'MouseEvent':
						e = document.createEvent('MouseEvent');
						try
						{
							e.initMouseEvent(ev, true, true, top, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, null);
						}
						catch (initException)
						{
							e.initMouseEvent(ev, true, true, window, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, null);
						}

					break;
					default:
						e = document.createEvent('Event');
						e.initEvent(ev, true, true);
				}

				result = ob.dispatchEvent(e);
			}
		}

		return result;
	};

	BX.getWheelData = function(e)
	{
		e = e || window.event;
		e.wheelData = e.detail ? e.detail * -1 : e.wheelDelta / 40;
		return e.wheelData;
	};

	BX.proxy_context = null;

	BX.delegate = function (func, thisObject)
	{
		if (!func || !thisObject)
			return func;

		return function() {
			var cur = BX.proxy_context;
			BX.proxy_context = this;
			var res = func.apply(thisObject, arguments);
			BX.proxy_context = cur;
			return res;
		}
	};

	BX.delegateLater = function (func_name, thisObject, contextObject)
	{
		return function()
		{
			if (thisObject[func_name])
			{
				var cur = BX.proxy_context;
				BX.proxy_context = this;
				var res = thisObject[func_name].apply(contextObject||thisObject, arguments);
				BX.proxy_context = cur;
				return res;
			}
			return null;
		}
	};

	BX.proxy = function(func, thisObject)
	{
		return getObjectDelegate(func, thisObject, proxyList);
	};

	BX.defer = function(func, thisObject)
	{
		if (!!thisObject)
			return BX.defer_proxy(func, thisObject);
		else
			return function() {
				var arg = arguments;
				setTimeout(function(){func.apply(this,arg)}, 10);
			};
	};

	BX.defer_proxy = function(func, thisObject)
	{
		return getObjectDelegate(func, thisObject, deferList, BX.defer);
	};

	/**
	 *
	 * @private
	 */
	function getObjectDelegate(func, thisObject, collection, decorator)
	{
		if (!BX.type.isFunction(func) || !BX.type.isMapKey(thisObject))
		{
			return func;
		}

		var objectDelegates = collection.get(thisObject);
		if (!objectDelegates)
		{
			objectDelegates = new WeakMap();
			collection.set(thisObject, objectDelegates);
		}

		var delegate = objectDelegates.get(func);
		if (!delegate)
		{
			delegate = decorator ? decorator(BX.delegate(func, thisObject)) : BX.delegate(func, thisObject);
			objectDelegates.set(func, delegate);
		}

		return delegate;
	}

	BX.once = function(el, evname, func)
	{
		var fn = function()
		{
			BX.unbind(el, evname, fn);
			func.apply(this, arguments);
		};

		return fn;
	};

	BX.bindDelegate = function (elem, eventName, isTarget, handler)
	{
		var h = BX.delegateEvent(isTarget, handler);
		BX.bind(elem, eventName, h);
		return h;
	};

	BX.delegateEvent = function(isTarget, handler)
	{
		return function(e)
		{
			e = e || window.event;
			var target = e.target || e.srcElement;

			while (target != this)
			{
				if (_checkNode(target, isTarget))
				{
					return handler.call(target, e);
				}
				if (target && target.parentNode)
					target = target.parentNode;
				else
					break;
			}
			return null;
		}
	};

	BX.False = function() {return false;};
	BX.DoNothing = function() {};

	// TODO: also check event handlers set via BX.bind()
	BX.denyEvent = function(el, ev)
	{
		deniedEvents.push([el, ev, el['on' + ev]]);
		el['on' + ev] = BX.DoNothing;
	};

	BX.allowEvent = function(el, ev)
	{
		for(var i=0, len=deniedEvents.length; i<len; i++)
		{
			if (deniedEvents[i][0] == el && deniedEvents[i][1] == ev)
			{
				el['on' + ev] = deniedEvents[i][2];
				BX.util.deleteFromArray(deniedEvents, i);
				return;
			}
		}
	};

	BX.fixEventPageXY = function(event)
	{
		BX.fixEventPageX(event);
		BX.fixEventPageY(event);
		return event;
	};

	BX.fixEventPageX = function(event)
	{
		if (event.pageX == null && event.clientX != null)
		{
			event.pageX =
				event.clientX +
				(document.documentElement && document.documentElement.scrollLeft || document.body && document.body.scrollLeft || 0) -
				(document.documentElement.clientLeft || 0);
		}

		return event;
	};

	BX.fixEventPageY = function(event)
	{
		if (event.pageY == null && event.clientY != null)
		{
			event.pageY =
				event.clientY +
				(document.documentElement && document.documentElement.scrollTop || document.body && document.body.scrollTop || 0) -
				(document.documentElement.clientTop || 0);
		}

		return event;
	};

	/**
	 * @deprecated
	 * @see e.preventDefault()
	 */
	BX.PreventDefault = function(e)
	{
		if(!e) e = window.event;
		if(e.stopPropagation)
		{
			e.preventDefault();
			e.stopPropagation();
		}
		else
		{
			e.cancelBubble = true;
			e.returnValue = false;
		}
		return false;
	};

	/**
	 * @deprecated
	 * @see e.preventDefault();
	 *
	 * @param e
	 * @return {boolean}
	 */
	BX.eventReturnFalse = function(e)
	{
		e=e||window.event;
		if (e && e.preventDefault) e.preventDefault();
		else e.returnValue = false;
		return false;
	};

	/**
	 * @deprecated
	 * @see e.stopPropagation()
	 * @param e
	 */
	BX.eventCancelBubble = function(e)
	{
		e=e||window.event;
		if(e && e.stopPropagation)
			e.stopPropagation();
		else
			e.cancelBubble = true;
	};

	BX.bindDebouncedChange = function(node, fn, fnInstant, timeout, ctx)
	{
		ctx = ctx || window;
		timeout = timeout || 300;

		var dataTag = 'bx-dc-previous-value';
		BX.data(node, dataTag, node.value);

		var act = function(fn, val){

			var pVal = BX.data(node, dataTag);

			if(typeof pVal == 'undefined' || pVal != val){
				if(typeof ctx != 'object')
					fn(val);
				else
					fn.apply(ctx, [val]);
			}
		};

		var actD = BX.debounce(function(){
			var val = node.value;
			act(fn, val);
			BX.data(node, dataTag, val);
		}, timeout);

		BX.bind(node, 'keyup', actD);
		BX.bind(node, 'change', actD);
		BX.bind(node, 'input', actD);

		if(BX.type.isFunction(fnInstant)){

			var actI = function(){
				act(fnInstant, node.value);
			};

			BX.bind(node, 'keyup', actI);
			BX.bind(node, 'change', actI);
			BX.bind(node, 'input', actI);
		}
	};

	BX.parseJSON = function(data, context)
	{
		var result = null;
		if (BX.type.isNotEmptyString(data))
		{
			try {
				if (data.indexOf("\n") >= 0)
					eval('result = ' + data);
				else
					result = (new Function("return " + data))();
			} catch(e) {
				BX.onCustomEvent(context, 'onParseJSONFailure', [data, context])
			}
		}
		else if(BX.type.isPlainObject(data))
		{
			return data;
		}

		return result;
	};

	BX.submit = function(obForm, action_name, action_value, onAfterSubmit)
	{
		action_name = action_name || 'save';
		if (!obForm['BXFormSubmit_' + action_name])
		{
			obForm['BXFormSubmit_' + action_name] = obForm.appendChild(BX.create('INPUT', {
				'props': {
					'type': 'submit',
					'name': action_name,
					'value': action_value || 'Y'
				},
				'style': {
					'display': 'none'
				}
			}));
		}

		if (obForm.sessid)
			obForm.sessid.value = BX.bitrix_sessid();

		setTimeout(BX.delegate(function() {BX.fireEvent(this, 'click'); if (onAfterSubmit) onAfterSubmit();}, obForm['BXFormSubmit_' + action_name]), 10);
	};

	BX.show = function(ob, displayType)
	{
		if (ob.BXDISPLAY || !_checkDisplay(ob, displayType))
		{
			ob.style.display = ob.BXDISPLAY;
		}
	};

	BX.hide = function(ob, displayType)
	{
		if (!ob.BXDISPLAY)
			_checkDisplay(ob, displayType);

		ob.style.display = 'none';
	};

	BX.toggle = function(ob, values)
	{
		if (!values && BX.type.isElementNode(ob))
		{
			var bShow = true;
			if (ob.BXDISPLAY)
				bShow = !_checkDisplay(ob);
			else
				bShow = ob.style.display == 'none';

			if (bShow)
				BX.show(ob);
			else
				BX.hide(ob);
		}
		else if (BX.type.isArray(values))
		{
			for (var i=0,len=values.length; i<len; i++)
			{
				if (ob == values[i])
				{
					ob = values[i==len-1 ? 0 : i+1];
					break;
				}
			}
			if (i==len)
				ob = values[0];
		}

		return ob;
	};

	function _checkDisplay(ob, displayType)
	{
		if (typeof displayType != 'undefined')
			ob.BXDISPLAY = displayType;

		var d = ob.style.display || BX.style(ob, 'display');
		if (d != 'none')
		{
			ob.BXDISPLAY = ob.BXDISPLAY || d;
			return true;
		}
		else
		{
			ob.BXDISPLAY = ob.BXDISPLAY || 'block';
			return false;
		}
	}

	/* some useful util functions */

	BX.util = {
		/**
		 * @deprecated
		 * @use [].filter(value => !BX.Type.isNil(value))
		 * @param ar
		 * @return {*}
		 */
		array_values: function(ar)
		{
			if (!BX.type.isArray(ar))
				return BX.util._array_values_ob(ar);
			var arv = [];
			for(var i=0,l=ar.length;i<l;i++)
				if (ar[i] !== null && typeof ar[i] != 'undefined')
					arv.push(ar[i]);
			return arv;
		},

		/**
		 * @deprecated
		 * @use Object.values([]).filter(value => !BX.Type.isNil(value))
		 * @param ar
		 * @return {Array}
		 * @private
		 */
		_array_values_ob: function(ar)
		{
			var arv = [];
			for(var i in ar)
				if (ar[i] !== null && typeof ar[i] != 'undefined')
					arv.push(ar[i]);
			return arv;
		},

		/**
		 * @deprecated
		 * @use
		 * @param ar
		 * @return {*}
		 */
		array_keys: function(ar)
		{
			if (!BX.type.isArray(ar))
				return BX.util._array_keys_ob(ar);
			var arv = [];
			for(var i=0,l=ar.length;i<l;i++)
				if (ar[i] !== null && typeof ar[i] != 'undefined')
					arv.push(i);
			return arv;
		},

		_array_keys_ob: function(ar)
		{
			var arv = [];
			for(var i in ar)
				if (ar[i] !== null && typeof ar[i] != 'undefined')
					arv.push(i);
			return arv;
		},

		object_keys: function(obj)
		{
			var arv = [];
			for(var k in obj)
			{
				if(obj.hasOwnProperty(k))
				{
					arv.push(k);
				}
			}
			return arv;
		},

		/**
		 * @deprecated
		 * @use firstArr.concat(secondArr);
		 * @param first
		 * @param second
		 * @return {*[]}
		 */
		array_merge: function(first, second)
		{
			if (!BX.type.isArray(first)) first = [];
			if (!BX.type.isArray(second)) second = [];

			var i = first.length, j = 0;

			if (typeof second.length === "number")
			{
				for (var l = second.length; j < l; j++)
				{
					first[i++] = second[j];
				}
			}
			else
			{
				while (second[j] !== undefined)
				{
					first[i++] = second[j++];
				}
			}

			first.length = i;

			return first;
		},

		array_flip: function (object)
		{
			var newObject = {};

			for (var key in object)
			{
				newObject[object[key]] = key;
			}

			return newObject;
		},

		array_diff: function(ar1, ar2, hash)
		{
			hash = BX.type.isFunction(hash) ? hash : null;
			var i, length, v, h, map = {}, result = [];
			for(i = 0, length = ar2.length; i < length; i++)
			{
				v = ar2[i];
				h = hash ? hash(v) : v;
				map[h] = true;
			}

			for(i = 0, length = ar1.length; i < length; i++)
			{
				v = ar1[i];
				h = hash ? hash(v) : v;
				if(typeof(map[h]) === "undefined")
				{
					result.push(v);
				}
			}
			return result;
		},

		/**
		 * @deprecated
		 * @use Set
		 */
		array_unique: function(ar)
		{
			var i=0,j,len=ar.length;
			if(len<2) return ar;

			for (; i<len-1;i++)
			{
				for (j=i+1; j<len;j++)
				{
					if (ar[i]==ar[j])
					{
						ar.splice(j--,1); len--;
					}
				}
			}

			return ar;
		},

		/**
		 * @deprecated
		 * @use myArr.includes(needle)
		 */
		in_array: function(needle, haystack)
		{
			for(var i=0; i<haystack.length; i++)
			{
				if(haystack[i] == needle)
					return true;
			}
			return false;
		},

		/**
		 * @deprecated
		 * @use myArr.findIndex(item => item === needle);
		 */
		array_search: function(needle, haystack)
		{
			for(var i=0; i<haystack.length; i++)
			{
				if(haystack[i] == needle)
					return i;
			}
			return -1;
		},

		object_search_key: function(needle, haystack)
		{
			if (typeof haystack[needle] != 'undefined')
				return haystack[needle];

			for(var i in haystack)
			{
				if (typeof haystack[i] == "object")
				{
					var result = BX.util.object_search_key(needle, haystack[i]);
					if (result !== false)
						return result;
				}
			}
			return false;
		},

		trim: function(s)
		{
			if (BX.type.isString(s))
			{
				return s.trim();
			}

			return s;
		},

		urlencode: function(s){return encodeURIComponent(s);},

		// it may also be useful. via sVD.
		deleteFromArray: function(ar, ind) {return ar.slice(0, ind).concat(ar.slice(ind + 1));},
		insertIntoArray: function(ar, ind, el) {return ar.slice(0, ind).concat([el]).concat(ar.slice(ind));},

		htmlspecialchars: function(str)
		{
			return BX.Text.encode(str);
		},

		htmlspecialcharsback: function(str)
		{
			return BX.Text.decode(str);
		},

		// Quote regular expression characters plus an optional character
		preg_quote: function(str, delimiter)
		{
			if(!str.replace)
				return str;
			return str.replace(new RegExp('[.\\\\+*?\\[\\^\\]$(){}=!<>|:\\' + (delimiter || '') + '-]', 'g'), '\\$&');
		},

		jsencode: function(str)
		{
			if (!str || !str.replace)
				return str;

			var escapes =
				[
					{ c: "\\\\", r: "\\\\" }, // should be first
					{ c: "\\t", r: "\\t" },
					{ c: "\\n", r: "\\n" },
					{ c: "\\r", r: "\\r" },
					{ c: "\"", r: "\\\"" },
					{ c: "'", r: "\\'" },
					{ c: "<", r: "\\x3C" },
					{ c: ">", r: "\\x3E" },
					{ c: "\\u2028", r: "\\u2028" },
					{ c: "\\u2029", r: "\\u2029" }
				];
			for (var i = 0; i < escapes.length; i++)
				str = str.replace(new RegExp(escapes[i].c, 'g'), escapes[i].r);
			return str;
		},

		getCssName: function(jsName)
		{
			if (!BX.type.isNotEmptyString(jsName))
			{
				return "";
			}

			return jsName.replace(/[A-Z]/g, function(match) {
				return "-" + match.toLowerCase();
			});
		},

		getJsName: function(cssName)
		{
			var regex = /\-([a-z]){1}/g;
			if (regex.test(cssName))
			{
				return cssName.replace(regex, function(match, letter) {
					return letter.toUpperCase();
				});
			}

			return cssName;
		},

		nl2br: function(str)
		{
			if (!str || !str.replace)
				return str;

			return str.replace(/([^>])\n/g, '$1<br/>');
		},

		/**
		 * @deprecated
		 * @use .padStart() / .padEnd()
		 * @param input
		 * @param pad_length
		 * @param pad_string
		 * @param pad_type
		 * @return {*}
		 */
		str_pad: function(input, pad_length, pad_string, pad_type)
		{
			pad_string = pad_string || ' ';
			pad_type = pad_type || 'right';
			input = input.toString();

			if (pad_type === 'left')
			{
				return BX.util.str_pad_left(input, pad_length, pad_string);
			}

			return BX.util.str_pad_right(input, pad_length, pad_string);
		},

		str_pad_left: function(input, pad_length, pad_string)
		{
			return input.toString().padStart(pad_length, pad_string);
		},

		str_pad_right: function(input, pad_length, pad_string)
		{
			return input.toString().padEnd(pad_length, pad_string);
		},

		strip_tags: function(str)
		{
			return str.split(/<[^>]+>/g).join('');
		},

		strip_php_tags: function(str)
		{
			return str.replace(/<\?(.|[\r\n])*?\?>/g, '');
		},

		popup: function(url, width, height)
		{
			var w, h;
			if(BX.browser.IsOpera())
			{
				w = document.body.offsetWidth;
				h = document.body.offsetHeight;
			}
			else
			{
				w = screen.width;
				h = screen.height;
			}
			return window.open(url, '', 'status=no,scrollbars=yes,resizable=yes,width='+width+',height='+height+',top='+Math.floor((h - height)/2-14)+',left='+Math.floor((w - width)/2-5));
		},

		shuffle: function(array)
		{
			var temporaryValue, randomIndex;
			var currentIndex = array.length;

			while (0 !== currentIndex)
			{
				randomIndex = Math.floor(Math.random() * currentIndex);
				currentIndex -= 1;

				temporaryValue = array[currentIndex];
				array[currentIndex] = array[randomIndex];
				array[randomIndex] = temporaryValue;
			}

			return array;
		},

		// BX.util.objectSort(object, sortBy, sortDir) - Sort object by property
		// function params: 1 - object for sort, 2 - sort by property, 3 - sort direction (asc/desc)
		// return: sort array [[objectElement], [objectElement]] in sortDir direction

		// example: BX.util.objectSort({'L1': {'name': 'Last'}, 'F1': {'name': 'First'}}, 'name', 'asc');
		// return: [{'name' : 'First'}, {'name' : 'Last'}]
		objectSort: function(object, sortBy, sortDir)
		{
			sortDir = sortDir == 'asc'? 'asc': 'desc';

			var arItems = [], i;
			for (i in object)
			{
				if (object.hasOwnProperty(i) && object[i][sortBy])
				{
					arItems.push([i, object[i][sortBy]]);
				}
			}

			if (sortDir == 'asc')
			{
				arItems.sort(function(i, ii) {
					var s1, s2;
					if (BX.type.isDate(i[1]))
					{
						s1 = i[1].getTime();
					}
					else if (!isNaN(i[1]))
					{
						s1 = parseInt(i[1]);
					}
					else
					{
						s1 = i[1].toString().toLowerCase();
					}

					if (BX.type.isDate(ii[1]))
					{
						s2 = ii[1].getTime();
					}
					else if (!isNaN(ii[1]))
					{
						s2 = parseInt(ii[1]);
					}
					else
					{
						s2 = ii[1].toString().toLowerCase();
					}

					if (s1 > s2)
						return 1;
					else if (s1 < s2)
						return -1;
					else
						return 0;
				});
			}
			else
			{
				arItems.sort(function(i, ii) {
					var s1, s2;
					if (BX.type.isDate(i[1]))
					{
						s1 = i[1].getTime();
					}
					else if (!isNaN(i[1]))
					{
						s1 = parseInt(i[1]);
					}
					else
					{
						s1 = i[1].toString().toLowerCase();
					}

					if (BX.type.isDate(ii[1]))
					{
						s2 = ii[1].getTime();
					}
					else if (!isNaN(ii[1]))
					{
						s2 = parseInt(ii[1]);
					}
					else
					{
						s2 = ii[1].toString().toLowerCase();
					}

					if (s1 < s2)
						return 1;
					else if (s1 > s2)
						return -1;
					else
						return 0;
				});
			}

			var arReturnArray = Array();
			for (i = 0; i < arItems.length; i++)
			{
				arReturnArray.push(object[arItems[i][0]]);
			}

			return arReturnArray;
		},

		objectMerge: function()
		{
			return BX.mergeEx.apply(window, arguments);
		},

		objectClone : function(object)
		{
			return BX.clone(object, true);
		},

		// #fdf9e5 => {r=253, g=249, b=229}
		hex2rgb: function(color)
		{
			var rgb = color.replace(/[# ]/g,"").replace(/^(.)(.)(.)$/,'$1$1$2$2$3$3').match(/.{2}/g);
			for (var i=0;  i<3; i++)
			{
				rgb[i] = parseInt(rgb[i], 16);
			}
			return {'r':rgb[0],'g':rgb[1],'b':rgb[2]};
		},

		/**
		 * @deprecated
		 * @use BX.Uri
		 * @param url
		 * @param param
		 * @return {string}
		 */
		remove_url_param: function(url, param)
		{
			return BX.Uri.removeParam(url, param);
		},

		/*
		{'param1': 'value1', 'param2': 'value2'}
		 */
		/**
		 * @deprecated
		 * @use BX.Uri
		 * @param url
		 * @param params
		 * @return {string}
		 */
		add_url_param: function(url, params)
		{
			var preparedParams = Object.entries(params).reduce(function(acc, item) {
				acc[item[0]] = BX.type.isArray(item[1]) ? item[1].join() : item[1];
				return acc;
			}, {});

			return BX.Uri.addParam(url, preparedParams);
		},

		/*
	{'param1': 'value1', 'param2': 'value2'}
	 */
		buildQueryString: function(params)
		{
			var result = '';
			for (var key in params)
			{
				var value = params[key];
				if(BX.type.isArray(value))
				{
					value.forEach(function(valueElement, index)
					{
						result += encodeURIComponent(key + "[" + index + "]") + "=" + encodeURIComponent(valueElement) + "&";
					});
				}
				else
				{
					result += encodeURIComponent(key) + "=" + encodeURIComponent(value) + "&";
				}
			}

			if(result.length > 0)
			{
				result = result.substr(0, result.length - 1);
			}
			return result;
		},

		even: function(digit)
		{
			return (parseInt(digit) % 2 == 0);
		},

		hashCode: function(str)
		{
			if(!BX.type.isNotEmptyString(str))
			{
				return 0;
			}

			var hash = 0;
			for (var i = 0; i < str.length; i++)
			{
				var c = str.charCodeAt(i);
				hash = ((hash << 5) - hash) + c;
				hash = hash & hash;
			}
			return hash;
		},

		getRandomString: function (length)
		{
			return BX.Text.getRandom(length);
		},

		number_format: function(number, decimals, dec_point, thousands_sep)
		{
			var i, j, kw, kd, km, sign = '';
			decimals = Math.abs(decimals);
			if (isNaN(decimals) || decimals < 0)
			{
				decimals = 2;
			}
			dec_point = dec_point || ',';
			if (typeof thousands_sep === 'undefined')
				thousands_sep = '.';

			number = (+number || 0).toFixed(decimals);
			if (number < 0)
			{
				sign = '-';
				number = -number;
			}

			i = parseInt(number, 10) + '';
			j = (i.length > 3 ? i.length % 3 : 0);

			km = (j ? i.substr(0, j) + thousands_sep : '');
			kw = i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + thousands_sep);
			kd = (decimals ? dec_point + Math.abs(number - i).toFixed(decimals).replace(/-/, '0').slice(2) : '');

			return sign + km + kw + kd;
		},

		getExtension: function (url)
		{
			url = url || "";
			var items = url.split("?")[0].split(".");
			return items[items.length-1].toLowerCase();
		},
		addObjectToForm: function(object, form, prefix)
		{
			if(!BX.type.isString(prefix))
			{
				prefix = "";
			}

			for(var key in object)
			{
				if(!object.hasOwnProperty(key))
				{
					continue;
				}

				var value = object[key];
				var name = prefix !== "" ? (prefix + "[" + key + "]") : key;
				if(BX.type.isArray(value))
				{
					var obj = {};
					for(var i = 0; i < value.length; i++)
					{
						obj[i] = value[i];
					}

					BX.util.addObjectToForm(obj, form, name);
				}
				else if(BX.type.isPlainObject(value))
				{
					BX.util.addObjectToForm(value, form, name);
				}
				else
				{
					value = BX.type.isFunction(value.toString) ? value.toString() : "";
					if(value !== "")
					{
						form.appendChild(BX.create("INPUT", { attrs: { type: "hidden", name: name, value: value } }));
					}
				}
			}
		},

		observe: function(object, enable)
		{
			console.error('BX.util.observe: function is no longer supported by browser.');
			return false;
		},

		escapeRegExp: function(str)
		{
			return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
		}
	};

	BX.validation = {
		checkIfEmail: function(s)
		{
			var atom = "[=a-z0-9_+~'!$&*^`|#%/?{}-]";
			return (new RegExp('^\\s*'+atom+'+(\\.'+atom+'+)*@([a-z0-9-]+\\.)+[a-z0-9-]{2,20}\\s*$', 'i')).test(s);
		},
		checkIfPhone: function(s)
		{
			var regexp = new RegExp(
				typeof(BX.PhoneNumber) === "undefined"
					? BX.PhoneNumber.getValidNumberPattern()
					: '^\\s*\\+?\s*[0-9(-)\\s]+\\s*$',
				'i'
			);
			return regexp.test(s);
		}
	};

	BX.prop =
		{
			get: function(object, key, defaultValue)
			{
				return object && object.hasOwnProperty(key) ? object[key] : defaultValue;
			},
			getObject: function(object, key, defaultValue)
			{
				return object && BX.type.isPlainObject(object[key]) ? object[key] : defaultValue;
			},
			getElementNode: function(object, key, defaultValue)
			{
				return object && BX.type.isElementNode(object[key]) ? object[key] : defaultValue;
			},
			getArray: function(object, key, defaultValue)
			{
				return object && BX.type.isArray(object[key]) ? object[key] : defaultValue;
			},
			getFunction: function(object, key, defaultValue)
			{
				return object && BX.type.isFunction(object[key]) ? object[key] : defaultValue;
			},
			getNumber: function(object, key, defaultValue)
			{
				if(!(object && object.hasOwnProperty(key)))
				{
					return defaultValue;
				}

				var value = object[key];
				if(BX.type.isNumber(value))
				{
					return value;
				}

				value = parseFloat(value);
				return !isNaN(value) ? value : defaultValue;
			},
			getInteger: function(object, key, defaultValue)
			{
				if(!(object && object.hasOwnProperty(key)))
				{
					return defaultValue;
				}

				var value = object[key];
				if(BX.type.isNumber(value))
				{
					return value;
				}

				value = parseInt(value);
				return !isNaN(value) ? value : defaultValue;
			},
			getBoolean: function(object, key, defaultValue)
			{
				if(!(object && object.hasOwnProperty(key)))
				{
					return defaultValue;
				}

				var value = object[key];
				return (BX.type.isBoolean(value)
						? value
						: (BX.type.isString(value) ? (value.toLowerCase() === "true") : !!value)
				);
			},
			getString: function(object, key, defaultValue)
			{
				if(!(object && object.hasOwnProperty(key)))
				{
					return defaultValue;
				}

				var value = object[key];
				return BX.type.isString(value) ? value : (value ? value.toString() : '');
			},
			extractDate: function(datetime)
			{
				if(!BX.type.isDate(datetime))
				{
					datetime = new Date();
				}

				datetime.setHours(0);
				datetime.setMinutes(0);
				datetime.setSeconds(0);
				datetime.setMilliseconds(0);

				return datetime;
			}
		};

	BX.isNodeInDom = function(node, doc)
	{
		return node === (doc || document) ? true :
			(node.parentNode ? BX.isNodeInDom(node.parentNode) : false);
	};

	BX.isNodeHidden = function(node)
	{
		if (node === document)
			return false;
		else if (BX.style(node, 'display') == 'none')
			return true;
		else
			return (node.parentNode ? BX.isNodeHidden(node.parentNode) : true);
	};

	BX.evalPack = function(code)
	{
		while (code.length > 0)
		{
			var c = code.shift();

			if (c.TYPE == 'SCRIPT_EXT' || c.TYPE == 'SCRIPT_SRC')
			{
				BX.loadScript(c.DATA, function() {BX.evalPack(code)});
				return;
			}
			else if (c.TYPE == 'SCRIPT')
			{
				BX.evalGlobal(c.DATA);
			}
		}
	};

	BX.evalGlobal = function(data)
	{
		if (data)
		{
			var head = document.getElementsByTagName("head")[0] || document.documentElement,
				script = document.createElement("script");

			script.type = "text/javascript";

			if (!BX.browser.IsIE())
			{
				script.appendChild(document.createTextNode(data));
			}
			else
			{
				script.text = data;
			}

			head.insertBefore(script, head.firstChild);
			head.removeChild(script);
		}
	};

	BX.garbage = function(call, thisObject)
	{
		garbageCollectors.push({callback: call, context: thisObject});
	};

	BX.GetDocElement = function (pDoc)
	{
		pDoc = pDoc || document;
		return (BX.browser.IsDoctype(pDoc) ? pDoc.documentElement : pDoc.body);
	};

	BX.scrollTop = function(node, val){
		if(typeof val != 'undefined'){

			if(node == window){
				throw new Error('scrollTop() for window is not implemented');
			}else
				node.scrollTop = parseInt(val);

		}else{

			if(node == window)
				return BX.GetWindowScrollPos().scrollTop;

			return node.scrollTop;
		}
	};

	BX.scrollLeft = function(node, val){
		if(typeof val != 'undefined'){

			if(node == window){
				throw new Error('scrollLeft() for window is not implemented');
			}else
				node.scrollLeft = parseInt(val);

		}else{

			if(node == window)
				return BX.GetWindowScrollPos().scrollLeft;

			return node.scrollLeft;
		}
	};

	BX.hide_object = function(ob)
	{
		ob = BX(ob);
		ob.style.position = 'absolute';
		ob.style.top = '-1000px';
		ob.style.left = '-1000px';
		ob.style.height = '10px';
		ob.style.width = '10px';
	};

	BX.is_relative = function(el)
	{
		var p = BX.style(el, 'position');
		return p == 'relative' || p == 'absolute';
	};

	BX.is_float = function(el)
	{
		var p = BX.style(el, 'float');
		return p == 'right' || p == 'left';
	};

	BX.is_fixed = function(el)
	{
		var p = BX.style(el, 'position');
		return p == 'fixed';
	};

	BX.width = function(node, val){
		if(typeof val != 'undefined')
			BX.style(node, 'width', parseInt(val)+'px');
		else{

			if(node == window)
				return window.innerWidth;

			//return parseInt(BX.style(node, 'width'));
			return BX.pos(node).width;
		}
	};

	BX.height = function(node, val){
		if(typeof val != 'undefined')
			BX.style(node, 'height', parseInt(val)+'px');
		else{

			if(node == window)
				return window.innerHeight;

			//return parseInt(BX.style(node, 'height'));
			return BX.pos(node).height;
		}
	};

	BX.align = function(pos, w, h, type)
	{
		if (type)
			type = type.toLowerCase();
		else
			type = '';

		var pDoc = document;
		if (BX.type.isElementNode(pos))
		{
			pDoc = pos.ownerDocument;
			pos = BX.pos(pos);
		}

		var x = pos["left"], y = pos["bottom"];

		var scroll = BX.GetWindowScrollPos(pDoc);
		var size = BX.GetWindowInnerSize(pDoc);

		if((size.innerWidth + scroll.scrollLeft) - (pos["left"] + w) < 0)
		{
			if(pos["right"] - w >= 0 )
				x = pos["right"] - w;
			else
				x = scroll.scrollLeft;
		}

		if(((size.innerHeight + scroll.scrollTop) - (pos["bottom"] + h) < 0) || ~type.indexOf('top'))
		{
			if(pos["top"] - h >= 0 || ~type.indexOf('top'))
				y = pos["top"] - h;
			else
				y = scroll.scrollTop;
		}

		return {'left':x, 'top':y};
	};

	BX.scrollToNode = function(node)
	{
		var obNode = BX(node);

		if (obNode.scrollIntoView)
			obNode.scrollIntoView(true);
		else
		{
			var arNodePos = BX.pos(obNode);
			window.scrollTo(arNodePos.left, arNodePos.top);
		}
	};

	/* non-xhr loadings */
	BX.showWait = function(node, msg)
	{
		node = BX(node) || document.body || document.documentElement;
		msg = msg || BX.message('JS_CORE_LOADING');

		var container_id = node.id || Math.random();

		var obMsg = node.bxmsg = document.body.appendChild(BX.create('DIV', {
			props: {
				id: 'wait_' + container_id
			},
			style: {
				background: 'url("/bitrix/js/main/core/images/wait.gif") no-repeat scroll 10px center #fcf7d1',
				border: '1px solid #E1B52D',
				color: 'black',
				fontFamily: 'Verdana,Arial,sans-serif',
				fontSize: '11px',
				padding: '10px 30px 10px 37px',
				position: 'absolute',
				zIndex:'10000',
				textAlign:'center'
			},
			text: msg
		}));

		setTimeout(BX.delegate(_adjustWait, node), 10);

		lastWait[lastWait.length] = obMsg;
		return obMsg;
	};

	BX.closeWait = function(node, obMsg)
	{
		if(node && !obMsg)
			obMsg = node.bxmsg;
		if(node && !obMsg && BX.hasClass(node, 'bx-core-waitwindow'))
			obMsg = node;
		if(node && !obMsg)
			obMsg = BX('wait_' + node.id);
		if(!obMsg)
			obMsg = lastWait.pop();

		if (obMsg && obMsg.parentNode)
		{
			for (var i=0,len=lastWait.length;i<len;i++)
			{
				if (obMsg == lastWait[i])
				{
					lastWait = BX.util.deleteFromArray(lastWait, i);
					break;
				}
			}

			obMsg.parentNode.removeChild(obMsg);
			if (node) node.bxmsg = null;
			BX.cleanNode(obMsg, true);
		}
	};

	BX.setJSList = function(scripts)
	{
		if (BX.type.isArray(scripts))
		{
			scripts = scripts.map(function(script) {
				return normalizeUrl(script)
			});

			jsList = jsList.concat(scripts);
		}
	};

	BX.getJSList = function()
	{
		initJsList();
		return jsList;
	};

	BX.setCSSList = function(cssFiles)
	{
		if (BX.type.isArray(cssFiles))
		{
			cssFiles = cssFiles.map(function(cssFile) {
				return normalizeUrl(cssFile);
			});

			cssList = cssList.concat(cssFiles);
		}
	};

	BX.getCSSList = function()
	{
		initCssList();
		return cssList;
	};

	BX.getJSPath = function(js)
	{
		return js.replace(/^(http[s]*:)*\/\/[^\/]+/i, '');
	};

	BX.getCSSPath = function(css)
	{
		return css.replace(/^(http[s]*:)*\/\/[^\/]+/i, '');
	};

	BX.getCDNPath = function(path)
	{
		return path;
	};

	BX.loadScript = function(script, callback, doc)
	{
		if (BX.type.isString(script))
		{
			script = [script];
		}

		return BX.load(script, callback, doc);
	};

	BX.loadCSS = function(css, doc, win)
	{
		if (BX.type.isString(css))
		{
			css = [css];
		}

		if (BX.type.isArray(css))
		{
			css = css.map(function(url) {
				return { url: url, ext: "css" }
			});

			BX.load(css, null, doc);
		}
	};

	BX.load = function(items, callback, doc)
	{
		if (!BX.isReady)
		{
			var _args = arguments;
			BX.ready(function() {
				BX.load.apply(this, _args);
			});
			return null;
		}

		doc = doc || document;
		if (isAsync === null)
		{
			isAsync = "async" in doc.createElement("script") || "MozAppearance" in doc.documentElement.style || window.opera;
		}

		return isAsync ? loadAsync(items, callback, doc) : loadAsyncEmulation(items, callback, doc);
	};

	BX.convert =
		{
			toNumber: function(value)
			{
				if(BX.type.isNumber(value))
				{
					return value;
				}

				value = Number(value);
				return !isNaN(value) ? value : 0;
			},
			nodeListToArray: function(nodes)
			{
				try
				{
					return (Array.prototype.slice.call(nodes, 0));
				}
				catch (ex)
				{
					var ary = [];
					for(var i = 0, l = nodes.length; i < l; i++)
					{
						ary.push(nodes[i]);
					}
					return ary;
				}
			}
		};

	function loadAsync(items, callback, doc)
	{
		if (!BX.type.isArray(items))
		{
			return;
		}

		function allLoaded(items)
		{
			items = items || assets;
			for (var name in items)
			{
				if (items.hasOwnProperty(name) && items[name].state !== LOADED)
				{
					return false;
				}
			}

			return true;
		}

		if (!BX.type.isFunction(callback))
		{
			callback = null;
		}

		var itemSet = {}, item, i;
		for (i = 0; i < items.length; i++)
		{
			item = items[i];
			item = getAsset(item);
			itemSet[item.name] = item;
		}

		var callbackWasCalled = false;
		if (items.length > 0)
		{
			for (i = 0; i < items.length; i++)
			{
				item = items[i];
				item = getAsset(item);
				load(item, function () {
					if (allLoaded(itemSet))
					{
						if (!callbackWasCalled)
						{
							callback && callback();
							callbackWasCalled = true;
						}

					}
				}, doc);
			}
		}
		else
		{
			if (typeof callback === 'function')
			{
				callback();
				callbackWasCalled = true;
			}
		}
	}

	function loadAsyncEmulation(items, callback, doc)
	{
		function onPreload(asset)
		{
			asset.state = PRELOADED;
			if (BX.type.isArray(asset.onpreload) && asset.onpreload)
			{
				for (var i = 0; i < asset.onpreload.length; i++)
				{
					asset.onpreload[i].call();
				}
			}
		}

		function preLoad(asset)
		{
			if (asset.state === undefined)
			{
				asset.state = PRELOADING;
				asset.onpreload = [];

				loadAsset(
					{ url: asset.url, type: "cache", ext: asset.ext},
					function () { onPreload(asset); },
					doc
				);
			}
		}

		if (!BX.type.isArray(items))
		{
			return;
		}

		if (!BX.type.isFunction(callback))
		{
			callback = null;
		}

		var rest = [].slice.call(items, 1);
		for (var i = 0; i < rest.length; i++)
		{
			preLoad(getAsset(rest[i]));
		}

		load(getAsset(items[0]), items.length === 1 ? callback : function () {
			loadAsyncEmulation.apply(null, [rest, callback, doc]);
		}, doc);
	}

	function load(asset, callback, doc)
	{
		callback = callback || BX.DoNothing;

		if (asset.state === LOADED)
		{
			callback();
			return;
		}

		if (asset.state === PRELOADING)
		{
			asset.onpreload.push(function () {
				load(asset, callback, doc);
			});
			return;
		}

		asset.state = LOADING;

		loadAsset(
			asset,
			function () {
				asset.state = LOADED;
				callback();
			},
			doc
		);
	}

	function loadAsset(asset, callback, doc)
	{
		callback = callback || BX.DoNothing;

		function error(event)
		{
			ele.onload = ele.onreadystatechange = ele.onerror = null;
			callback();
		}

		function process(event)
		{
			event = event || window.event;
			if (event.type === "load" || (/loaded|complete/.test(ele.readyState) && (!doc.documentMode || doc.documentMode < 9)))
			{
				window.clearTimeout(asset.errorTimeout);
				window.clearTimeout(asset.cssTimeout);
				ele.onload = ele.onreadystatechange = ele.onerror = null;
				callback();
			}
		}

		function isCssLoaded()
		{
			if (asset.state !== LOADED && asset.cssRetries <= 20)
			{
				for (var i = 0, l = doc.styleSheets.length; i < l; i++)
				{
					if (doc.styleSheets[i].href === ele.href)
					{
						process({"type": "load"});
						return;
					}
				}

				asset.cssRetries++;
				asset.cssTimeout = window.setTimeout(isCssLoaded, 250);
			}
		}

		var ele;
		var ext = BX.type.isNotEmptyString(asset.ext) ? asset.ext : BX.util.getExtension(asset.url);

		if (ext === "css")
		{
			ele = doc.createElement("link");
			ele.type = "text/" + (asset.type || "css");
			ele.rel = "stylesheet";
			ele.href = asset.url;

			asset.cssRetries = 0;
			asset.cssTimeout = window.setTimeout(isCssLoaded, 500);
		}
		else
		{
			ele = doc.createElement("script");
			ele.type = "text/" + (asset.type || "javascript");
			ele.src = asset.url;
		}

		ele.onload = ele.onreadystatechange = process;
		ele.onerror = error;

		ele.async = false;
		ele.defer = false;

		asset.errorTimeout = window.setTimeout(function () {
			error({type: "timeout"});
		}, 7000);

		if (ext === "css")
		{
			cssList.push(normalizeMinUrl(normalizeUrl(asset.url)));
		}
		else
		{
			jsList.push(normalizeMinUrl(normalizeUrl(asset.url)));
		}

		var templateLink = null;
		var head = doc.head || doc.getElementsByTagName("head")[0];
		if (ext === "css" && (templateLink = getTemplateLink(head)) !== null)
		{
			templateLink.parentNode.insertBefore(ele, templateLink);
		}
		else
		{
			head.insertBefore(ele, head.lastChild);
		}
	}

	function getAsset(item)
	{
		var asset = {};
		if (typeof item === "object")
		{
			asset = item;
			asset.name = asset.name ? asset.name : BX.util.hashCode(item.url);
		}
		else
		{
			asset = { name: BX.util.hashCode(item), url : item };
		}

		var ext = BX.type.isNotEmptyString(asset.ext) ? asset.ext : BX.util.getExtension(asset.url);
		if ((ext === "css" && isCssLoaded(asset.url)) || isScriptLoaded(asset.url))
		{
			asset.state = LOADED;
		}

		var existing = assets[asset.name];
		if (existing && existing.url === asset.url)
		{
			return existing;
		}

		assets[asset.name] = asset;
		return asset;
	}

	function normalizeUrl(url)
	{
		if (!BX.type.isNotEmptyString(url))
		{
			return "";
		}

		url = BX.getJSPath(url);
		url = url.replace(/\?[0-9]*$/, "");

		return url;
	}

	function normalizeMinUrl(url)
	{
		if (!BX.type.isNotEmptyString(url))
		{
			return "";
		}

		var minPos = url.indexOf(".min");
		return minPos >= 0 ? url.substr(0, minPos) + url.substr(minPos + 4) : url;
	}

	function isCssLoaded(fileSrc)
	{
		initCssList();

		fileSrc = normalizeUrl(fileSrc);
		var fileSrcMin = normalizeMinUrl(fileSrc);

		return (fileSrc !== fileSrcMin && BX.util.in_array(fileSrcMin, cssList)) || BX.util.in_array(fileSrc, cssList);
	}

	function initCssList()
	{
		if(!cssInit)
		{
			var linksCol = document.getElementsByTagName('link');

			if(!!linksCol && linksCol.length > 0)
			{
				for(var i = 0; i < linksCol.length; i++)
				{
					var href = linksCol[i].getAttribute('href');
					if (BX.type.isNotEmptyString(href))
					{
						href = normalizeMinUrl(normalizeUrl(href));
						cssList.push(href);
					}
				}
			}
			cssInit = true;
		}
	}

	function getTemplateLink(head)
	{
		var findLink = function(tag)
		{
			var links = head.getElementsByTagName(tag);
			for (var i = 0, length = links.length; i < length; i++)
			{
				var templateStyle = links[i].getAttribute("data-template-style");
				if (BX.type.isNotEmptyString(templateStyle) && templateStyle == "true")
				{
					return links[i];
				}
			}

			return null;
		};

		var link = findLink("link");
		if (link === null)
		{
			link = findLink("style");
		}

		return link;
	}

	function isScriptLoaded(fileSrc)
	{
		initJsList();

		fileSrc = normalizeUrl(fileSrc);
		var fileSrcMin = normalizeMinUrl(fileSrc);

		return (fileSrc !== fileSrcMin && BX.util.in_array(fileSrcMin, jsList)) || BX.util.in_array(fileSrc, jsList);
	}

	function initJsList()
	{
		if(!jsInit)
		{
			var scriptCol = document.getElementsByTagName('script');

			if(!!scriptCol && scriptCol.length > 0)
			{
				for(var i=0; i<scriptCol.length; i++)
				{
					var src = scriptCol[i].getAttribute('src');

					if (BX.type.isNotEmptyString(src))
					{
						src = normalizeMinUrl(normalizeUrl(src));
						jsList.push(src);
					}
				}
			}
			jsInit = true;
		}
	}

	BX.reload = function(back_url, bAddClearCache)
	{
		if (back_url === true)
		{
			bAddClearCache = true;
			back_url = null;
		}

		var new_href = back_url || top.location.href;

		var hashpos = new_href.indexOf('#'), hash = '';

		if (hashpos != -1)
		{
			hash = new_href.substr(hashpos);
			new_href = new_href.substr(0, hashpos);
		}

		if (bAddClearCache && new_href.indexOf('clear_cache=Y') < 0)
			new_href += (new_href.indexOf('?') == -1 ? '?' : '&') + 'clear_cache=Y';

		if (hash)
		{
			// hack for clearing cache in ajax mode components with history emulation
			if (bAddClearCache && (hash.substr(0, 5) == 'view/' || hash.substr(0, 6) == '#view/') && hash.indexOf('clear_cache%3DY') < 0)
				hash += (hash.indexOf('%3F') == -1 ? '%3F' : '%26') + 'clear_cache%3DY';

			new_href = new_href.replace(/(\?|\&)_r=[\d]*/, '');
			new_href += (new_href.indexOf('?') == -1 ? '?' : '&') + '_r='+Math.round(Math.random()*10000) + hash;
		}

		top.location.href = new_href;
	};

	BX.clearCache = function()
	{
		BX.showWait();
		BX.reload(true);
	};

	BX.template = function(tpl, callback, bKillTpl)
	{
		BX.ready(function() {
			_processTpl(BX(tpl), callback, bKillTpl);
		});
	};

	BX.isAmPmMode = function(returnConst)
	{
		if (returnConst === true)
		{
			return BX.message.AMPM_MODE;
		}
		return BX.message.AMPM_MODE !== false;
	};

	BX.formatDate = function(date, format)
	{
		date = date || new Date();

		var bTime = date.getHours() || date.getMinutes() || date.getSeconds(),
			str = !!format
				? format :
				(bTime ? BX.message('FORMAT_DATETIME') : BX.message('FORMAT_DATE')
				);

		return str.replace(/YYYY/ig, date.getFullYear())
			.replace(/MMMM/ig, BX.util.str_pad_left((date.getMonth()+1).toString(), 2, '0'))
			.replace(/MM/ig, BX.util.str_pad_left((date.getMonth()+1).toString(), 2, '0'))
			.replace(/DD/ig, BX.util.str_pad_left(date.getDate().toString(), 2, '0'))
			.replace(/HH/ig, BX.util.str_pad_left(date.getHours().toString(), 2, '0'))
			.replace(/MI/ig, BX.util.str_pad_left(date.getMinutes().toString(), 2, '0'))
			.replace(/SS/ig, BX.util.str_pad_left(date.getSeconds().toString(), 2, '0'));
	};
	BX.formatName = function(user, template, login)
	{
		user = user || {};
		template = (template || '');
		var replacement = {
			TITLE : (user["TITLE"] || ''),
			NAME : (user["NAME"] || ''),
			LAST_NAME : (user["LAST_NAME"] || ''),
			SECOND_NAME : (user["SECOND_NAME"] || ''),
			LOGIN : (user["LOGIN"] || ''),
			NAME_SHORT : user["NAME"] ? user["NAME"].substr(0, 1) + '.' : '',
			LAST_NAME_SHORT : user["LAST_NAME"] ? user["LAST_NAME"].substr(0, 1) + '.' : '',
			SECOND_NAME_SHORT : user["SECOND_NAME"] ? user["SECOND_NAME"].substr(0, 1) + '.' : '',
			EMAIL : (user["EMAIL"] || ''),
			ID : (user["ID"] || ''),
			NOBR : "",
			'/NOBR' : ""
		}, result = template;
		for (var ii in replacement)
		{
			if (replacement.hasOwnProperty(ii))
			{
				result = result.replace("#" + ii+ "#", replacement[ii])
			}
		}
		result = result.replace(/([\s]+)/gi, " ").trim();
		if (result == "")
		{
			result = (login == "Y" ? replacement["LOGIN"] : "");
			result = (result == "" ? "Noname" : result);
		}
		return result;
	};

	BX.getNumMonth = function(month)
	{
		var wordMonthCut = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
		var wordMonth = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

		var q = month.toUpperCase();
		for (i = 1; i <= 12; i++)
		{
			if (q == BX.message('MON_'+i).toUpperCase() || q == BX.message('MONTH_'+i).toUpperCase() || q == wordMonthCut[i-1].toUpperCase() || q == wordMonth[i-1].toUpperCase())
			{
				return i;
			}
		}
		return month;
	};

	BX.parseDate = function(str, bUTC, formatDate, formatDatetime)
	{
		if (BX.type.isNotEmptyString(str))
		{
			if (!formatDate)
				formatDate = BX.message('FORMAT_DATE');
			if (!formatDatetime)
				formatDatetime = BX.message('FORMAT_DATETIME');

			var regMonths = '';
			for (i = 1; i <= 12; i++)
			{
				regMonths = regMonths + '|' + BX.message('MON_'+i);
			}

			var expr = new RegExp('([0-9]+|[a-z]+' + regMonths + ')', 'ig');
			var aDate = str.match(expr),
				aFormat = formatDate.match(/(DD|MI|MMMM|MM|M|YYYY)/ig),
				i, cnt,
				aDateArgs=[], aFormatArgs=[],
				aResult={};

			if (!aDate)
				return null;

			if(aDate.length > aFormat.length)
			{
				aFormat = formatDatetime.match(/(DD|MI|MMMM|MM|M|YYYY|HH|H|SS|TT|T|GG|G)/ig);
			}

			for(i = 0, cnt = aDate.length; i < cnt; i++)
			{
				if(BX.util.trim(aDate[i]) != '')
				{
					aDateArgs[aDateArgs.length] = aDate[i];
				}
			}

			for(i = 0, cnt = aFormat.length; i < cnt; i++)
			{
				if(BX.util.trim(aFormat[i]) != '')
				{
					aFormatArgs[aFormatArgs.length] = aFormat[i];
				}
			}


			var m = BX.util.array_search('MMMM', aFormatArgs);
			if (m > 0)
			{
				aDateArgs[m] = BX.getNumMonth(aDateArgs[m]);
				aFormatArgs[m] = "MM";
			}
			else
			{
				m = BX.util.array_search('M', aFormatArgs);
				if (m > 0)
				{
					aDateArgs[m] = BX.getNumMonth(aDateArgs[m]);
					aFormatArgs[m] = "MM";
				}
			}

			for(i = 0, cnt = aFormatArgs.length; i < cnt; i++)
			{
				var k = aFormatArgs[i].toUpperCase();
				aResult[k] = k == 'T' || k == 'TT' ? aDateArgs[i] : parseInt(aDateArgs[i], 10);
			}

			if(aResult['DD'] > 0 && aResult['MM'] > 0 && aResult['YYYY'] > 0)
			{
				var d = new Date();

				if(bUTC)
				{
					d.setUTCDate(1);
					d.setUTCFullYear(aResult['YYYY']);
					d.setUTCMonth(aResult['MM'] - 1);
					d.setUTCDate(aResult['DD']);
					d.setUTCHours(0, 0, 0, 0);
				}
				else
				{
					d.setDate(1);
					d.setFullYear(aResult['YYYY']);
					d.setMonth(aResult['MM'] - 1);
					d.setDate(aResult['DD']);
					d.setHours(0, 0, 0, 0);
				}

				if(
					(!isNaN(aResult['HH']) || !isNaN(aResult['GG']) || !isNaN(aResult['H']) || !isNaN(aResult['G']))
					&& !isNaN(aResult['MI'])
				)
				{
					if (!isNaN(aResult['H']) || !isNaN(aResult['G']))
					{
						var bPM = (aResult['T']||aResult['TT']||'am').toUpperCase()=='PM';
						var h = parseInt(aResult['H']||aResult['G']||0, 10);
						if(bPM)
						{
							aResult['HH'] = h + (h == 12 ? 0 : 12);
						}
						else
						{
							aResult['HH'] = h < 12 ? h : 0;
						}
					}
					else
					{
						aResult['HH'] = parseInt(aResult['HH']||aResult['GG']||0, 10);
					}

					if (isNaN(aResult['SS']))
						aResult['SS'] = 0;

					if(bUTC)
					{
						d.setUTCHours(aResult['HH'], aResult['MI'], aResult['SS']);
					}
					else
					{
						d.setHours(aResult['HH'], aResult['MI'], aResult['SS']);
					}
				}

				return d;
			}
		}

		return null;
	};

	BX.selectUtils =
		{
			addNewOption: function(oSelect, opt_value, opt_name, do_sort, check_unique)
			{
				oSelect = BX(oSelect);
				if(oSelect)
				{
					var n = oSelect.length;
					if(check_unique !== false)
					{
						for(var i=0;i<n;i++)
						{
							if(oSelect[i].value==opt_value)
							{
								return;
							}
						}
					}

					oSelect.options[n] = new Option(opt_name, opt_value, false, false);
				}

				if(do_sort === true)
				{
					this.sortSelect(oSelect);
				}
			},

			deleteOption: function(oSelect, opt_value)
			{
				oSelect = BX(oSelect);
				if(oSelect)
				{
					for(var i=0;i<oSelect.length;i++)
					{
						if(oSelect[i].value==opt_value)
						{
							oSelect.remove(i);
							break;
						}
					}
				}
			},

			deleteSelectedOptions: function(oSelect)
			{
				oSelect = BX(oSelect);
				if(oSelect)
				{
					var i=0;
					while(i<oSelect.length)
					{
						if(oSelect[i].selected)
						{
							oSelect[i].selected=false;
							oSelect.remove(i);
						}
						else
						{
							i++;
						}
					}
				}
			},

			deleteAllOptions: function(oSelect)
			{
				oSelect = BX(oSelect);
				if(oSelect)
				{
					for(var i=oSelect.length-1; i>=0; i--)
					{
						oSelect.remove(i);
					}
				}
			},

			optionCompare: function(record1, record2)
			{
				var value1 = record1.optText.toLowerCase();
				var value2 = record2.optText.toLowerCase();
				if (value1 > value2) return(1);
				if (value1 < value2) return(-1);
				return(0);
			},

			sortSelect: function(oSelect)
			{
				oSelect = BX(oSelect);
				if(oSelect)
				{
					var myOptions = [];
					var n = oSelect.options.length;
					var i;
					for (i=0;i<n;i++)
					{
						myOptions[i] = {
							optText:oSelect[i].text,
							optValue:oSelect[i].value
						};
					}
					myOptions.sort(this.optionCompare);
					oSelect.length=0;
					n = myOptions.length;
					for(i=0;i<n;i++)
					{
						oSelect[i] = new Option(myOptions[i].optText, myOptions[i].optValue, false, false);
					}
				}
			},

			selectAllOptions: function(oSelect)
			{
				oSelect = BX(oSelect);
				if(oSelect)
				{
					var n = oSelect.length;
					for(var i=0;i<n;i++)
					{
						oSelect[i].selected=true;
					}
				}
			},

			selectOption: function(oSelect, opt_value)
			{
				oSelect = BX(oSelect);
				if(oSelect)
				{
					var n = oSelect.length;
					for(var i=0;i<n;i++)
					{
						oSelect[i].selected = (oSelect[i].value == opt_value);
					}
				}
			},

			addSelectedOptions: function(oSelect, to_select_id, check_unique, do_sort)
			{
				oSelect = BX(oSelect);
				if(!oSelect)
					return;
				var n = oSelect.length;
				for(var i=0; i<n; i++)
					if(oSelect[i].selected)
						this.addNewOption(to_select_id, oSelect[i].value, oSelect[i].text, do_sort, check_unique);
			},

			moveOptionsUp: function(oSelect)
			{
				oSelect = BX(oSelect);
				if(!oSelect)
					return;
				var n = oSelect.length;
				for(var i=0; i<n; i++)
				{
					if(oSelect[i].selected && i>0 && oSelect[i-1].selected == false)
					{
						var option = new Option(oSelect[i].text, oSelect[i].value);
						oSelect[i] = new Option(oSelect[i-1].text, oSelect[i-1].value);
						oSelect[i].selected = false;
						oSelect[i-1] = option;
						oSelect[i-1].selected = true;
					}
				}
			},

			moveOptionsDown: function(oSelect)
			{
				oSelect = BX(oSelect);
				if(!oSelect)
					return;
				var n = oSelect.length;
				for(var i=n-1; i>=0; i--)
				{
					if(oSelect[i].selected && i<n-1 && oSelect[i+1].selected == false)
					{
						var option = new Option(oSelect[i].text, oSelect[i].value);
						oSelect[i] = new Option(oSelect[i+1].text, oSelect[i+1].value);
						oSelect[i].selected = false;
						oSelect[i+1] = option;
						oSelect[i+1].selected = true;
					}
				}
			}
		};

	BX.getEventTarget = function(e)
	{
		if(e.target)
		{
			return e.target;
		}
		else if(e.srcElement)
		{
			return e.srcElement;
		}
		return null;
	};

	/******* HINT ***************/
// if function has 2 params - the 2nd one is hint html. otherwise hint_html is third and hint_title - 2nd;
// '<div onmouseover="BX.hint(this, 'This is &lt;b&gt;Hint&lt;/b&gt;')"'>;
// BX.hint(el, 'This is <b>Hint</b>') - this won't work, use constructor
	BX.hint = function(el, hint_title, hint_html, hint_id)
	{
		if (null == hint_html)
		{
			hint_html = hint_title;
			hint_title = '';
		}

		if (null == el.BXHINT)
		{
			el.BXHINT = new BX.CHint({
				parent: el, hint: hint_html, title: hint_title, id: hint_id
			});
			el.BXHINT.Show();
		}
	};

	BX.hint_replace = function(el, hint_title, hint_html)
	{
		if (null == hint_html)
		{
			hint_html = hint_title;
			hint_title = '';
		}

		if (!el || !el.parentNode || !hint_html)
			return null;

		var obHint = new BX.CHint({
			hint: hint_html,
			title: hint_title
		});

		obHint.CreateParent();

		el.parentNode.insertBefore(obHint.PARENT, el);
		el.parentNode.removeChild(el);

		obHint.PARENT.style.marginLeft = '5px';

		return el;
	};

	BX.CHint = function(params)
	{
		this.PARENT = BX(params.parent);

		this.HINT = params.hint;
		this.HINT_TITLE = params.title;

		this.PARAMS = {};
		for (var i in this.defaultSettings)
		{
			if (null == params[i])
				this.PARAMS[i] = this.defaultSettings[i];
			else
				this.PARAMS[i] = params[i];
		}

		if (null != params.id)
			this.ID = params.id;

		this.timer = null;
		this.bInited = false;
		this.msover = true;

		if (this.PARAMS.showOnce)
		{
			this.__show();
			this.msover = false;
			this.timer = setTimeout(BX.proxy(this.__hide, this), this.PARAMS.hide_timeout);
		}
		else if (this.PARENT)
		{
			BX.bind(this.PARENT, 'mouseover', BX.proxy(this.Show, this));
			BX.bind(this.PARENT, 'mouseout', BX.proxy(this.Hide, this));
		}
	};

	BX.CHint.openHints = new Set();

	BX.CHint.globalDisabled = false;

	BX.CHint.handleMenuOpen = function() {
		BX.CHint.globalDisabled = true;

		BX.CHint.openHints.forEach(function(hint) {
			hint.__hide_immediately();
		});
	};

	BX.CHint.handleMenuClose = function() {
		BX.CHint.globalDisabled = false;
	};

	BX.addCustomEvent('onMenuOpen', BX.CHint.handleMenuOpen);
	BX.addCustomEvent('onMenuClose', BX.CHint.handleMenuClose);

	BX.CHint.prototype.defaultSettings = {
		show_timeout: 1000,
		hide_timeout: 500,
		dx: 2,
		showOnce: false,
		preventHide: true,
		min_width: 250
	};

	BX.CHint.prototype.CreateParent = function(element, params)
	{
		if (this.PARENT)
		{
			BX.unbind(this.PARENT, 'mouseover', BX.proxy(this.Show, this));
			BX.unbind(this.PARENT, 'mouseout', BX.proxy(this.Hide, this));
		}

		if (!params) params = {};
		var type = 'icon';

		if (params.type && (params.type == "link" || params.type == "icon"))
			type = params.type;

		if (element)
			type = "element";

		if (type == "icon")
		{
			element = BX.create('IMG', {
				props: {
					src: params.iconSrc
						? params.iconSrc
						: "/bitrix/js/main/core/images/hint.gif"
				}
			});
		}
		else if (type == "link")
		{
			element = BX.create("A", {
				props: {href: 'javascript:void(0)'},
				html: '[?]'
			});
		}

		this.PARENT = element;

		BX.bind(this.PARENT, 'mouseover', BX.proxy(this.Show, this));
		BX.bind(this.PARENT, 'mouseout', BX.proxy(this.Hide, this));

		return this.PARENT;
	};

	BX.CHint.prototype.Show = function()
	{
		this.msover = true;

		if (null != this.timer)
			clearTimeout(this.timer);

		this.timer = setTimeout(BX.proxy(this.__show, this), this.PARAMS.show_timeout);
	};

	BX.CHint.prototype.Hide = function()
	{
		this.msover = false;

		if (null != this.timer)
			clearTimeout(this.timer);

		this.timer = setTimeout(BX.proxy(this.__hide, this), this.PARAMS.hide_timeout);
	};

	BX.CHint.prototype.__show = function()
	{
		if (!this.msover || this.disabled || BX.CHint.globalDisabled) return;
		if (!this.bInited) this.Init();

		if (this.prepareAdjustPos())
		{
			this.DIV.style.display = 'block';
			this.adjustPos();

			BX.CHint.openHints.add(this);

			BX.bind(window, 'scroll', BX.proxy(this.__onscroll, this));

			if (this.PARAMS.showOnce)
			{
				this.timer = setTimeout(BX.proxy(this.__hide, this), this.PARAMS.hide_timeout);
			}
		}
	};

	BX.CHint.prototype.__onscroll = function()
	{
		if (!BX.admin || !BX.admin.panel || !BX.admin.panel.isFixed()) return;

		if (this.scrollTimer) clearTimeout(this.scrollTimer);

		this.DIV.style.display = 'none';
		this.scrollTimer = setTimeout(BX.proxy(this.Reopen, this), this.PARAMS.show_timeout);
	};

	BX.CHint.prototype.Reopen = function()
	{
		if (null != this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(BX.proxy(this.__show, this), 50);
	};

	BX.CHint.prototype.__hide = function()
	{
		if (this.msover) return;
		if (!this.bInited) return;

		BX.unbind(window, 'scroll', BX.proxy(this.Reopen, this));

		BX.CHint.openHints.delete(this);

		if (this.PARAMS.showOnce)
		{
			this.Destroy();
		}
		else
		{
			this.DIV.style.display = 'none';
		}
	};

	BX.CHint.prototype.__hide_immediately = function()
	{
		this.msover = false;
		this.__hide();
	};

	BX.CHint.prototype.Init = function()
	{
		this.DIV = document.body.appendChild(BX.create('DIV', {
			props: {className: 'bx-panel-tooltip'},
			style: {display: 'none'},
			children: [
				BX.create('DIV', {
					props: {className: 'bx-panel-tooltip-top-border'},
					html: '<div class="bx-panel-tooltip-corner bx-panel-tooltip-left-corner"></div><div class="bx-panel-tooltip-border"></div><div class="bx-panel-tooltip-corner bx-panel-tooltip-right-corner"></div>'
				}),
				(this.CONTENT = BX.create('DIV', {
					props: {className: 'bx-panel-tooltip-content'},
					children: [
						BX.create('DIV', {
							props: {className: 'bx-panel-tooltip-underlay'},
							children: [
								BX.create('DIV', {props: {className: 'bx-panel-tooltip-underlay-bg'}})
							]
						})
					]
				})),

				BX.create('DIV', {
					props: {className: 'bx-panel-tooltip-bottom-border'},
					html: '<div class="bx-panel-tooltip-corner bx-panel-tooltip-left-corner"></div><div class="bx-panel-tooltip-border"></div><div class="bx-panel-tooltip-corner bx-panel-tooltip-right-corner"></div>'
				})
			]
		}));

		if (this.ID)
		{
			this.CONTENT.insertBefore(BX.create('A', {
				attrs: {href: 'javascript:void(0)'},
				props: {className: 'bx-panel-tooltip-close'},
				events: {click: BX.delegate(this.Close, this)}
			}), this.CONTENT.firstChild)
		}

		if (this.HINT_TITLE)
		{
			this.CONTENT.appendChild(
				BX.create('DIV', {
					props: {className: 'bx-panel-tooltip-title'},
					text: this.HINT_TITLE
				})
			)
		}

		if (this.HINT)
		{
			this.CONTENT_TEXT = this.CONTENT.appendChild(BX.create('DIV', {props: {className: 'bx-panel-tooltip-text'}})).appendChild(BX.create('SPAN', {html: this.HINT}));
		}

		if (this.PARAMS.preventHide)
		{
			BX.bind(this.DIV, 'mouseout', BX.proxy(this.Hide, this));
			BX.bind(this.DIV, 'mouseover', BX.proxy(this.Show, this));
		}

		this.bInited = true;
	};

	BX.CHint.prototype.setContent = function(content)
	{
		this.HINT = content;

		if (this.CONTENT_TEXT)
			this.CONTENT_TEXT.innerHTML = this.HINT;
		else
			this.CONTENT_TEXT = this.CONTENT.appendChild(BX.create('DIV', {props: {className: 'bx-panel-tooltip-text'}})).appendChild(BX.create('SPAN', {html: this.HINT}));
	};

	BX.CHint.prototype.prepareAdjustPos = function()
	{
		this._wnd = {scrollPos: BX.GetWindowScrollPos(),scrollSize:BX.GetWindowScrollSize()};
		return BX.style(this.PARENT, 'display') != 'none';
	};

	BX.CHint.prototype.getAdjustPos = function()
	{
		var res = {}, pos = BX.pos(this.PARENT), min_top = 0;

		res.top = pos.bottom + this.PARAMS.dx;

		if (BX.admin && BX.admin.panel.DIV)
		{
			min_top = BX.admin.panel.DIV.offsetHeight + this.PARAMS.dx;

			if (BX.admin.panel.isFixed())
			{
				min_top += this._wnd.scrollPos.scrollTop;
			}
		}

		if (res.top < min_top)
			res.top = min_top;
		else
		{
			if (res.top + this.DIV.offsetHeight > this._wnd.scrollSize.scrollHeight)
				res.top = pos.top - this.PARAMS.dx - this.DIV.offsetHeight;
		}

		res.left = pos.left;
		if (pos.left < this.PARAMS.dx)
			pos.left = this.PARAMS.dx;
		else
		{
			var floatWidth = this.DIV.offsetWidth;

			var max_left = this._wnd.scrollSize.scrollWidth - floatWidth - this.PARAMS.dx;

			if (res.left > max_left)
				res.left = max_left;
		}

		return res;
	};

	BX.CHint.prototype.adjustWidth = function()
	{
		if (this.bWidthAdjusted) return;

		var w = this.DIV.offsetWidth, h = this.DIV.offsetHeight;

		if (w > this.PARAMS.min_width)
			w = Math.round(Math.sqrt(1.618*w*h));

		if (w < this.PARAMS.min_width)
			w = this.PARAMS.min_width;

		this.DIV.style.width = w + "px";

		if (this._adjustWidthInt)
			clearInterval(this._adjustWidthInt);
		this._adjustWidthInt = setInterval(BX.delegate(this._adjustWidthInterval, this), 5);

		this.bWidthAdjusted = true;
	};

	BX.CHint.prototype._adjustWidthInterval = function()
	{
		if (!this.DIV || this.DIV.style.display == 'none')
			clearInterval(this._adjustWidthInt);

		var
			dW = 20,
			maxWidth = 1500,
			w = this.DIV.offsetWidth,
			w1 = this.CONTENT_TEXT.offsetWidth;

		if (w > 0 && w1 > 0 && w - w1 < dW && w < maxWidth)
		{
			this.DIV.style.width = (w + dW) + "px";
			return;
		}

		clearInterval(this._adjustWidthInt);
	};

	BX.CHint.prototype.adjustPos = function()
	{
		this.adjustWidth();

		var pos = this.getAdjustPos();

		this.DIV.style.top = pos.top + 'px';
		this.DIV.style.left = pos.left + 'px';
	};

	BX.CHint.prototype.Close = function()
	{
		if (this.ID && BX.WindowManager)
			BX.WindowManager.saveWindowOptions(this.ID, {display: 'off'});
		this.__hide_immediately();
		this.Destroy();
	};

	BX.CHint.prototype.Destroy = function()
	{
		if (this.PARENT)
		{
			BX.unbind(this.PARENT, 'mouseover', BX.proxy(this.Show, this));
			BX.unbind(this.PARENT, 'mouseout', BX.proxy(this.Hide, this));
		}

		if (this.DIV)
		{
			BX.unbind(this.DIV, 'mouseover', BX.proxy(this.Show, this));
			BX.unbind(this.DIV, 'mouseout', BX.proxy(this.Hide, this));

			BX.cleanNode(this.DIV, true);
		}
	};

	BX.CHint.prototype.enable = function(){this.disabled = false;};
	BX.CHint.prototype.disable = function(){this.__hide_immediately(); this.disabled = true;};


	function _adjustWait()
	{
		if (!this.bxmsg) return;

		var arContainerPos = BX.pos(this),
			div_top = arContainerPos.top;

		if (div_top < BX.GetDocElement().scrollTop)
			div_top = BX.GetDocElement().scrollTop + 5;

		this.bxmsg.style.top = (div_top + 5) + 'px';

		if (this == BX.GetDocElement())
		{
			this.bxmsg.style.right = '5px';
		}
		else
		{
			this.bxmsg.style.left = (arContainerPos.right - this.bxmsg.offsetWidth - 5) + 'px';
		}
	}

	function _processTpl(tplNode, cb, bKillTpl)
	{
		if (tplNode)
		{
			if (bKillTpl)
				tplNode.parentNode.removeChild(tplNode);

			var res = {}, nodes = BX.findChildren(tplNode, {attribute: 'data-role'}, true);

			for (var i = 0, l = nodes.length; i < l; i++)
			{
				res[nodes[i].getAttribute('data-role')] = nodes[i];
			}

			cb.apply(tplNode, [res]);
		}
	}

	function _checkNode(obj, params)
	{
		params = params || {};

		if (BX.type.isFunction(params))
			return params.call(window, obj);

		if (!params.allowTextNodes && !BX.type.isElementNode(obj))
			return false;
		var i,j,len;
		for (i in params)
		{
			if(params.hasOwnProperty(i))
			{
				switch(i)
				{
					case 'tag':
					case 'tagName':
						if (BX.type.isString(params[i]))
						{
							if (obj.tagName.toUpperCase() != params[i].toUpperCase())
								return false;
						}
						else if (params[i] instanceof RegExp)
						{
							if (!params[i].test(obj.tagName))
								return false;
						}
						break;

					case 'class':
					case 'className':
						if (BX.type.isString(params[i]))
						{
							if (!BX.hasClass(obj, params[i]))
								return false;
						}
						else if (params[i] instanceof RegExp)
						{
							if (!BX.type.isString(obj.className) || !params[i].test(obj.className))
								return false;
						}
						break;

					case 'attr':
					case 'attrs':
					case 'attribute':
						if (BX.type.isString(params[i]))
						{
							if (!obj.getAttribute(params[i]))
								return false;
						}
						else if (BX.type.isArray(params[i]))
						{
							for (j = 0, len = params[i].length; j < len; j++)
							{
								if (params[i] && !obj.getAttribute(params[i]))
									return false;
							}
						}
						else
						{
							for (j in params[i])
							{
								if(params[i].hasOwnProperty(j))
								{
									var q = obj.getAttribute(j);
									if (params[i][j] instanceof RegExp)
									{
										if (!BX.type.isString(q) || !params[i][j].test(q))
										{
											return false;
										}
									}
									else
									{
										if (q != '' + params[i][j])
										{
											return false;
										}
									}
								}
							}
						}
						break;

					case 'property':
					case 'props':
						if (BX.type.isString(params[i]))
						{
							if (!obj[params[i]])
								return false;
						}
						else if (BX.type.isArray(params[i]))
						{
							for (j = 0, len = params[i].length; j < len; j++)
							{
								if (params[i] && !obj[params[i]])
									return false;
							}
						}
						else
						{
							for (j in params[i])
							{
								if (BX.type.isString(params[i][j]))
								{
									if (obj[j] != params[i][j])
										return false;
								}
								else if (params[i][j] instanceof RegExp)
								{
									if (!BX.type.isString(obj[j]) || !params[i][j].test(obj[j]))
										return false;
								}
							}
						}
						break;

					case 'callback':
						return params[i](obj);
				}
			}
		}

		return true;
	}

	/* garbage collector */
	function Trash()
	{
		var i,len;

		for (i = 0, len = garbageCollectors.length; i<len; i++)
		{
			try {
				garbageCollectors[i].callback.apply(garbageCollectors[i].context || window);
				delete garbageCollectors[i];
				garbageCollectors[i] = null;
			} catch (e) {}
		}
	}

	if(window.attachEvent) // IE
		window.attachEvent("onunload", Trash);
	else if(window.addEventListener) // Gecko / W3C
		window.addEventListener('unload', Trash, false);
	else
		window.onunload = Trash;
	/* \garbage collector */

// set empty ready handler
	BX(BX.DoNothing);
	window.BX = BX;

	BX.browser.addGlobalClass();

	/* data storage */
	BX.data = function(node, key, value)
	{
		if(typeof node == 'undefined')
			return undefined;

		if(typeof key == 'undefined')
			return undefined;

		if(typeof value != 'undefined')
		{
			// write to manager
			dataStorage.set(node, key, value);
		}
		else
		{
			var data;

			// from manager
			if((data = dataStorage.get(node, key)) != undefined)
			{
				return data;
			}
			else
			{
				// from attribute data-*
				if('getAttribute' in node)
				{
					data = node.getAttribute('data-'+key.toString());
					if(data === null)
					{
						return undefined;
					}
					return data;
				}
			}

			return undefined;
		}
	};

	BX.DataStorage = function()
	{

		this.keyOffset = 1;
		this.data = {};
		this.uniqueTag = 'BX-'+Math.random();

		this.resolve = function(owner, create){
			if(typeof owner[this.uniqueTag] == 'undefined')
				if(create)
				{
					try
					{
						Object.defineProperty(owner, this.uniqueTag, {
							value: this.keyOffset++
						});
					}
					catch(e)
					{
						owner[this.uniqueTag] = this.keyOffset++;
					}
				}
				else
					return undefined;

			return owner[this.uniqueTag];
		};
		this.get = function(owner, key){
			if((owner != document && !BX.type.isElementNode(owner)) || typeof key == 'undefined')
				return undefined;

			owner = this.resolve(owner, false);

			if(typeof owner == 'undefined' || typeof this.data[owner] == 'undefined')
				return undefined;

			return this.data[owner][key];
		};
		this.set = function(owner, key, value){

			if((owner != document && !BX.type.isElementNode(owner)) || typeof value == 'undefined')
				return;

			var o = this.resolve(owner, true);

			if(typeof this.data[o] == 'undefined')
				this.data[o] = {};

			this.data[o][key] = value;
		};
	};

// some internal variables for new logic
	var dataStorage = new BX.DataStorage();	// manager which BX.data() uses to keep data
})(window.BX);

;(function(window)
{
	/****************** ATTENTION *******************************
	 * Please do not use Bitrix CoreJS in this class.
	 * This class can be called on page without Bitrix Framework
	*************************************************************/

	if (!window.BX)
	{
		window.BX = {};
	}

	var BX = window.BX;

	BX.Promise = function(fn, ctx) // fn is future-reserved
	{
		this.state = null;
		this.value = null;
		this.reason = null;
		this.next = null;
		this.ctx = ctx || this;

		this.onFulfilled = [];
		this.onRejected = [];
	};
	BX.Promise.prototype.fulfill = function(value)
	{
		this.checkState();

		this.value = value;
		this.state = true;
		this.execute();
	};
	BX.Promise.prototype.reject = function(reason)
	{
		this.checkState();

		this.reason = reason;
		this.state = false;
		this.execute();
	};
	BX.Promise.prototype.then = function(onFulfilled, onRejected)
	{
		if(typeof (onFulfilled) == "function" || onFulfilled instanceof Function)
		{
			this.onFulfilled.push(onFulfilled);
		}
		if(typeof (onRejected) == "function" || onRejected instanceof Function)
		{
			this.onRejected.push(onRejected);
		}

		if(this.next === null)
		{
			this.next = new BX.Promise(null, this.ctx);
		}

		if(this.state !== null) // if promise was already resolved, execute immediately
		{
			this.execute();
		}

		return this.next;
	};

	BX.Promise.prototype.catch = function(onRejected)
	{
		if(typeof (onRejected) == "function" || onRejected instanceof Function)
		{
			this.onRejected.push(onRejected);
		}

		if(this.next === null)
		{
			this.next = new BX.Promise(null, this.ctx);
		}

		if(this.state !== null) // if promise was already resolved, execute immediately
		{
			this.execute();
		}

		return this.next;
	};

	BX.Promise.prototype.setAutoResolve = function(way, ms)
	{
		this.timer = setTimeout(function(){
			if(this.state === null)
			{
				this[way ? 'fulfill' : 'reject']();
			}
		}.bind(this), ms || 15);
	};
	BX.Promise.prototype.cancelAutoResolve = function()
	{
		clearTimeout(this.timer);
	};
	/**
	 * Resolve function. This function allows promise chaining, like ..then().then()...
	 * Typical usage:
	 *
	 * var p = new Promise();
	 *
	 * p.then(function(value){
	 *  return someValue; // next promise in the chain will be fulfilled with someValue
	 * }).then(function(value){
	 *
	 *  var p1 = new Promise();
	 *  *** some async code here, that eventually resolves p1 ***
	 *
	 *  return p1; // chain will resume when p1 resolved (fulfilled or rejected)
	 * }).then(function(value){
	 *
	 *  // you can also do
	 *  var e = new Error();
	 *  throw e;
	 *  // it will cause next promise to be rejected with e
	 *
	 *  return someOtherValue;
	 * }).then(function(value){
	 *  ...
	 * }, function(reason){
	 *  // promise was rejected with reason
	 * })...;
	 *
	 * p.fulfill('let`s start this chain');
	 *
	 * @param x
	 */
	BX.Promise.prototype.resolve = function(x)
	{
		var this_ = this;

		if(this === x)
		{
			this.reject(new TypeError('Promise cannot fulfill or reject itself')); // avoid recursion
		}
		// allow "pausing" promise chaining until promise x is fulfilled or rejected
		else if(x && x.toString() === "[object BX.Promise]")
		{
			x.then(function(value){
				this_.fulfill(value);
			}, function(reason){
				this_.reject(reason);
			});
		}
		else // auto-fulfill this promise
		{
			this.fulfill(x);
		}
	};

	BX.Promise.prototype.toString = function()
	{
		return "[object BX.Promise]";
	};

	BX.Promise.prototype.execute = function()
	{
		if(this.state === null)
		{
			//then() must not be called before BX.Promise resolve() happens
			return;
		}

		var value = undefined;
		var reason = undefined;
		var x = undefined;
		var k;
		if(this.state === true) // promise was fulfill()-ed
		{
			if(this.onFulfilled.length)
			{
				try
				{
					for(k = 0; k < this.onFulfilled.length; k++)
					{
						x = this.onFulfilled[k].apply(this.ctx, [this.value]);
						if(typeof x != 'undefined')
						{
							value = x;
						}
					}
				}
				catch(e)
				{
					if('console' in window)
					{
						console.dir(e);
					}

					if (typeof BX.debug !== 'undefined')
					{
						BX.debug(e);
					}

					reason = e; // reject next
				}
			}
			else
			{
				value = this.value; // resolve next
			}
		}
		else if(this.state === false) // promise was reject()-ed
		{
			if(this.onRejected.length)
			{
				try
				{
					for(k = 0; k < this.onRejected.length; k++)
					{
						x = this.onRejected[k].apply(this.ctx, [this.reason]);
						if(typeof x != 'undefined')
						{
							value = x;
						}
					}
				}
				catch(e)
				{
					if('console' in window)
					{
						console.dir(e);
					}

					if (typeof BX.debug !== 'undefined')
					{
						BX.debug(e);
					}

					reason = e; // reject next
				}
			}
			else
			{
				reason = this.reason; // reject next
			}
		}

		if(this.next !== null)
		{
			if(typeof reason != 'undefined')
			{
				this.next.reject(reason);
			}
			else if(typeof value != 'undefined')
			{
				this.next.resolve(value);
			}
		}
	};
	BX.Promise.prototype.checkState = function()
	{
		if(this.state !== null)
		{
			throw new Error('You can not do fulfill() or reject() multiple times');
		}
	};
})(window);



;(function(window){

if (window.BX.ajax)
	return;

var
	BX = window.BX,

	tempDefaultConfig = {},
	defaultConfig = {
		method: 'GET', // request method: GET|POST
		dataType: 'html', // type of data loading: html|json|script
		timeout: 0, // request timeout in seconds. 0 for browser-default
		async: true, // whether request is asynchronous or not
		processData: true, // any data processing is disabled if false, only callback call
		scriptsRunFirst: false, // whether to run _all_ found scripts before onsuccess call. script tag can have an attribute "bxrunfirst" to turn  this flag on only for itself
		emulateOnload: true,
		skipAuthCheck: false, // whether to check authorization failure (SHOUD be set to true for CORS requests)
		start: true, // send request immediately (if false, request can be started manually via XMLHttpRequest object returned)
		cache: true, // whether NOT to add random addition to URL
		preparePost: true, // whether set Content-Type x-www-form-urlencoded in POST
		headers: false, // add additional headers, example: [{'name': 'If-Modified-Since', 'value': 'Wed, 15 Aug 2012 08:59:08 GMT'}, {'name': 'If-None-Match', 'value': '0'}]
		lsTimeout: 30, //local storage data TTL. useless without lsId.
		lsForce: false //wheter to force query instead of using localStorage data. useless without lsId.
/*
other parameters:
	url: url to get/post
	data: data to post
	onsuccess: successful request callback. BX.proxy may be used.
	onfailure: request failure callback. BX.proxy may be used.
	onprogress: request progress callback. BX.proxy may be used.

	lsId: local storage id - for constantly updating queries which can communicate via localStorage. core_ls.js needed

any of the default parameters can be overridden. defaults can be changed by BX.ajax.Setup() - for all further requests!
*/
	},
	ajax_session = null,
	loadedScripts = {},
	loadedScriptsQueue = [],
	r = {
		'url_utf': /[^\034-\254]+/g,
		'script_self': /\/bitrix\/js\/main\/core\/core(_ajax)*.js$/i,
		'script_self_window': /\/bitrix\/js\/main\/core\/core_window.js$/i,
		'script_self_admin': /\/bitrix\/js\/main\/core\/core_admin.js$/i,
		'script_onload': /window.onload/g
	};

// low-level method
BX.ajax = function(config)
{
	var status, data;

	if (!config || !config.url || !BX.type.isString(config.url))
	{
		return false;
	}

	for (var i in tempDefaultConfig)
		if (typeof (config[i]) == "undefined") config[i] = tempDefaultConfig[i];

	tempDefaultConfig = {};

	for (i in defaultConfig)
		if (typeof (config[i]) == "undefined") config[i] = defaultConfig[i];

	config.method = config.method.toUpperCase();

	if (!BX.localStorage)
		config.lsId = null;

	if (BX.browser.IsIE())
	{
		var result = r.url_utf.exec(config.url);
		if (result)
		{
			do
			{
				config.url = config.url.replace(result, BX.util.urlencode(result));
				result = r.url_utf.exec(config.url);
			} while (result);
		}
	}

	if(config.dataType == 'json')
		config.emulateOnload = false;

	if (!config.cache && config.method == 'GET')
		config.url = BX.ajax._uncache(config.url);

	if (config.method == 'POST' && config.preparePost)
	{
		config.data = BX.ajax.prepareData(config.data);
	}

	var bXHR = true;
	if (config.lsId && !config.lsForce)
	{
		var v = BX.localStorage.get('ajax-' + config.lsId);
		if (v !== null)
		{
			bXHR = false;

			var lsHandler = function(lsData) {
				if (lsData.key == 'ajax-' + config.lsId && lsData.value != 'BXAJAXWAIT')
				{
					var data = lsData.value,
						bRemove = !!lsData.oldValue && data == null;
					if (!bRemove)
						BX.ajax.__run(config, data);
					else if (config.onfailure)
						config.onfailure("timeout");

					BX.removeCustomEvent('onLocalStorageChange', lsHandler);
				}
			};

			if (v == 'BXAJAXWAIT')
			{
				BX.addCustomEvent('onLocalStorageChange', lsHandler);
			}
			else
			{
				setTimeout(function() {lsHandler({key: 'ajax-' + config.lsId, value: v})}, 10);
			}
		}
	}

	if (bXHR)
	{
		config.xhr = BX.ajax.xhr();
		if (!config.xhr) return;

		if (config.lsId)
		{
			BX.localStorage.set('ajax-' + config.lsId, 'BXAJAXWAIT', config.lsTimeout);
		}

		config.xhr.open(config.method, config.url, config.async);

		if (!config.skipBxHeader && !BX.ajax.isCrossDomain(config.url))
		{
			config.xhr.setRequestHeader('Bx-ajax', 'true');
		}

		if (config.method == 'POST' && config.preparePost)
		{
			config.xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
		}
		if (typeof(config.headers) == "object")
		{
			for (i = 0; i < config.headers.length; i++)
				config.xhr.setRequestHeader(config.headers[i].name, config.headers[i].value);
		}

		if(!!config.onprogress)
		{
			BX.bind(config.xhr, 'progress', config.onprogress);
		}

		var bRequestCompleted = false;
		var onreadystatechange = config.xhr.onreadystatechange = function(additional)
		{
			if (bRequestCompleted)
				return;

			if (additional === 'timeout')
			{
				if (config.onfailure)
				{
					config.onfailure("timeout");
				}

				BX.onCustomEvent(config.xhr, 'onAjaxFailure', ['timeout', '', config]);

				config.xhr.onreadystatechange = BX.DoNothing;
				config.xhr.abort();

				if (config.async)
				{
					config.xhr = null;
				}
			}
			else
			{
				if (config.xhr.readyState == 4 || additional == 'run')
				{
					status = BX.ajax.xhrSuccess(config.xhr) ? "success" : "error";
					bRequestCompleted = true;
					config.xhr.onreadystatechange = BX.DoNothing;

					if (status == 'success')
					{
						var authHeader = (!!config.skipAuthCheck || BX.ajax.isCrossDomain(config.url))
							? false
							: config.xhr.getResponseHeader('X-Bitrix-Ajax-Status');

						if(!!authHeader && authHeader == 'Authorize')
						{
							if (config.onfailure)
							{
								config.onfailure("auth", config.xhr.status);
							}

							BX.onCustomEvent(config.xhr, 'onAjaxFailure', ['auth', config.xhr.status, config]);
						}
						else
						{
							var data = config.xhr.responseText;

							if (config.lsId)
							{
								BX.localStorage.set('ajax-' + config.lsId, data, config.lsTimeout);
							}

							BX.ajax.__run(config, data);
						}
					}
					else
					{
						if (config.onfailure)
						{
							config.onfailure("status", config.xhr.status);
						}

						BX.onCustomEvent(config.xhr, 'onAjaxFailure', ['status', config.xhr.status, config]);
					}

					if (config.async)
					{
						config.xhr = null;
					}
				}
			}
		};

		if (config.async && config.timeout > 0)
		{
			setTimeout(function() {
				if (config.xhr && !bRequestCompleted)
				{
					onreadystatechange("timeout");
				}
			}, config.timeout * 1000);
		}

		if (config.start)
		{
			config.xhr.send(config.data);

			if (!config.async)
			{
				onreadystatechange('run');
			}
		}

		return config.xhr;
	}
};

BX.ajax.xhr = function()
{
	if (window.XMLHttpRequest)
	{
		try {return new XMLHttpRequest();} catch(e){}
	}
	else if (window.ActiveXObject)
	{
		try { return new window.ActiveXObject("Msxml2.XMLHTTP.6.0"); }
			catch(e) {}
		try { return new window.ActiveXObject("Msxml2.XMLHTTP.3.0"); }
			catch(e) {}
		try { return new window.ActiveXObject("Msxml2.XMLHTTP"); }
			catch(e) {}
		try { return new window.ActiveXObject("Microsoft.XMLHTTP"); }
			catch(e) {}
		throw new Error("This browser does not support XMLHttpRequest.");
	}

	return null;
};

BX.ajax.isCrossDomain = function(url, location)
{
	location = location || window.location;

	//Relative URL gets a current protocol
	if (url.indexOf("//") === 0)
	{
		url = location.protocol + url;
	}

	//Fast check
	if (url.indexOf("http") !== 0)
	{
		return false;
	}

	var link = window.document.createElement("a");
	link.href = url;

	return  link.protocol !== location.protocol ||
			link.hostname !== location.hostname ||
			BX.ajax.getHostPort(link.protocol, link.host) !== BX.ajax.getHostPort(location.protocol, location.host);
};

BX.ajax.getHostPort = function(protocol, host)
{
	var match = /:(\d+)$/.exec(host);
	if (match)
	{
		return match[1];
	}
	else
	{
		if (protocol === "http:")
		{
			return "80";
		}
		else if (protocol === "https:")
		{
			return "443";
		}
	}

	return "";
};

BX.ajax.__prepareOnload = function(scripts)
{
	if (scripts.length > 0)
	{
		BX.ajax['onload_' + ajax_session] = null;

		for (var i=0,len=scripts.length;i<len;i++)
		{
			if (scripts[i].isInternal)
			{
				scripts[i].JS = scripts[i].JS.replace(r.script_onload, 'BX.ajax.onload_' + ajax_session);
			}
		}
	}

	BX.CaptureEventsGet();
	BX.CaptureEvents(window, 'load');
};

BX.ajax.__runOnload = function()
{
	if (null != BX.ajax['onload_' + ajax_session])
	{
		BX.ajax['onload_' + ajax_session].apply(window);
		BX.ajax['onload_' + ajax_session] = null;
	}

	var h = BX.CaptureEventsGet();

	if (h)
	{
		for (var i=0; i<h.length; i++)
			h[i].apply(window);
	}
};

BX.ajax.__run = function(config, data)
{
	if (!config.processData)
	{
		if (config.onsuccess)
		{
			config.onsuccess(data);
		}

		BX.onCustomEvent(config.xhr, 'onAjaxSuccess', [data, config]);
	}
	else
	{
		data = BX.ajax.processRequestData(data, config);
	}
};


BX.ajax._onParseJSONFailure = function(data)
{
	this.jsonFailure = true;
	this.jsonResponse = data;
	this.jsonProactive = /^\[WAF\]/.test(data);
};

BX.ajax.processRequestData = function(data, config)
{
	var result, scripts = [], styles = [];
	switch (config.dataType.toUpperCase())
	{
		case 'JSON':

			var context = config.xhr || {};
			BX.addCustomEvent(context, 'onParseJSONFailure', BX.proxy(BX.ajax._onParseJSONFailure, config));
			result = BX.parseJSON(data, context);
			BX.removeCustomEvent(context, 'onParseJSONFailure', BX.proxy(BX.ajax._onParseJSONFailure, config));

			if(!!result && BX.type.isArray(result['bxjs']))
			{
				for(var i = 0; i < result['bxjs'].length; i++)
				{
					if(BX.type.isNotEmptyString(result['bxjs'][i]))
					{
						scripts.push({
							"isInternal": false,
							"JS": result['bxjs'][i],
							"bRunFirst": config.scriptsRunFirst
						});
					}
					else
					{
						scripts.push(result['bxjs'][i])
					}
				}
			}

			if(!!result && BX.type.isArray(result['bxcss']))
			{
				styles = result['bxcss'];
			}

		break;
		case 'SCRIPT':
			scripts.push({"isInternal": true, "JS": data, "bRunFirst": config.scriptsRunFirst});
			result = data;
		break;

		default: // HTML
			var ob = BX.processHTML(data, config.scriptsRunFirst);
			result = ob.HTML; scripts = ob.SCRIPT; styles = ob.STYLE;
		break;
	}

	var bSessionCreated = false;
	if (null == ajax_session)
	{
		ajax_session = parseInt(Math.random() * 1000000);
		bSessionCreated = true;
	}

	if (styles.length > 0)
		BX.loadCSS(styles);

	if (config.emulateOnload)
			BX.ajax.__prepareOnload(scripts);

	var cb = BX.DoNothing;
	if(config.emulateOnload || bSessionCreated)
	{
		cb = BX.defer(function()
		{
			if (config.emulateOnload)
				BX.ajax.__runOnload();
			if (bSessionCreated)
				ajax_session = null;
			BX.onCustomEvent(config.xhr, 'onAjaxSuccessFinish', [config]);
		});
	}

	try
	{
		if (!!config.jsonFailure)
		{
			throw {type: 'json_failure', data: config.jsonResponse, bProactive: config.jsonProactive};
		}

		config.scripts = scripts;

		BX.ajax.processScripts(config.scripts, true);

		if (config.onsuccess)
		{
			config.onsuccess(result);
		}

		BX.onCustomEvent(config.xhr, 'onAjaxSuccess', [result, config]);

		BX.ajax.processScripts(config.scripts, false, cb);
	}
	catch (e)
	{
		if (config.onfailure)
			config.onfailure("processing", e);
		BX.onCustomEvent(config.xhr, 'onAjaxFailure', ['processing', e, config]);
	}
};

BX.ajax.processScripts = function(scripts, bRunFirst, cb)
{
	var scriptsExt = [], scriptsInt = '';

	cb = cb || BX.DoNothing;

	for (var i = 0, length = scripts.length; i < length; i++)
	{
		if (typeof bRunFirst != 'undefined' && bRunFirst != !!scripts[i].bRunFirst)
			continue;

		if (scripts[i].isInternal)
			scriptsInt += ';' + scripts[i].JS;
		else
			scriptsExt.push(scripts[i].JS);
	}

	scriptsExt = BX.util.array_unique(scriptsExt);
	var inlineScripts = scriptsInt.length > 0 ? function() { BX.evalGlobal(scriptsInt); } : BX.DoNothing;

	if (scriptsExt.length > 0)
	{
		BX.load(scriptsExt, function() {
			inlineScripts();
			cb();
		});
	}
	else
	{
		inlineScripts();
		cb();
	}
};

// TODO: extend this function to use with any data objects or forms
BX.ajax.prepareData = function(arData, prefix)
{
	var data = '';
	if (BX.type.isString(arData))
		data = arData;
	else if (null != arData)
	{
		for(var i in arData)
		{
			if (arData.hasOwnProperty(i))
			{
				if (data.length > 0)
					data += '&';
				var name = BX.util.urlencode(i);
				if(prefix)
					name = prefix + '[' + name + ']';
				if(typeof arData[i] == 'object')
					data += BX.ajax.prepareData(arData[i], name);
				else
					data += name + '=' + BX.util.urlencode(arData[i]);
			}
		}
	}
	return data;
};

BX.ajax.xhrSuccess = function(xhr)
{
	return (xhr.status >= 200 && xhr.status < 300) || xhr.status === 304 || xhr.status === 1223 || xhr.status === 0;
};

BX.ajax.Setup = function(config, bTemp)
{
	bTemp = !!bTemp;

	for (var i in config)
	{
		if (bTemp)
			tempDefaultConfig[i] = config[i];
		else
			defaultConfig[i] = config[i];
	}
};

BX.ajax.replaceLocalStorageValue = function(lsId, data, ttl)
{
	if (!!BX.localStorage)
		BX.localStorage.set('ajax-' + lsId, data, ttl);
};


BX.ajax._uncache = function(url)
{
	return url + ((url.indexOf('?') !== -1 ? "&" : "?") + '_=' + (new Date()).getTime());
};

/* simple interface */
BX.ajax.get = function(url, data, callback)
{
	if (BX.type.isFunction(data))
	{
		callback = data;
		data = '';
	}

	data = BX.ajax.prepareData(data);

	if (data)
	{
		url += (url.indexOf('?') !== -1 ? "&" : "?") + data;
		data = '';
	}

	return BX.ajax({
		'method': 'GET',
		'dataType': 'html',
		'url': url,
		'data':  '',
		'onsuccess': callback
	});
};

BX.ajax.getCaptcha = function(callback)
{
	return BX.ajax.loadJSON('/bitrix/tools/ajax_captcha.php', callback);
};

BX.ajax.insertToNode = function(url, node)
{
	node = BX(node);
	if (!!node)
	{
		var eventArgs = { cancel: false };
		BX.onCustomEvent('onAjaxInsertToNode', [{ url: url, node: node, eventArgs: eventArgs }]);
		if(eventArgs.cancel === true)
		{
			return;
		}

		var show = null;
		if (!tempDefaultConfig.denyShowWait)
		{
			show = BX.showWait(node);
			delete tempDefaultConfig.denyShowWait;
		}

		return BX.ajax.get(url, function(data) {
			node.innerHTML = data;
			BX.closeWait(node, show);
		});
	}
};

BX.ajax.post = function(url, data, callback)
{
	data = BX.ajax.prepareData(data);

	return BX.ajax({
		'method': 'POST',
		'dataType': 'html',
		'url': url,
		'data':  data,
		'onsuccess': callback
	});
};

/**
 * BX.ajax with BX.Promise
 *
 * @param config
 * @returns {BX.Promise|false}
 */
BX.ajax.promise = function(config)
{
	var result = new BX.Promise();

	config.onsuccess = function(data)
	{
		result.fulfill(data);
	};
	config.onfailure = function(reason, data)
	{
		result.reject({
			reason: reason,
			data: data
		});
	};
	config.onprogress = function(data)
	{
		if (data.position == 0 && data.totalSize == 0)
		{
			result.reject({
				reason: 'progress',
				data: data
			});
		}
	};

	var xhr = BX.ajax(config);
	if (xhr)
	{
		if (typeof config.onrequeststart === 'function')
		{
			config.onrequeststart(xhr);
		}
	}
	else
	{
		result.reject({
			reason: "init",
			data: false
		});
	}

	return result;
};

/* load and execute external file script with onload emulation */
BX.ajax.loadScriptAjax = function(script_src, callback, bPreload)
{
	if (BX.type.isArray(script_src))
	{
		for (var i=0,len=script_src.length;i<len;i++)
		{
			BX.ajax.loadScriptAjax(script_src[i], callback, bPreload);
		}
	}
	else
	{
		var script_src_test = script_src.replace(/\.js\?.*/, '.js');

		if (r.script_self.test(script_src_test)) return;
		if (r.script_self_window.test(script_src_test) && BX.CWindow) return;
		if (r.script_self_admin.test(script_src_test) && BX.admin) return;

		if (typeof loadedScripts[script_src_test] == 'undefined')
		{
			if (!!bPreload)
			{
				loadedScripts[script_src_test] = '';
				return BX.loadScript(script_src);
			}
			else
			{
				return BX.ajax({
					url: script_src,
					method: 'GET',
					dataType: 'script',
					processData: true,
					emulateOnload: false,
					scriptsRunFirst: true,
					async: false,
					start: true,
					onsuccess: function(result) {
						loadedScripts[script_src_test] = result;
						if (callback)
							callback(result);
					}
				});
			}
		}
		else if (callback)
		{
			callback(loadedScripts[script_src_test]);
		}
	}
};

/* non-xhr loadings */
BX.ajax.loadJSON = function(url, data, callback, callback_failure)
{
	if (BX.type.isFunction(data))
	{
		callback_failure = callback;
		callback = data;
		data = '';
	}

	data = BX.ajax.prepareData(data);

	if (data)
	{
		url += (url.indexOf('?') !== -1 ? "&" : "?") + data;
		data = '';
	}

	return BX.ajax({
		'method': 'GET',
		'dataType': 'json',
		'url': url,
		'onsuccess': callback,
		'onfailure': callback_failure
	});
};


var prepareAjaxGetParameters = function(config)
{
	var getParameters = config.getParameters || {};
	if (BX.type.isNotEmptyString(config.analyticsLabel))
	{
		getParameters.analyticsLabel = config.analyticsLabel;
	}
	else if (BX.type.isNotEmptyObject(config.analyticsLabel))
	{
		getParameters.analyticsLabel = config.analyticsLabel;
	}
	if (typeof config.mode !== 'undefined')
	{
		getParameters.mode = config.mode;
	}
	if (config.navigation)
	{
		if(config.navigation.page)
		{
			getParameters.nav = 'page-' + config.navigation.page;
		}
		if(config.navigation.size)
		{
			if(getParameters.nav)
			{
				getParameters.nav += '-';
			}
			else
			{
				getParameters.nav = '';
			}
			getParameters.nav += 'size-' + config.navigation.size;
		}
	}

	return getParameters;
};

var prepareAjaxConfig = function(config)
{
	config = BX.type.isPlainObject(config) ? config : {};

	if (config.data instanceof FormData)
	{
		config.preparePost = false;

		config.data.append('sessid', BX.bitrix_sessid());
		if (BX.message.SITE_ID)
		{
			config.data.append('SITE_ID', BX.message.SITE_ID);
		}
		if (typeof config.signedParameters !== 'undefined')
		{
			config.data.append('signedParameters', config.signedParameters);
		}
	}
	else
	{
		config.data = BX.type.isPlainObject(config.data) ? config.data : {};
		if (BX.message.SITE_ID)
		{
			config.data.SITE_ID = BX.message.SITE_ID;
		}
		config.data.sessid = BX.bitrix_sessid();
		if (typeof config.signedParameters !== 'undefined')
		{
			config.data.signedParameters = config.signedParameters;
		}
	}

	if (!config.method)
	{
		config.method = 'POST'
	}

	return config;
};

var buildAjaxPromiseToRestoreCsrf = function(config, withoutRestoringCsrf)
{
	withoutRestoringCsrf = withoutRestoringCsrf || false;
	var originalConfig = BX.clone(config);
	var request = null;

	var onrequeststart = config.onrequeststart;
	config.onrequeststart = function(xhr) {
		request = xhr;
		if (BX.type.isFunction(onrequeststart))
		{
			onrequeststart(xhr);
		}
	};
	var onrequeststartOrig = originalConfig.onrequeststart;
	originalConfig.onrequeststart = function(xhr) {
		request = xhr;
		if (BX.type.isFunction(onrequeststartOrig))
		{
			onrequeststartOrig(xhr);
		}
	};

	var promise = BX.ajax.promise(config);

	return promise.then(function(response) {
		if (!withoutRestoringCsrf && BX.type.isPlainObject(response) && BX.type.isArray(response.errors))
		{
			var csrfProblem = false;
			response.errors.forEach(function(error) {
				if (error.code === 'invalid_csrf' && error.customData.csrf)
				{
					BX.message({'bitrix_sessid': error.customData.csrf});
					originalConfig.data.sessid = BX.bitrix_sessid();

					csrfProblem = true;
				}
			});

			if (csrfProblem)
			{
				return buildAjaxPromiseToRestoreCsrf(originalConfig, true);
			}
		}

		if (!BX.type.isPlainObject(response) || response.status !== 'success')
		{
			var errorPromise = new BX.Promise();
			errorPromise.reject(response);

			return errorPromise;
		}

		return response;
	}).catch(function(data) {
		var ajaxReject = new BX.Promise();

		if (BX.type.isPlainObject(data) && data.status && data.hasOwnProperty('data'))
		{
			ajaxReject.reject(data);
		}
		else
		{
			ajaxReject.reject({
				status: 'error',
				data: {
					ajaxRejectData: data
				},
				errors: [
					{
						code: 'NETWORK_ERROR',
						message: 'Network error'
					}
				]
			});
		}

		return ajaxReject;
	}).then(function(response){

		var assetsLoaded = new BX.Promise();

		var headers = request.getAllResponseHeaders().trim().split(/[\r\n]+/);
		var headerMap = {};
		headers.forEach(function (line) {
			var parts = line.split(': ');
			var header = parts.shift().toLowerCase();
			headerMap[header] = parts.join(': ');
		});

		if (!headerMap['x-process-assets'])
		{
			assetsLoaded.fulfill(response);

			return assetsLoaded;
		}

		var assets = BX.prop.getObject(BX.prop.getObject(response, "data", {}), "assets", {});
		var promise = new Promise(function(resolve, reject) {
			var css = BX.prop.getArray(assets, "css", []);
			BX.load(css, function(){
				BX.loadScript(
					BX.prop.getArray(assets, "js", []),
					resolve
				);
			});
		});
		promise.then(function(){
			var strings = BX.prop.getArray(assets, "string", []);
			var stringAsset = strings.join('\n');
			BX.html(null, stringAsset).then(function(){
				assetsLoaded.fulfill(response);
			});
		});

		return assetsLoaded;
	});
};

/**
 *
 * @param {string} action
 * @param {Object} config
 * @param {?string|?Object} [config.analyticsLabel]
 * @param {string} [config.method='POST']
 * @param {Object} [config.data]
 * @param {?Object} [config.getParameters]
 * @param {?Object} [config.headers]
 * @param {?Object} [config.timeout]
 * @param {Object} [config.navigation]
 * @param {number} [config.navigation.page]
 */
BX.ajax.runAction = function(action, config)
{
	config = prepareAjaxConfig(config);
	var getParameters = prepareAjaxGetParameters(config);
	getParameters.action = action;

	var url = '/bitrix/services/main/ajax.php?' + BX.ajax.prepareData(getParameters);

	return buildAjaxPromiseToRestoreCsrf({
		method: config.method,
		dataType: 'json',
		url: url,
		data: config.data,
		timeout: config.timeout,
		preparePost: config.preparePost,
		headers: config.headers,
		onrequeststart: config.onrequeststart
	});
};

/**
 *
 * @param {string} component
 * @param {string} action
 * @param {Object} config
 * @param {?string|?Object} [config.analyticsLabel]
 * @param {?string} [config.signedParameters]
 * @param {string} [config.method='POST']
 * @param {string} [config.mode='ajax'] Ajax or class.
 * @param {Object} [config.data]
 * @param {?Object} [config.getParameters]
 * @param {?array} [config.headers]
 * @param {?number} [config.timeout]
 * @param {Object} [config.navigation]
 */
BX.ajax.runComponentAction = function (component, action, config)
{
	config = prepareAjaxConfig(config);
	config.mode = config.mode || 'ajax';

	var getParameters = prepareAjaxGetParameters(config);
	getParameters.c = component;
	getParameters.action = action;

	var url = '/bitrix/services/main/ajax.php?' + BX.ajax.prepareData(getParameters);

	return buildAjaxPromiseToRestoreCsrf({
		method: config.method,
		dataType: 'json',
		url: url,
		data: config.data,
		timeout: config.timeout,
		preparePost: config.preparePost,
		headers: config.headers,
		onrequeststart: (config.onrequeststart ? config.onrequeststart : null)
	});
};

/*
arObs = [{
	url: url,
	type: html|script|json|css,
	callback: function
}]
*/
BX.ajax.load = function(arObs, callback)
{
	if (!BX.type.isArray(arObs))
		arObs = [arObs];

	var cnt = 0;

	if (!BX.type.isFunction(callback))
		callback = BX.DoNothing;

	var handler = function(data)
		{
			if (BX.type.isFunction(this.callback))
				this.callback(data);

			if (++cnt >= len)
				callback();
		};

	for (var i = 0, len = arObs.length; i<len; i++)
	{
		switch(arObs[i].type.toUpperCase())
		{
			case 'SCRIPT':
				BX.loadScript([arObs[i].url], BX.proxy(handler, arObs[i]));
			break;
			case 'CSS':
				BX.loadCSS([arObs[i].url]);

				if (++cnt >= len)
					callback();
			break;
			case 'JSON':
				BX.ajax.loadJSON(arObs[i].url, BX.proxy(handler, arObs[i]));
			break;

			default:
				BX.ajax.get(arObs[i].url, '', BX.proxy(handler, arObs[i]));
			break;
		}
	}
};

/* ajax form sending */
BX.ajax.submit = function(obForm, callback)
{
	if (!obForm.target)
	{
		if (null == obForm.BXFormTarget)
		{
			var frame_name = 'formTarget_' + Math.random();
			obForm.BXFormTarget = document.body.appendChild(BX.create('IFRAME', {
				props: {
					name: frame_name,
					id: frame_name,
					src: 'javascript:void(0)'
				},
				style: {
					display: 'none'
				}
			}));
		}

		obForm.target = obForm.BXFormTarget.name;
	}

	obForm.BXFormCallback = callback;
	BX.bind(obForm.BXFormTarget, 'load', BX.proxy(BX.ajax._submit_callback, obForm));

	BX.submit(obForm);

	return false;
};

BX.ajax.submitComponentForm = function(obForm, container, bWait)
{
	if (!obForm.target)
	{
		if (null == obForm.BXFormTarget)
		{
			var frame_name = 'formTarget_' + Math.random();
			obForm.BXFormTarget = document.body.appendChild(BX.create('IFRAME', {
				props: {
					name: frame_name,
					id: frame_name,
					src: 'javascript:void(0)'
				},
				style: {
					display: 'none'
				}
			}));
		}

		obForm.target = obForm.BXFormTarget.name;
	}

	if (!!bWait)
		var w = BX.showWait(container);

	obForm.BXFormCallback = function(d) {
		if (!!bWait)
			BX.closeWait(w);

		var callOnload = function(){
			if(!!window.bxcompajaxframeonload)
			{
				setTimeout(function(){window.bxcompajaxframeonload();window.bxcompajaxframeonload=null;}, 10);
			}
		};

		BX(container).innerHTML = d;
		BX.onCustomEvent('onAjaxSuccess', [null,null,callOnload]);
	};

	BX.bind(obForm.BXFormTarget, 'load', BX.proxy(BX.ajax._submit_callback, obForm));

	return true;
};

// func will be executed in form context
BX.ajax._submit_callback = function()
{
	//opera and IE8 triggers onload event even on empty iframe
	try
	{
		if(this.BXFormTarget.contentWindow.location.href.indexOf('http') != 0)
			return;
	} catch (e) {
		return;
	}

	if (this.BXFormCallback)
		this.BXFormCallback.apply(this, [this.BXFormTarget.contentWindow.document.body.innerHTML]);

	BX.unbindAll(this.BXFormTarget);
};

BX.ajax.prepareForm = function(obForm, data)
{
	data = (!!data ? data : {});
	var i, ii, el,
		_data = [],
		n = obForm.elements.length,
		files = 0, length = 0;
	if(!!obForm)
	{
		for (i = 0; i < n; i++)
		{
			el = obForm.elements[i];
			if (el.disabled)
				continue;

			if(!el.type)
				continue;

			switch(el.type.toLowerCase())
			{
				case 'text':
				case 'textarea':
				case 'password':
				case 'number':
				case 'hidden':
				case 'select-one':
					_data.push({name: el.name, value: el.value});
					length += (el.name.length + el.value.length);
					break;
				case 'file':
					if (!!el.files)
					{
						for (ii = 0; ii < el.files.length; ii++)
						{
							files++;
							_data.push({name: el.name, value: el.files[ii], file : true});
							length += el.files[ii].size;
						}
					}
					break;
				case 'radio':
				case 'checkbox':
					if(el.checked)
					{
						_data.push({name: el.name, value: el.value});
						length += (el.name.length + el.value.length);
					}
					break;
				case 'select-multiple':
					for (var j = 0; j < el.options.length; j++)
					{
						if (el.options[j].selected)
						{
							_data.push({name : el.name, value : el.options[j].value});
							length += (el.name.length + el.options[j].length);
						}
					}
					break;
				default:
					break;
			}
		}

		i = 0; length = 0;
		var current = data, name, rest, pp, tmpKey;

		while(i < _data.length)
		{
			var p = _data[i].name.indexOf('[');
			if (tmpKey)
			{
				current[_data[i].name] = {};
				current[_data[i].name][tmpKey.replace(/\[|\]/gi, '')] = _data[i].value;
				current = data;
				tmpKey = null;
				i++;
			}
			else if (p == -1)
			{
				current[_data[i].name] = _data[i].value;
				current = data;
				i++;
			}
			else
			{
				name = _data[i].name.substring(0, p);
				rest = _data[i].name.substring(p+1);
				pp = rest.indexOf(']');

				if(pp == -1)
				{
					if (!current[name])
						current[name] = [];
					current = data;
					i++;
				}
				else if(pp == 0)
				{
					if (!current[name])
						current[name] = [];
					//No index specified - so take the next integer
					current = current[name];
					_data[i].name = '' + current.length;
					if (rest.substring(pp+1).indexOf('[') === 0)
						tmpKey = rest.substring(0, pp) + rest.substring(pp+1);
				}
				else
				{
					if (!current[name])
						current[name] = {};
					//Now index name becomes and name and we go deeper into the array
					current = current[name];
					_data[i].name = rest.substring(0, pp) + rest.substring(pp+1);
				}
			}
		}
	}
	return {data : data, filesCount : files, roughSize : length};
};
BX.ajax.submitAjax = function(obForm, config)
{
	config = (config !== null && typeof config == "object" ? config : {});
	config.url = (config["url"] || obForm.getAttribute("action"));

	var additionalData = (config["data"] || {});
	config.data = BX.ajax.prepareForm(obForm).data;
	for (var ii in additionalData)
	{
		if (additionalData.hasOwnProperty(ii))
		{
			config.data[ii] = additionalData[ii];
		}
	}

	if (!window["FormData"])
	{
		BX.ajax(config);
	}
	else
	{
		var isFile = function(item)
		{
			var res = Object.prototype.toString.call(item);
			return (res == '[object File]' || res == '[object Blob]');
		},
		appendToForm = function(fd, key, val)
		{
			if (!!val && typeof val == "object" && !isFile(val))
			{
				for (var ii in val)
				{
					if (val.hasOwnProperty(ii))
					{
						appendToForm(fd, (key == '' ? ii : key + '[' + ii + ']'), val[ii]);
					}
				}
			}
			else
				fd.append(key, (!!val ? val : ''));
		},
		prepareData = function(arData)
		{
			var data = {};
			if (null != arData)
			{
				if(typeof arData == 'object')
				{
					for(var i in arData)
					{
						if (arData.hasOwnProperty(i))
						{
							var name = BX.util.urlencode(i);
							if(typeof arData[i] == 'object' && arData[i]["file"] !== true)
								data[name] = prepareData(arData[i]);
							else if (arData[i]["file"] === true)
								data[name] = arData[i]["value"];
							else
								data[name] = BX.util.urlencode(arData[i]);
						}
					}
				}
				else
					data = BX.util.urlencode(arData);
			}
			return data;
		},
		fd = new window.FormData();

		if (config.method !== 'POST')
		{
			config.data = BX.ajax.prepareData(config.data);
			if (config.data)
			{
				config.url += (config.url.indexOf('?') !== -1 ? "&" : "?") + config.data;
				config.data = '';
			}
		}
		else
		{
			if (config.preparePost === true)
				config.data = prepareData(config.data);
			appendToForm(fd, '', config.data);
			config.data = fd;
		}

		config.preparePost = false;
		config.start = false;

		var xhr = BX.ajax(config);
		if (!!config["onprogress"])
			xhr.upload.addEventListener(
				'progress',
				function(e){
					var percent = null;
					if(e.lengthComputable && (e.total || e["totalSize"])) {
						percent = e.loaded * 100 / (e.total || e["totalSize"]);
					}
					config["onprogress"](e, percent);
				}
			);
		xhr.send(fd);
	}
};

BX.ajax.UpdatePageData = function (arData)
{
	if (arData.TITLE)
		BX.ajax.UpdatePageTitle(arData.TITLE);
	if (arData.WINDOW_TITLE || arData.TITLE)
		BX.ajax.UpdateWindowTitle(arData.WINDOW_TITLE || arData.TITLE);
	if (arData.NAV_CHAIN)
		BX.ajax.UpdatePageNavChain(arData.NAV_CHAIN);
	if (arData.CSS && arData.CSS.length > 0)
		BX.loadCSS(arData.CSS);
	if (arData.SCRIPTS && arData.SCRIPTS.length > 0)
	{
		var f = function(result,config,cb){

			if(!!config && BX.type.isArray(config.scripts))
			{
				for(var i=0,l=arData.SCRIPTS.length;i<l;i++)
				{
					config.scripts.push({isInternal:false,JS:arData.SCRIPTS[i]});
				}
			}
			else
			{
				BX.loadScript(arData.SCRIPTS,cb);
			}

			BX.removeCustomEvent('onAjaxSuccess',f);
		};
		BX.addCustomEvent('onAjaxSuccess',f);
	}
	else
	{
		var f1 = function(result,config,cb){
			if(BX.type.isFunction(cb))
			{
				cb();
			}
			BX.removeCustomEvent('onAjaxSuccess',f1);
		};
		BX.addCustomEvent('onAjaxSuccess', f1);
	}
};

BX.ajax.UpdatePageTitle = function(title)
{
	var obTitle = BX('pagetitle');
	if (obTitle)
	{
		obTitle.removeChild(obTitle.firstChild);
		if (!obTitle.firstChild)
			obTitle.appendChild(document.createTextNode(title));
		else
			obTitle.insertBefore(document.createTextNode(title), obTitle.firstChild);
	}
};

BX.ajax.UpdateWindowTitle = function(title)
{
	document.title = title;
};

BX.ajax.UpdatePageNavChain = function(nav_chain)
{
	var obNavChain = BX('navigation');
	if (obNavChain)
	{
		obNavChain.innerHTML = nav_chain;
	}
};

/* user options handling */
BX.userOptions = {
	options: null,
	bSend: false,
	delay: 5000,
	path: '/bitrix/admin/user_options.php?'
};

BX.userOptions.setAjaxPath = function(url)
{
	BX.userOptions.path = url.indexOf('?') == -1? url+'?': url+'&';
}
BX.userOptions.save = function(sCategory, sName, sValName, sVal, bCommon)
{
	if (null == BX.userOptions.options)
		BX.userOptions.options = {};

	bCommon = !!bCommon;
	BX.userOptions.options[sCategory+'.'+sName+'.'+sValName] = [sCategory, sName, sValName, sVal, bCommon];

	var sParam = BX.userOptions.__get();
	if (sParam != '')
		document.cookie = BX.message('COOKIE_PREFIX')+"_LAST_SETTINGS=" + encodeURIComponent(sParam) + "&sessid="+BX.bitrix_sessid()+"; expires=Thu, 31 Dec 2020 23:59:59 GMT; path=/;";

	if(!BX.userOptions.bSend)
	{
		BX.userOptions.bSend = true;
		setTimeout(function(){BX.userOptions.send(null)}, BX.userOptions.delay);
	}
};

BX.userOptions.send = function(callback)
{
	var sParam = BX.userOptions.__get();
	BX.userOptions.options = null;
	BX.userOptions.bSend = false;

	if (sParam != '')
	{
		document.cookie = BX.message('COOKIE_PREFIX') + "_LAST_SETTINGS=; path=/;";
		BX.ajax({
			'method': 'GET',
			'dataType': 'html',
			'processData': false,
			'cache': false,
			'url': BX.userOptions.path+sParam+'&sessid='+BX.bitrix_sessid(),
			'onsuccess': callback
		});
	}
};

BX.userOptions.del = function(sCategory, sName, bCommon, callback)
{
	BX.ajax.get(BX.userOptions.path+'action=delete&c='+sCategory+'&n='+sName+(bCommon == true? '&common=Y':'')+'&sessid='+BX.bitrix_sessid(), callback);
};

BX.userOptions.__get = function()
{
	if (!BX.userOptions.options) return '';

	var sParam = '', n = -1, prevParam = '', aOpt, i;

	for (i in BX.userOptions.options)
	{
		if(BX.userOptions.options.hasOwnProperty(i))
		{
			aOpt = BX.userOptions.options[i];

			if (prevParam != aOpt[0]+'.'+aOpt[1])
			{
				n++;
				sParam += '&p['+n+'][c]='+BX.util.urlencode(aOpt[0]);
				sParam += '&p['+n+'][n]='+BX.util.urlencode(aOpt[1]);
				if (aOpt[4] == true)
					sParam += '&p['+n+'][d]=Y';
				prevParam = aOpt[0]+'.'+aOpt[1];
			}

			var valueName = aOpt[2];
			var value = aOpt[3];

			if (valueName === null)
			{
				sParam += '&p['+n+'][v]='+BX.util.urlencode(value);
			}
			else
			{
				sParam += '&p['+n+'][v]['+BX.util.urlencode(valueName)+']='+BX.util.urlencode(value);
			}
		}
	}

	return sParam.substr(1);
};

BX.ajax.history = {
	expected_hash: '',

	obParams: null,

	obFrame: null,
	obImage: null,

	obTimer: null,

	bInited: false,
	bHashCollision: false,
	bPushState: !!(history.pushState && BX.type.isFunction(history.pushState)),

	startState: null,

	init: function(obParams)
	{
		if (BX.ajax.history.bInited)
			return;

		this.obParams = obParams;
		var obCurrentState = this.obParams.getState();

		if (BX.ajax.history.bPushState)
		{
			BX.ajax.history.expected_hash = window.location.pathname;
			if (window.location.search)
				BX.ajax.history.expected_hash += window.location.search;

			BX.ajax.history.put(obCurrentState, BX.ajax.history.expected_hash, '', true);
			// due to some strange thing, chrome calls popstate event on page start. so we should delay it
			setTimeout(function(){BX.bind(window, 'popstate', BX.ajax.history.__hashListener);}, 500);
		}
		else
		{
			BX.ajax.history.expected_hash = window.location.hash;

			if (!BX.ajax.history.expected_hash || BX.ajax.history.expected_hash == '#')
				BX.ajax.history.expected_hash = '__bx_no_hash__';

			jsAjaxHistoryContainer.put(BX.ajax.history.expected_hash, obCurrentState);
			BX.ajax.history.obTimer = setTimeout(BX.ajax.history.__hashListener, 500);

			if (BX.browser.IsIE())
			{
				BX.ajax.history.obFrame = document.createElement('IFRAME');
				BX.hide_object(BX.ajax.history.obFrame);

				document.body.appendChild(BX.ajax.history.obFrame);

				BX.ajax.history.obFrame.contentWindow.document.open();
				BX.ajax.history.obFrame.contentWindow.document.write(BX.ajax.history.expected_hash);
				BX.ajax.history.obFrame.contentWindow.document.close();
			}
			else if (BX.browser.IsOpera())
			{
				BX.ajax.history.obImage = document.createElement('IMG');
				BX.hide_object(BX.ajax.history.obImage);

				document.body.appendChild(BX.ajax.history.obImage);

				BX.ajax.history.obImage.setAttribute('src', 'javascript:location.href = \'javascript:BX.ajax.history.__hashListener();\';');
			}
		}

		BX.ajax.history.bInited = true;
	},

	__hashListener: function(e)
	{
		e = e || window.event || {state:false};

		if (BX.ajax.history.bPushState)
		{
			BX.ajax.history.obParams.setState(e.state||BX.ajax.history.startState);
		}
		else
		{
			if (BX.ajax.history.obTimer)
			{
				window.clearTimeout(BX.ajax.history.obTimer);
				BX.ajax.history.obTimer = null;
			}

			var current_hash;
			if (null != BX.ajax.history.obFrame)
				current_hash = BX.ajax.history.obFrame.contentWindow.document.body.innerText;
			else
				current_hash = window.location.hash;

			if (!current_hash || current_hash == '#')
				current_hash = '__bx_no_hash__';

			if (current_hash.indexOf('#') == 0)
				current_hash = current_hash.substring(1);

			if (current_hash != BX.ajax.history.expected_hash)
			{
				var state = jsAjaxHistoryContainer.get(current_hash);
				if (state)
				{
					BX.ajax.history.obParams.setState(state);

					BX.ajax.history.expected_hash = current_hash;
					if (null != BX.ajax.history.obFrame)
					{
						var __hash = current_hash == '__bx_no_hash__' ? '' : current_hash;
						if (window.location.hash != __hash && window.location.hash != '#' + __hash)
							window.location.hash = __hash;
					}
				}
			}

			BX.ajax.history.obTimer = setTimeout(BX.ajax.history.__hashListener, 500);
		}
	},

	put: function(state, new_hash, new_hash1, bStartState)
	{
		if (this.bPushState)
		{
			if(!bStartState)
			{
				history.pushState(state, '', new_hash);
			}
			else
			{
				BX.ajax.history.startState = state;
			}
		}
		else
		{
			if (typeof new_hash1 != 'undefined')
				new_hash = new_hash1;
			else
				new_hash = 'view' + new_hash;

			jsAjaxHistoryContainer.put(new_hash, state);
			BX.ajax.history.expected_hash = new_hash;

			window.location.hash = BX.util.urlencode(new_hash);

			if (null != BX.ajax.history.obFrame)
			{
				BX.ajax.history.obFrame.contentWindow.document.open();
				BX.ajax.history.obFrame.contentWindow.document.write(new_hash);
				BX.ajax.history.obFrame.contentWindow.document.close();
			}
		}
	},

	checkRedirectStart: function(param_name, param_value)
	{
		var current_hash = window.location.hash;
		if (current_hash.substring(0, 1) == '#') current_hash = current_hash.substring(1);

		var test = current_hash.substring(0, 5);
		if (test == 'view/' || test == 'view%')
		{
			BX.ajax.history.bHashCollision = true;
			document.write('<' + 'div id="__ajax_hash_collision_' + param_value + '" style="display: none;">');
		}
	},

	checkRedirectFinish: function(param_name, param_value)
	{
		document.write('</div>');

		var current_hash = window.location.hash;
		if (current_hash.substring(0, 1) == '#') current_hash = current_hash.substring(1);

		BX.ready(function ()
		{
			var test = current_hash.substring(0, 5);
			if (test == 'view/' || test == 'view%')
			{
				var obColNode = BX('__ajax_hash_collision_' + param_value);
				var obNode = obColNode.firstChild;
				BX.cleanNode(obNode);
				obColNode.style.display = 'block';

				// IE, Opera and Chrome automatically modifies hash with urlencode, but FF doesn't ;-(
				if (test != 'view%')
					current_hash = BX.util.urlencode(current_hash);

				current_hash += (current_hash.indexOf('%3F') == -1 ? '%3F' : '%26') + param_name + '=' + param_value;

				var url = '/bitrix/tools/ajax_redirector.php?hash=' + current_hash;

				BX.ajax.insertToNode(url, obNode);
			}
		});
	}
};

BX.ajax.component = function(node)
{
	this.node = node;
};

BX.ajax.component.prototype.getState = function()
{
	var state = {
		'node': this.node,
		'title': window.document.title,
		'data': BX(this.node).innerHTML
	};

	var obNavChain = BX('navigation');
	if (null != obNavChain)
		state.nav_chain = obNavChain.innerHTML;

	BX.onCustomEvent(BX(state.node), "onComponentAjaxHistoryGetState", [state]);

	return state;
};

BX.ajax.component.prototype.setState = function(state)
{
	BX(state.node).innerHTML = state.data;
	BX.ajax.UpdatePageTitle(state.title);

	if (state.nav_chain)
	{
		BX.ajax.UpdatePageNavChain(state.nav_chain);
	}

	BX.onCustomEvent(BX(state.node), "onComponentAjaxHistorySetState", [state]);
};

var jsAjaxHistoryContainer = {
	arHistory: {},

	put: function(hash, state)
	{
		this.arHistory[hash] = state;
	},

	get: function(hash)
	{
		return this.arHistory[hash];
	}
};


BX.ajax.FormData = function()
{
	this.elements = [];
	this.files = [];
	this.features = {};
	this.isSupported();
	this.log('BX FormData init');
};

BX.ajax.FormData.isSupported = function()
{
	var f = new BX.ajax.FormData();
	var result = f.features.supported;
	f = null;
	return result;
};

BX.ajax.FormData.prototype.log = function(o)
{
	if (false) {
		try {
			if (BX.browser.IsIE()) o = JSON.stringify(o);
			console.log(o);
		} catch(e) {}
	}
};

BX.ajax.FormData.prototype.isSupported = function()
{
	var f = {};
	f.fileReader = (window.FileReader && window.FileReader.prototype.readAsBinaryString);
	f.readFormData = f.sendFormData = !!(window.FormData);
	f.supported = !!(f.readFormData && f.sendFormData);
	this.features = f;
	this.log('features:');
	this.log(f);

	return f.supported;
};

BX.ajax.FormData.prototype.append = function(name, value)
{
	if (typeof(value) === 'object') { // seems to be files element
		this.files.push({'name': name, 'value':value});
	} else {
		this.elements.push({'name': name, 'value':value});
	}
};

BX.ajax.FormData.prototype.send = function(url, callbackOk, callbackProgress, callbackError)
{
	this.log('FD send');
	this.xhr = BX.ajax({
			'method': 'POST',
			'dataType': 'html',
			'url': url,
			'onsuccess': callbackOk,
			'onfailure': callbackError,
			'start': false,
			'preparePost':false
		});

	if (callbackProgress)
	{
		this.xhr.upload.addEventListener(
			'progress',
			function(e) {
				if (e.lengthComputable)
					callbackProgress(e.loaded / (e.total || e.totalSize));
			},
			false
		);
	}

	if (this.features.readFormData && this.features.sendFormData)
	{
		var fd = new FormData();
		this.log('use browser formdata');
		for (var i in this.elements)
		{
			if(this.elements.hasOwnProperty(i))
				fd.append(this.elements[i].name,this.elements[i].value);
		}
		for (i in this.files)
		{
			if(this.files.hasOwnProperty(i))
				fd.append(this.files[i].name, this.files[i].value);
		}
		this.xhr.send(fd);
	}

	return this.xhr;
};

BX.addCustomEvent('onAjaxFailure', BX.debug);
})(window);



(function (exports) {
	'use strict';

	var LazyLoad = {
	  images: [],
	  imageStatus: {
	    hidden: -2,
	    error: -1,
	    "undefined": 0,
	    inited: 1,
	    loaded: 2
	  },
	  imageTypes: {
	    image: 1,
	    background: 2
	  },
	  registerImage: function registerImage(id, isImageVisibleCallback, options) {
	    options = options || {};

	    if (BX.type.isNotEmptyString(id)) {
	      this.images.push({
	        id: id,
	        node: null,
	        src: null,
	        dataSrcName: options.dataSrcName || 'src',
	        type: null,
	        func: BX.type.isFunction(isImageVisibleCallback) ? isImageVisibleCallback : null,
	        status: this.imageStatus.undefined
	      });
	    }
	  },
	  registerImages: function registerImages(ids, isImageVisibleCallback, options) {
	    if (BX.type.isArray(ids)) {
	      for (var i = 0, length = ids.length; i < length; i++) {
	        this.registerImage(ids[i], isImageVisibleCallback, options);
	      }
	    }
	  },
	  showImages: function showImages(checkOwnVisibility) {
	    var image = null;
	    var isImageVisible = false;
	    checkOwnVisibility = checkOwnVisibility !== false;

	    for (var i = 0, length = this.images.length; i < length; i++) {
	      image = this.images[i];

	      if (image.status == this.imageStatus.undefined) {
	        this.initImage(image);
	      }

	      if (image.status !== this.imageStatus.inited) {
	        continue;
	      }

	      if (!image.node || !image.node.parentNode) {
	        image.node = null;
	        image.status = this.imageStatus.error;
	        continue;
	      }

	      isImageVisible = true;

	      if (checkOwnVisibility && image.func) {
	        isImageVisible = image.func(image);
	      }

	      if (isImageVisible === true && this.isElementVisibleOnScreen(image.node)) {
	        if (image.type == this.imageTypes.image) {
	          image.node.src = image.src;
	        } else {
	          image.node.style.backgroundImage = "url('" + image.src + "')";
	        }

	        image.node.dataset[image.dataSrcName] = "";
	        image.status = this.imageStatus.loaded;
	      }
	    }
	  },
	  initImage: function initImage(image) {
	    image.status = this.imageStatus.error;
	    var node = BX(image.id);

	    if (node) {
	      var src = node.dataset[image.dataSrcName];

	      if (BX.type.isNotEmptyString(src)) {
	        image.node = node;
	        image.src = src;
	        image.status = this.imageStatus.inited;
	        image.type = image.node.tagName.toLowerCase() == "img" ? this.imageTypes.image : this.imageTypes.background;
	      }
	    }
	  },
	  isElementVisibleOnScreen: function isElementVisibleOnScreen(element) {
	    var coords = this.getElementCoords(element);
	    var windowTop = window.pageYOffset || document.documentElement.scrollTop;
	    var windowBottom = windowTop + document.documentElement.clientHeight;
	    coords.bottom = coords.top + element.offsetHeight;
	    var topVisible = coords.top > windowTop && coords.top < windowBottom;
	    var bottomVisible = coords.bottom < windowBottom && coords.bottom > windowTop;
	    return topVisible || bottomVisible;
	  },
	  isElementVisibleOn2Screens: function isElementVisibleOn2Screens(element) {
	    var coords = this.getElementCoords(element);
	    var windowHeight = document.documentElement.clientHeight;
	    var windowTop = window.pageYOffset || document.documentElement.scrollTop;
	    var windowBottom = windowTop + windowHeight;
	    coords.bottom = coords.top + element.offsetHeight;
	    windowTop -= windowHeight;
	    windowBottom += windowHeight;
	    var topVisible = coords.top > windowTop && coords.top < windowBottom;
	    var bottomVisible = coords.bottom < windowBottom && coords.bottom > windowTop;
	    return topVisible || bottomVisible;
	  },
	  getElementCoords: function getElementCoords(element) {
	    var box = element.getBoundingClientRect();
	    return {
	      originTop: box.top,
	      originLeft: box.left,
	      top: box.top + window.pageYOffset,
	      left: box.left + window.pageXOffset
	    };
	  },
	  onScroll: function onScroll() {
	    BX.LazyLoad.showImages();
	  },
	  clearImages: function clearImages() {
	    this.images = [];
	  }
	};

	exports.LazyLoad = LazyLoad;

}((this.BX = this.BX || {})));



(function (exports) {
	'use strict';

	var ParamBag =
	/*#__PURE__*/
	function () {
	  function ParamBag() {
	    var params = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
	    babelHelpers.classCallCheck(this, ParamBag);

	    if (!!params && babelHelpers.typeof(params) === 'object') {
	      this.params = new Map(Object.entries(params));
	    } else {
	      this.params = new Map();
	    }
	  }

	  babelHelpers.createClass(ParamBag, [{
	    key: "getParam",
	    value: function getParam(key) {
	      var defaultValue = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

	      if (this.params.has(key)) {
	        return this.params.get(key);
	      }

	      return defaultValue;
	    }
	  }, {
	    key: "setParam",
	    value: function setParam(key, value) {
	      this.params.set(key, value);
	    }
	  }, {
	    key: "clear",
	    value: function clear() {
	      this.params.clear();
	    }
	  }], [{
	    key: "create",
	    value: function create() {
	      var params = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
	      return new ParamBag(params);
	    }
	  }]);
	  return ParamBag;
	}();

	exports.ParamBag = ParamBag;

}((this.BX = this.BX || {})));



(function() {
	BX.FixFontSize = function(params)
	{
		var widthNode, computedStyles, width;

		this.node = null;
		this.prevWindowSize = 0;
		this.prevWrapperSize = 0;
		this.mainWrapper = null;
		this.textWrapper = null;
		this.objList = params.objList;
		this.minFontSizeList = [];
		this.minFontSize = 0;

		if (params.onresize)
		{
			this.prevWindowSize = window.innerWidth || document.documentElement.clientWidth;
			BX.bind(window, 'resize', BX.throttle(this.onResize, 350, this));
		}

		if (params.onAdaptiveResize)
		{
			widthNode = this.objList[0].scaleBy || this.objList[0].node;
			computedStyles = getComputedStyle(widthNode);
			this.prevWrapperSize = parseInt(computedStyles["width"]) - parseInt(computedStyles["paddingLeft"]) - parseInt(computedStyles["paddingRight"]);
			BX.bind(window, 'resize', BX.throttle(this.onAdaptiveResize, 350, this));
		}

		this.createTestNodes();
		this.decrease();
	};

	BX.FixFontSize.prototype =
		{
			createTestNodes: function()
			{
				this.textWrapper = BX.create('div',{
					style : {
						display : 'inline-block',
						whiteSpace : 'nowrap'
					}
				});

				this.mainWrapper = BX.create('div',{
					style : {
						height : 0,
						overflow : 'hidden'
					},
					children : [this.textWrapper]
				});

			},
			insertTestNodes: function()
			{
				document.body.appendChild(this.mainWrapper);
			},
			removeTestNodes: function()
			{
				document.body.removeChild(this.mainWrapper);
			},
			decrease: function()
			{
				var width,
					fontSize,
					widthNode,
					computedStyles;

				this.insertTestNodes();

				for(var i=this.objList.length-1; i>=0; i--)
				{
					widthNode = this.objList[i].scaleBy || this.objList[i].node;
					computedStyles = getComputedStyle(widthNode);
					width  = parseInt(computedStyles["width"]) - parseInt(computedStyles["paddingLeft"]) - parseInt(computedStyles["paddingRight"]);
					fontSize = parseInt(getComputedStyle(this.objList[i].node)["font-size"]);

					this.textWrapperSetStyle(this.objList[i].node);

					if(this.textWrapperInsertText(this.objList[i].node))
					{
						while(this.textWrapper.offsetWidth > width && fontSize > 0)
						{
							this.textWrapper.style.fontSize = --fontSize + 'px';
						}

						if(this.objList[i].smallestValue)
						{
							this.minFontSize = this.minFontSize ? Math.min(this.minFontSize, fontSize) : fontSize;

							this.minFontSizeList.push(this.objList[i].node)
						}
						else
						{
							this.objList[i].node.style.fontSize = fontSize + 'px';
						}
					}
				}

				if(this.minFontSizeList.length > 0)
					this.setMinFont();

				this.removeTestNodes();

			},
			increase: function()
			{
				this.insertTestNodes();
				var width,
					fontSize,
					widthNode,
					computedStyles;

				this.insertTestNodes();

				for(var i=this.objList.length-1; i>=0; i--)
				{
					widthNode = this.objList[i].scaleBy || this.objList[i].node;
					computedStyles = getComputedStyle(widthNode);
					width  = parseInt(computedStyles["width"]) - parseInt(computedStyles["paddingLeft"]) - parseInt(computedStyles["paddingRight"]);
					fontSize = parseInt(getComputedStyle(this.objList[i].node)["font-size"]);

					this.textWrapperSetStyle(this.objList[i].node);

					if(this.textWrapperInsertText(this.objList[i].node))
					{
						while(this.textWrapper.offsetWidth < width && fontSize < this.objList[i].maxFontSize)
						{
							this.textWrapper.style.fontSize = ++fontSize + 'px';
						}

						fontSize--;

						if(this.objList[i].smallestValue)
						{
							this.minFontSize = this.minFontSize ? Math.min(this.minFontSize, fontSize) : fontSize;

							this.minFontSizeList.push(this.objList[i].node)
						}
						else
						{
							this.objList[i].node.style.fontSize = fontSize + 'px';
						}
					}
				}

				if(this.minFontSizeList.length > 0)
					this.setMinFont();

				this.removeTestNodes();
			},
			setMinFont : function()
			{
				for(var i = this.minFontSizeList.length-1; i>=0; i--)
				{
					this.minFontSizeList[i].style.fontSize = this.minFontSize + 'px';
				}

				this.minFontSize = 0;
			},
			onResize : function()
			{
				var width = window.innerWidth || document.documentElement.clientWidth;

				if(this.prevWindowSize > width)
					this.decrease();

				else if (this.prevWindowSize < width)
					this.increase();

				this.prevWindowSize = width;
			},
			onAdaptiveResize : function()
			{
				var widthNode = this.objList[0].scaleBy || this.objList[0].node,
					computedStyles = getComputedStyle(widthNode),
					width = parseInt(computedStyles["width"]) - parseInt(computedStyles["paddingLeft"]) - parseInt(computedStyles["paddingRight"]);

				if (this.prevWrapperSize > width)
					this.decrease();
				else if (this.prevWrapperSize < width)
					this.increase();

				this.prevWrapperSize = width;
			},
			textWrapperInsertText : function(node)
			{
				if(node.textContent){
					this.textWrapper.textContent = node.textContent;
					return true;
				}
				else if(node.innerText)
				{
					this.textWrapper.innerText = node.innerText;
					return true;
				}
				else {
					return false;
				}
			},
			textWrapperSetStyle : function(node)
			{
				this.textWrapper.style.fontFamily = getComputedStyle(node)["font-family"];
				this.textWrapper.style.fontSize = getComputedStyle(node)["font-size"];
				this.textWrapper.style.fontStyle = getComputedStyle(node)["font-style"];
				this.textWrapper.style.fontWeight = getComputedStyle(node)["font-weight"];
				this.textWrapper.style.lineHeight = getComputedStyle(node)["line-height"];
			}
		};

	BX.FixFontSize.init = function(params)
	{
		return new BX.FixFontSize(params);
	};
})();
