function noop() { }
function assign(tar, src) {
    // @ts-ignore
    for (const k in src)
        tar[k] = src[k];
    return tar;
}
function add_location(element, file, line, column, char) {
    element.__svelte_meta = {
        loc: { file, line, column, char }
    };
}
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function validate_store(store, name) {
    if (!store || typeof store.subscribe !== 'function') {
        throw new Error(`'${name}' is not a store with a 'subscribe' method`);
    }
}
function subscribe(store, callback) {
    const unsub = store.subscribe(callback);
    return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
}
function component_subscribe(component, store, callback) {
    component.$$.on_destroy.push(subscribe(store, callback));
}
function create_slot(definition, ctx, $$scope, fn) {
    if (definition) {
        const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
        return definition[0](slot_ctx);
    }
}
function get_slot_context(definition, ctx, $$scope, fn) {
    return definition[1] && fn
        ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
        : $$scope.ctx;
}
function get_slot_changes(definition, $$scope, dirty, fn) {
    return definition[2] && fn
        ? $$scope.dirty | definition[2](fn(dirty))
        : $$scope.dirty;
}

function append(target, node) {
    target.appendChild(node);
}
function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
}
function detach(node) {
    node.parentNode.removeChild(node);
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function svg_element(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function empty() {
    return text('');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function claim_element(nodes, name, attributes, svg) {
    for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (node.nodeName === name) {
            for (let j = 0; j < node.attributes.length; j += 1) {
                const attribute = node.attributes[j];
                if (!attributes[attribute.name])
                    node.removeAttribute(attribute.name);
            }
            return nodes.splice(i, 1)[0]; // TODO strip unwanted attributes
        }
    }
    return svg ? svg_element(name) : element(name);
}
function claim_text(nodes, data) {
    for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (node.nodeType === 3) {
            node.data = '' + data;
            return nodes.splice(i, 1)[0];
        }
    }
    return text(data);
}
function claim_space(nodes) {
    return claim_text(nodes, ' ');
}
function custom_event(type, detail) {
    const e = document.createEvent('CustomEvent');
    e.initCustomEvent(type, false, false, detail);
    return e;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error(`Function called outside component initialization`);
    return current_component;
}
function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
}
function afterUpdate(fn) {
    get_current_component().$$.after_update.push(fn);
}
function onDestroy(fn) {
    get_current_component().$$.on_destroy.push(fn);
}
function createEventDispatcher() {
    const component = get_current_component();
    return (type, detail) => {
        const callbacks = component.$$.callbacks[type];
        if (callbacks) {
            // TODO are there situations where events could be dispatched
            // in a server (non-DOM) environment?
            const event = custom_event(type, detail);
            callbacks.slice().forEach(fn => {
                fn.call(component, event);
            });
        }
    };
}

const dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
function flush() {
    const seen_callbacks = new Set();
    do {
        // first, call beforeUpdate functions
        // and update components
        while (dirty_components.length) {
            const component = dirty_components.shift();
            set_current_component(component);
            update(component.$$);
        }
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                callback();
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        $$.fragment && $$.fragment.p($$.ctx, $$.dirty);
        $$.dirty = [-1];
        $$.after_update.forEach(add_render_callback);
    }
}
const outroing = new Set();
let outros;
function group_outros() {
    outros = {
        r: 0,
        c: [],
        p: outros // parent group
    };
}
function check_outros() {
    if (!outros.r) {
        run_all(outros.c);
    }
    outros = outros.p;
}
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
}

function destroy_block(block, lookup) {
    block.d(1);
    lookup.delete(block.key);
}
function outro_and_destroy_block(block, lookup) {
    transition_out(block, 1, 1, () => {
        lookup.delete(block.key);
    });
}
function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
    let o = old_blocks.length;
    let n = list.length;
    let i = o;
    const old_indexes = {};
    while (i--)
        old_indexes[old_blocks[i].key] = i;
    const new_blocks = [];
    const new_lookup = new Map();
    const deltas = new Map();
    i = n;
    while (i--) {
        const child_ctx = get_context(ctx, list, i);
        const key = get_key(child_ctx);
        let block = lookup.get(key);
        if (!block) {
            block = create_each_block(key, child_ctx);
            block.c();
        }
        else if (dynamic) {
            block.p(child_ctx, dirty);
        }
        new_lookup.set(key, new_blocks[i] = block);
        if (key in old_indexes)
            deltas.set(key, Math.abs(i - old_indexes[key]));
    }
    const will_move = new Set();
    const did_move = new Set();
    function insert(block) {
        transition_in(block, 1);
        block.m(node, next);
        lookup.set(block.key, block);
        next = block.first;
        n--;
    }
    while (o && n) {
        const new_block = new_blocks[n - 1];
        const old_block = old_blocks[o - 1];
        const new_key = new_block.key;
        const old_key = old_block.key;
        if (new_block === old_block) {
            // do nothing
            next = new_block.first;
            o--;
            n--;
        }
        else if (!new_lookup.has(old_key)) {
            // remove old block
            destroy(old_block, lookup);
            o--;
        }
        else if (!lookup.has(new_key) || will_move.has(new_key)) {
            insert(new_block);
        }
        else if (did_move.has(old_key)) {
            o--;
        }
        else if (deltas.get(new_key) > deltas.get(old_key)) {
            did_move.add(new_key);
            insert(new_block);
        }
        else {
            will_move.add(old_key);
            o--;
        }
    }
    while (o--) {
        const old_block = old_blocks[o];
        if (!new_lookup.has(old_block.key))
            destroy(old_block, lookup);
    }
    while (n)
        insert(new_blocks[n - 1]);
    return new_blocks;
}
function create_component(block) {
    block && block.c();
}
function claim_component(block, parent_nodes) {
    block && block.l(parent_nodes);
}
function mount_component(component, target, anchor) {
    const { fragment, on_mount, on_destroy, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    // onMount happens before the initial afterUpdate
    add_render_callback(() => {
        const new_on_destroy = on_mount.map(run).filter(is_function);
        if (on_destroy) {
            on_destroy.push(...new_on_destroy);
        }
        else {
            // Edge case - component was destroyed immediately,
            // most likely as a result of a binding initialising
            run_all(new_on_destroy);
        }
        component.$$.on_mount = [];
    });
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const prop_values = options.props || {};
    const $$ = component.$$ = {
        fragment: null,
        ctx: null,
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        before_update: [],
        after_update: [],
        context: new Map(parent_component ? parent_component.$$.context : []),
        // everything else
        callbacks: blank_object(),
        dirty
    };
    let ready = false;
    $$.ctx = instance
        ? instance(component, prop_values, (i, ret, value = ret) => {
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if ($$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(children(options.target));
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor);
        flush();
    }
    set_current_component(parent_component);
}
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set() {
        // overridden by instance, if it has props
    }
}

function dispatch_dev(type, detail) {
    document.dispatchEvent(custom_event(type, detail));
}
function append_dev(target, node) {
    dispatch_dev("SvelteDOMInsert", { target, node });
    append(target, node);
}
function insert_dev(target, node, anchor) {
    dispatch_dev("SvelteDOMInsert", { target, node, anchor });
    insert(target, node, anchor);
}
function detach_dev(node) {
    dispatch_dev("SvelteDOMRemove", { node });
    detach(node);
}
function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
    const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
    if (has_prevent_default)
        modifiers.push('preventDefault');
    if (has_stop_propagation)
        modifiers.push('stopPropagation');
    dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
    const dispose = listen(node, event, handler, options);
    return () => {
        dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
        dispose();
    };
}
function attr_dev(node, attribute, value) {
    attr(node, attribute, value);
    if (value == null)
        dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
    else
        dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
}
function prop_dev(node, property, value) {
    node[property] = value;
    dispatch_dev("SvelteDOMSetProperty", { node, property, value });
}
function set_data_dev(text, data) {
    data = '' + data;
    if (text.data === data)
        return;
    dispatch_dev("SvelteDOMSetData", { node: text, data });
    text.data = data;
}
class SvelteComponentDev extends SvelteComponent {
    constructor(options) {
        if (!options || (!options.target && !options.$$inline)) {
            throw new Error(`'target' is a required option`);
        }
        super();
    }
    $destroy() {
        super.$destroy();
        this.$destroy = () => {
            console.warn(`Component was already destroyed`); // eslint-disable-line no-console
        };
    }
}

const subscriber_queue = [];
/**
 * Create a `Writable` store that allows both updating and reading by subscription.
 * @param {*=}value initial value
 * @param {StartStopNotifier=}start start and stop notifications for subscriptions
 */
function writable(value, start = noop) {
    let stop;
    const subscribers = [];
    function set(new_value) {
        if (safe_not_equal(value, new_value)) {
            value = new_value;
            if (stop) { // store is ready
                const run_queue = !subscriber_queue.length;
                for (let i = 0; i < subscribers.length; i += 1) {
                    const s = subscribers[i];
                    s[1]();
                    subscriber_queue.push(s, value);
                }
                if (run_queue) {
                    for (let i = 0; i < subscriber_queue.length; i += 2) {
                        subscriber_queue[i][0](subscriber_queue[i + 1]);
                    }
                    subscriber_queue.length = 0;
                }
            }
        }
    }
    function update(fn) {
        set(fn(value));
    }
    function subscribe(run, invalidate = noop) {
        const subscriber = [run, invalidate];
        subscribers.push(subscriber);
        if (subscribers.length === 1) {
            stop = start(set) || noop;
        }
        run(value);
        return () => {
            const index = subscribers.indexOf(subscriber);
            if (index !== -1) {
                subscribers.splice(index, 1);
            }
            if (subscribers.length === 0) {
                stop();
                stop = null;
            }
        };
    }
    return { set, update, subscribe };
}

function min(val, args) {
  const minValue = parseFloat(args[0]);
  const value = isNaN(val) ? val.length : parseFloat(val);

  return value >= minValue;
}

function max(val, args) {
  const maxValue = parseFloat(args[0]);
  const value = isNaN(val) ? val.length : parseFloat(val);

  return isNaN(value) ? true : value <= maxValue;
}

function between(val, args) {
  return min(val, [args[0]]) && max(val, [args[1]]);
}

function email(val, args) {
  const regex = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

  return val && regex.test(val);
}

function required(val, args) {
  if (
    val === undefined ||
    val === null ||
    val === "undefined" ||
    val === "null"
  )
    return false;

  if (typeof val === "string") {
    const tmp = val.replace(/\s/g, "");

    return tmp.length > 0;
  }

  return true;
}

function url(val, args) {
  const regex = (/(https?|ftp|git|svn):\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-z]{2,63}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/i);
  return regex.test(url);
}

function equal(val, args) {
  return val === args[0];
}



var rules = /*#__PURE__*/Object.freeze({
    __proto__: null,
    between: between,
    email: email,
    max: max,
    min: min,
    required: required,
    url: url,
    equal: equal
});

/**
 * Validation fields.
 * @param {object fields to validate} fn
 * @param {default fields with config} storeValues
 */
function validateFields(fn, storeValues) {
  let fields = fn.call();
  let valid = true;
  Object.keys(fields).map(key => {
    const field = fields[key];
    if (field.validators) {
      const statusObjField = validate(field);
      fields[key] = { ...fields[key], ...statusObjField };
      if (statusObjField.validation.errors.length > 0) {
        valid = false;
      }
    } else {
      fields[key] = {
        ...fields[key],
        validation: { errors: [], dirty: false }
      };
    }
  });

  fields = { ...fields, valid };
  storeValues.set(fields);
}

/**
 * Validate field by rule.
 * @param {configs field} field
 */
function validate(field) {
  const { value, validators } = field;
  let valid = true;
  let rule;
  let errors = [];

  validators.map(validator => {
    if (typeof validator === "function") {
      valid = validator.call();
      rule = validator.name;
    } else {
      const args = validator.split(/:/g);
      rule = args.shift();
      valid = rules[rule].call(null, value, args);
    }
    if (!valid) {
      errors = [...errors, rule];
    }
  });

  return { ...field, validation: { errors, dirty: errors.length > 0 } };
}

/**
 * Validate fields form and store status.
 * @param {object fields to validate} fn
 */
function validator(fn) {
  const storeValues = writable({ valid: true });
  afterUpdate(() => validateFields(fn, storeValues));
  return storeValues;
}

const valuesForm = writable({
  isValidForm: true,
  values: {}
});

/* src/Components/Tag.svelte generated by Svelte v3.16.0 */

const file = "src/Components/Tag.svelte";

// (19:0) {:else}
function create_else_block(ctx) {
	let div;
	let div_class_value;
	let current;
	const default_slot_template = /*$$slots*/ ctx[3].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[2], null);

	const block = {
		c: function create() {
			div = element("div");
			if (default_slot) default_slot.c();
			this.h();
		},
		l: function claim(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			if (default_slot) default_slot.l(div_nodes);
			div_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(div, "class", div_class_value = /*classes*/ ctx[1].length > 0
			? /*classes*/ ctx[1]
			: null);

			add_location(div, file, 19, 2, 416);
		},
		m: function mount(target, anchor) {
			insert_dev(target, div, anchor);

			if (default_slot) {
				default_slot.m(div, null);
			}

			current = true;
		},
		p: function update(ctx, dirty) {
			if (default_slot && default_slot.p && dirty & /*$$scope*/ 4) {
				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[2], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[2], dirty, null));
			}

			if (!current || dirty & /*classes*/ 2 && div_class_value !== (div_class_value = /*classes*/ ctx[1].length > 0
			? /*classes*/ ctx[1]
			: null)) {
				attr_dev(div, "class", div_class_value);
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(div);
			if (default_slot) default_slot.d(detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_else_block.name,
		type: "else",
		source: "(19:0) {:else}",
		ctx
	});

	return block;
}

// (15:27) 
function create_if_block_2(ctx) {
	let strong;
	let strong_class_value;
	let current;
	const default_slot_template = /*$$slots*/ ctx[3].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[2], null);

	const block = {
		c: function create() {
			strong = element("strong");
			if (default_slot) default_slot.c();
			this.h();
		},
		l: function claim(nodes) {
			strong = claim_element(nodes, "STRONG", { class: true });
			var strong_nodes = children(strong);
			if (default_slot) default_slot.l(strong_nodes);
			strong_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(strong, "class", strong_class_value = /*classes*/ ctx[1].length > 0
			? /*classes*/ ctx[1]
			: null);

			add_location(strong, file, 15, 2, 328);
		},
		m: function mount(target, anchor) {
			insert_dev(target, strong, anchor);

			if (default_slot) {
				default_slot.m(strong, null);
			}

			current = true;
		},
		p: function update(ctx, dirty) {
			if (default_slot && default_slot.p && dirty & /*$$scope*/ 4) {
				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[2], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[2], dirty, null));
			}

			if (!current || dirty & /*classes*/ 2 && strong_class_value !== (strong_class_value = /*classes*/ ctx[1].length > 0
			? /*classes*/ ctx[1]
			: null)) {
				attr_dev(strong, "class", strong_class_value);
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(strong);
			if (default_slot) default_slot.d(detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_2.name,
		type: "if",
		source: "(15:27) ",
		ctx
	});

	return block;
}

// (11:26) 
function create_if_block_1(ctx) {
	let small;
	let small_class_value;
	let current;
	const default_slot_template = /*$$slots*/ ctx[3].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[2], null);

	const block = {
		c: function create() {
			small = element("small");
			if (default_slot) default_slot.c();
			this.h();
		},
		l: function claim(nodes) {
			small = claim_element(nodes, "SMALL", { class: true });
			var small_nodes = children(small);
			if (default_slot) default_slot.l(small_nodes);
			small_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(small, "class", small_class_value = /*classes*/ ctx[1].length > 0
			? /*classes*/ ctx[1]
			: null);

			add_location(small, file, 11, 2, 222);
		},
		m: function mount(target, anchor) {
			insert_dev(target, small, anchor);

			if (default_slot) {
				default_slot.m(small, null);
			}

			current = true;
		},
		p: function update(ctx, dirty) {
			if (default_slot && default_slot.p && dirty & /*$$scope*/ 4) {
				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[2], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[2], dirty, null));
			}

			if (!current || dirty & /*classes*/ 2 && small_class_value !== (small_class_value = /*classes*/ ctx[1].length > 0
			? /*classes*/ ctx[1]
			: null)) {
				attr_dev(small, "class", small_class_value);
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(small);
			if (default_slot) default_slot.d(detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_1.name,
		type: "if",
		source: "(11:26) ",
		ctx
	});

	return block;
}

// (7:0) {#if tag === 'span'}
function create_if_block(ctx) {
	let span;
	let span_class_value;
	let current;
	const default_slot_template = /*$$slots*/ ctx[3].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[2], null);

	const block = {
		c: function create() {
			span = element("span");
			if (default_slot) default_slot.c();
			this.h();
		},
		l: function claim(nodes) {
			span = claim_element(nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			if (default_slot) default_slot.l(span_nodes);
			span_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(span, "class", span_class_value = /*classes*/ ctx[1].length > 0
			? /*classes*/ ctx[1]
			: null);

			add_location(span, file, 7, 2, 119);
		},
		m: function mount(target, anchor) {
			insert_dev(target, span, anchor);

			if (default_slot) {
				default_slot.m(span, null);
			}

			current = true;
		},
		p: function update(ctx, dirty) {
			if (default_slot && default_slot.p && dirty & /*$$scope*/ 4) {
				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[2], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[2], dirty, null));
			}

			if (!current || dirty & /*classes*/ 2 && span_class_value !== (span_class_value = /*classes*/ ctx[1].length > 0
			? /*classes*/ ctx[1]
			: null)) {
				attr_dev(span, "class", span_class_value);
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(span);
			if (default_slot) default_slot.d(detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block.name,
		type: "if",
		source: "(7:0) {#if tag === 'span'}",
		ctx
	});

	return block;
}

function create_fragment(ctx) {
	let current_block_type_index;
	let if_block;
	let if_block_anchor;
	let current;
	const if_block_creators = [create_if_block, create_if_block_1, create_if_block_2, create_else_block];
	const if_blocks = [];

	function select_block_type(ctx, dirty) {
		if (/*tag*/ ctx[0] === "span") return 0;
		if (/*tag*/ ctx[0] === "small") return 1;
		if (/*tag*/ ctx[0] === "strong") return 2;
		return 3;
	}

	current_block_type_index = select_block_type(ctx);
	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	const block = {
		c: function create() {
			if_block.c();
			if_block_anchor = empty();
		},
		l: function claim(nodes) {
			if_block.l(nodes);
			if_block_anchor = empty();
		},
		m: function mount(target, anchor) {
			if_blocks[current_block_type_index].m(target, anchor);
			insert_dev(target, if_block_anchor, anchor);
			current = true;
		},
		p: function update(ctx, [dirty]) {
			let previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx);

			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(ctx, dirty);
			} else {
				group_outros();

				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});

				check_outros();
				if_block = if_blocks[current_block_type_index];

				if (!if_block) {
					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block.c();
				}

				transition_in(if_block, 1);
				if_block.m(if_block_anchor.parentNode, if_block_anchor);
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o: function outro(local) {
			transition_out(if_block);
			current = false;
		},
		d: function destroy(detaching) {
			if_blocks[current_block_type_index].d(detaching);
			if (detaching) detach_dev(if_block_anchor);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance($$self, $$props, $$invalidate) {
	let { tag = "div" } = $$props;
	let { classes = [] } = $$props;
	const writable_props = ["tag", "classes"];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Tag> was created with unknown prop '${key}'`);
	});

	let { $$slots = {}, $$scope } = $$props;

	$$self.$set = $$props => {
		if ("tag" in $$props) $$invalidate(0, tag = $$props.tag);
		if ("classes" in $$props) $$invalidate(1, classes = $$props.classes);
		if ("$$scope" in $$props) $$invalidate(2, $$scope = $$props.$$scope);
	};

	$$self.$capture_state = () => {
		return { tag, classes };
	};

	$$self.$inject_state = $$props => {
		if ("tag" in $$props) $$invalidate(0, tag = $$props.tag);
		if ("classes" in $$props) $$invalidate(1, classes = $$props.classes);
	};

	return [tag, classes, $$scope, $$slots];
}

class Tag extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, { tag: 0, classes: 1 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "Tag",
			options,
			id: create_fragment.name
		});
	}

	get tag() {
		throw new Error("<Tag>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set tag(value) {
		throw new Error("<Tag>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get classes() {
		throw new Error("<Tag>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set classes(value) {
		throw new Error("<Tag>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/Components/Input.svelte generated by Svelte v3.16.0 */
const file$1 = "src/Components/Input.svelte";

function create_fragment$1(ctx) {
	let input;
	let dispose;

	const block = {
		c: function create() {
			input = element("input");
			this.h();
		},
		l: function claim(nodes) {
			input = claim_element(nodes, "INPUT", {
				type: true,
				id: true,
				name: true,
				value: true,
				class: true,
				placeholder: true,
				disabled: true,
				min: true,
				max: true,
				step: true,
				autocomplete: true
			});

			this.h();
		},
		h: function hydrate() {
			attr_dev(input, "type", /*type*/ ctx[0]);
			attr_dev(input, "id", /*id*/ ctx[2]);
			attr_dev(input, "name", /*name*/ ctx[3]);
			input.value = /*value*/ ctx[1];
			attr_dev(input, "class", /*classe*/ ctx[4]);
			attr_dev(input, "placeholder", /*placeholder*/ ctx[9]);
			input.disabled = /*disabled*/ ctx[10];
			attr_dev(input, "min", /*min*/ ctx[5]);
			attr_dev(input, "max", /*max*/ ctx[6]);
			attr_dev(input, "step", /*step*/ ctx[7]);
			attr_dev(input, "autocomplete", /*autocomplete*/ ctx[8]);
			add_location(input, file$1, 33, 0, 828);
			dispose = listen_dev(input, "input", /*onChangerValue*/ ctx[11], false, false, false);
		},
		m: function mount(target, anchor) {
			insert_dev(target, input, anchor);
		},
		p: function update(ctx, [dirty]) {
			if (dirty & /*type*/ 1) {
				attr_dev(input, "type", /*type*/ ctx[0]);
			}

			if (dirty & /*id*/ 4) {
				attr_dev(input, "id", /*id*/ ctx[2]);
			}

			if (dirty & /*name*/ 8) {
				attr_dev(input, "name", /*name*/ ctx[3]);
			}

			if (dirty & /*value*/ 2) {
				prop_dev(input, "value", /*value*/ ctx[1]);
			}

			if (dirty & /*classe*/ 16) {
				attr_dev(input, "class", /*classe*/ ctx[4]);
			}

			if (dirty & /*placeholder*/ 512) {
				attr_dev(input, "placeholder", /*placeholder*/ ctx[9]);
			}

			if (dirty & /*disabled*/ 1024) {
				prop_dev(input, "disabled", /*disabled*/ ctx[10]);
			}

			if (dirty & /*min*/ 32) {
				attr_dev(input, "min", /*min*/ ctx[5]);
			}

			if (dirty & /*max*/ 64) {
				attr_dev(input, "max", /*max*/ ctx[6]);
			}

			if (dirty & /*step*/ 128) {
				attr_dev(input, "step", /*step*/ ctx[7]);
			}

			if (dirty & /*autocomplete*/ 256) {
				attr_dev(input, "autocomplete", /*autocomplete*/ ctx[8]);
			}
		},
		i: noop,
		o: noop,
		d: function destroy(detaching) {
			if (detaching) detach_dev(input);
			dispose();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$1.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$1($$self, $$props, $$invalidate) {
	let { type = "text" } = $$props;
	let { id = "" } = $$props;
	let { name = "" } = $$props;
	let { value = "" } = $$props;
	let { classe = "" } = $$props;
	let { min = null } = $$props;
	let { max = null } = $$props;
	let { step = null } = $$props;
	let { autocomplete = "off" } = $$props;
	let { placeholder = null } = $$props;
	let { disabled = null } = $$props;
	const dispatch = createEventDispatcher();

	function onChangerValue(event) {
		dispatch("changeValue", { name, value: event.target.value });
	}

	onMount(() => {
		$$invalidate(0, type = type === "datetimelocal" ? "datetime-local" : type);
		$$invalidate(1, value = type === "range" ? $$invalidate(1, value = min) : value);
		dispatch("changeValue", { name, value });
	});

	const writable_props = [
		"type",
		"id",
		"name",
		"value",
		"classe",
		"min",
		"max",
		"step",
		"autocomplete",
		"placeholder",
		"disabled"
	];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Input> was created with unknown prop '${key}'`);
	});

	$$self.$set = $$props => {
		if ("type" in $$props) $$invalidate(0, type = $$props.type);
		if ("id" in $$props) $$invalidate(2, id = $$props.id);
		if ("name" in $$props) $$invalidate(3, name = $$props.name);
		if ("value" in $$props) $$invalidate(1, value = $$props.value);
		if ("classe" in $$props) $$invalidate(4, classe = $$props.classe);
		if ("min" in $$props) $$invalidate(5, min = $$props.min);
		if ("max" in $$props) $$invalidate(6, max = $$props.max);
		if ("step" in $$props) $$invalidate(7, step = $$props.step);
		if ("autocomplete" in $$props) $$invalidate(8, autocomplete = $$props.autocomplete);
		if ("placeholder" in $$props) $$invalidate(9, placeholder = $$props.placeholder);
		if ("disabled" in $$props) $$invalidate(10, disabled = $$props.disabled);
	};

	$$self.$capture_state = () => {
		return {
			type,
			id,
			name,
			value,
			classe,
			min,
			max,
			step,
			autocomplete,
			placeholder,
			disabled
		};
	};

	$$self.$inject_state = $$props => {
		if ("type" in $$props) $$invalidate(0, type = $$props.type);
		if ("id" in $$props) $$invalidate(2, id = $$props.id);
		if ("name" in $$props) $$invalidate(3, name = $$props.name);
		if ("value" in $$props) $$invalidate(1, value = $$props.value);
		if ("classe" in $$props) $$invalidate(4, classe = $$props.classe);
		if ("min" in $$props) $$invalidate(5, min = $$props.min);
		if ("max" in $$props) $$invalidate(6, max = $$props.max);
		if ("step" in $$props) $$invalidate(7, step = $$props.step);
		if ("autocomplete" in $$props) $$invalidate(8, autocomplete = $$props.autocomplete);
		if ("placeholder" in $$props) $$invalidate(9, placeholder = $$props.placeholder);
		if ("disabled" in $$props) $$invalidate(10, disabled = $$props.disabled);
	};

	return [
		type,
		value,
		id,
		name,
		classe,
		min,
		max,
		step,
		autocomplete,
		placeholder,
		disabled,
		onChangerValue
	];
}

class Input extends SvelteComponentDev {
	constructor(options) {
		super(options);

		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
			type: 0,
			id: 2,
			name: 3,
			value: 1,
			classe: 4,
			min: 5,
			max: 6,
			step: 7,
			autocomplete: 8,
			placeholder: 9,
			disabled: 10
		});

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "Input",
			options,
			id: create_fragment$1.name
		});
	}

	get type() {
		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set type(value) {
		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get id() {
		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set id(value) {
		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get name() {
		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set name(value) {
		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get value() {
		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set value(value) {
		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get classe() {
		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set classe(value) {
		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get min() {
		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set min(value) {
		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get max() {
		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set max(value) {
		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get step() {
		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set step(value) {
		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get autocomplete() {
		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set autocomplete(value) {
		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get placeholder() {
		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set placeholder(value) {
		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get disabled() {
		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set disabled(value) {
		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/Components/Textarea.svelte generated by Svelte v3.16.0 */
const file$2 = "src/Components/Textarea.svelte";

function create_fragment$2(ctx) {
	let textarea;
	let textarea_value_value;
	let dispose;

	const block = {
		c: function create() {
			textarea = element("textarea");
			this.h();
		},
		l: function claim(nodes) {
			textarea = claim_element(nodes, "TEXTAREA", {
				id: true,
				name: true,
				class: true,
				required: true,
				disabled: true,
				rows: true,
				cols: true,
				value: true
			});

			children(textarea).forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(textarea, "id", /*id*/ ctx[0]);
			attr_dev(textarea, "name", /*name*/ ctx[1]);
			attr_dev(textarea, "class", /*classe*/ ctx[3]);
			textarea.required = /*required*/ ctx[6];
			textarea.disabled = /*disabled*/ ctx[7];
			attr_dev(textarea, "rows", /*rows*/ ctx[4]);
			attr_dev(textarea, "cols", /*cols*/ ctx[5]);
			textarea.value = textarea_value_value = "\n  " + /*value*/ ctx[2] + "\n";
			add_location(textarea, file$2, 28, 0, 611);
			dispose = listen_dev(textarea, "input", /*onChangerValue*/ ctx[8], false, false, false);
		},
		m: function mount(target, anchor) {
			insert_dev(target, textarea, anchor);
		},
		p: function update(ctx, [dirty]) {
			if (dirty & /*id*/ 1) {
				attr_dev(textarea, "id", /*id*/ ctx[0]);
			}

			if (dirty & /*name*/ 2) {
				attr_dev(textarea, "name", /*name*/ ctx[1]);
			}

			if (dirty & /*classe*/ 8) {
				attr_dev(textarea, "class", /*classe*/ ctx[3]);
			}

			if (dirty & /*required*/ 64) {
				prop_dev(textarea, "required", /*required*/ ctx[6]);
			}

			if (dirty & /*disabled*/ 128) {
				prop_dev(textarea, "disabled", /*disabled*/ ctx[7]);
			}

			if (dirty & /*rows*/ 16) {
				attr_dev(textarea, "rows", /*rows*/ ctx[4]);
			}

			if (dirty & /*cols*/ 32) {
				attr_dev(textarea, "cols", /*cols*/ ctx[5]);
			}

			if (dirty & /*value*/ 4 && textarea_value_value !== (textarea_value_value = "\n  " + /*value*/ ctx[2] + "\n")) {
				prop_dev(textarea, "value", textarea_value_value);
			}
		},
		i: noop,
		o: noop,
		d: function destroy(detaching) {
			if (detaching) detach_dev(textarea);
			dispose();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$2.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$2($$self, $$props, $$invalidate) {
	let { id = "" } = $$props;
	let { name = "" } = $$props;
	let { value = "" } = $$props;
	let { classe = "" } = $$props;
	let { rows = 4 } = $$props;
	let { cols = 50 } = $$props;
	let { required = false } = $$props;
	let { disabled = false } = $$props;
	const dispatch = createEventDispatcher();

	function onChangerValue(event) {
		dispatch("changeValue", { name, value: event.target.value });
	}

	onMount(() => {
		dispatch("changeValue", { name, value });
	});

	const writable_props = ["id", "name", "value", "classe", "rows", "cols", "required", "disabled"];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Textarea> was created with unknown prop '${key}'`);
	});

	$$self.$set = $$props => {
		if ("id" in $$props) $$invalidate(0, id = $$props.id);
		if ("name" in $$props) $$invalidate(1, name = $$props.name);
		if ("value" in $$props) $$invalidate(2, value = $$props.value);
		if ("classe" in $$props) $$invalidate(3, classe = $$props.classe);
		if ("rows" in $$props) $$invalidate(4, rows = $$props.rows);
		if ("cols" in $$props) $$invalidate(5, cols = $$props.cols);
		if ("required" in $$props) $$invalidate(6, required = $$props.required);
		if ("disabled" in $$props) $$invalidate(7, disabled = $$props.disabled);
	};

	$$self.$capture_state = () => {
		return {
			id,
			name,
			value,
			classe,
			rows,
			cols,
			required,
			disabled
		};
	};

	$$self.$inject_state = $$props => {
		if ("id" in $$props) $$invalidate(0, id = $$props.id);
		if ("name" in $$props) $$invalidate(1, name = $$props.name);
		if ("value" in $$props) $$invalidate(2, value = $$props.value);
		if ("classe" in $$props) $$invalidate(3, classe = $$props.classe);
		if ("rows" in $$props) $$invalidate(4, rows = $$props.rows);
		if ("cols" in $$props) $$invalidate(5, cols = $$props.cols);
		if ("required" in $$props) $$invalidate(6, required = $$props.required);
		if ("disabled" in $$props) $$invalidate(7, disabled = $$props.disabled);
	};

	return [id, name, value, classe, rows, cols, required, disabled, onChangerValue];
}

class Textarea extends SvelteComponentDev {
	constructor(options) {
		super(options);

		init(this, options, instance$2, create_fragment$2, safe_not_equal, {
			id: 0,
			name: 1,
			value: 2,
			classe: 3,
			rows: 4,
			cols: 5,
			required: 6,
			disabled: 7
		});

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "Textarea",
			options,
			id: create_fragment$2.name
		});
	}

	get id() {
		throw new Error("<Textarea>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set id(value) {
		throw new Error("<Textarea>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get name() {
		throw new Error("<Textarea>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set name(value) {
		throw new Error("<Textarea>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get value() {
		throw new Error("<Textarea>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set value(value) {
		throw new Error("<Textarea>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get classe() {
		throw new Error("<Textarea>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set classe(value) {
		throw new Error("<Textarea>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get rows() {
		throw new Error("<Textarea>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set rows(value) {
		throw new Error("<Textarea>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get cols() {
		throw new Error("<Textarea>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set cols(value) {
		throw new Error("<Textarea>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get required() {
		throw new Error("<Textarea>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set required(value) {
		throw new Error("<Textarea>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get disabled() {
		throw new Error("<Textarea>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set disabled(value) {
		throw new Error("<Textarea>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/Components/Select.svelte generated by Svelte v3.16.0 */
const file$3 = "src/Components/Select.svelte";

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[7] = list[i];
	return child_ctx;
}

// (31:2) {:else}
function create_else_block$1(ctx) {
	let option;
	let t;

	const block = {
		c: function create() {
			option = element("option");
			t = text("Any");
			this.h();
		},
		l: function claim(nodes) {
			option = claim_element(nodes, "OPTION", { value: true });
			var option_nodes = children(option);
			t = claim_text(option_nodes, "Any");
			option_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			option.__value = "Any";
			option.value = option.__value;
			add_location(option, file$3, 31, 4, 788);
		},
		m: function mount(target, anchor) {
			insert_dev(target, option, anchor);
			append_dev(option, t);
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(option);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_else_block$1.name,
		type: "else",
		source: "(31:2) {:else}",
		ctx
	});

	return block;
}

// (29:2) {#each options as option (option.value)}
function create_each_block(key_1, ctx) {
	let option;
	let t_value = /*option*/ ctx[7].title + "";
	let t;
	let option_value_value;

	const block = {
		key: key_1,
		first: null,
		c: function create() {
			option = element("option");
			t = text(t_value);
			this.h();
		},
		l: function claim(nodes) {
			option = claim_element(nodes, "OPTION", { value: true });
			var option_nodes = children(option);
			t = claim_text(option_nodes, t_value);
			option_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			option.__value = option_value_value = /*option*/ ctx[7].value;
			option.value = option.__value;
			add_location(option, file$3, 29, 4, 721);
			this.first = option;
		},
		m: function mount(target, anchor) {
			insert_dev(target, option, anchor);
			append_dev(option, t);
		},
		p: function update(ctx, dirty) {
			if (dirty & /*options*/ 8 && t_value !== (t_value = /*option*/ ctx[7].title + "")) set_data_dev(t, t_value);

			if (dirty & /*options*/ 8 && option_value_value !== (option_value_value = /*option*/ ctx[7].value)) {
				prop_dev(option, "__value", option_value_value);
			}

			option.value = option.__value;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(option);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_each_block.name,
		type: "each",
		source: "(29:2) {#each options as option (option.value)}",
		ctx
	});

	return block;
}

function create_fragment$3(ctx) {
	let select;
	let each_blocks = [];
	let each_1_lookup = new Map();
	let dispose;
	let each_value = /*options*/ ctx[3];
	const get_key = ctx => /*option*/ ctx[7].value;

	for (let i = 0; i < each_value.length; i += 1) {
		let child_ctx = get_each_context(ctx, each_value, i);
		let key = get_key(child_ctx);
		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
	}

	let each_1_else = null;

	if (!each_value.length) {
		each_1_else = create_else_block$1(ctx);
		each_1_else.c();
	}

	const block = {
		c: function create() {
			select = element("select");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l: function claim(nodes) {
			select = claim_element(nodes, "SELECT", {
				id: true,
				name: true,
				class: true,
				disabled: true
			});

			var select_nodes = children(select);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(select_nodes);
			}

			select_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(select, "id", /*id*/ ctx[0]);
			attr_dev(select, "name", /*name*/ ctx[1]);
			attr_dev(select, "class", /*classe*/ ctx[2]);
			select.disabled = /*disabled*/ ctx[4];
			add_location(select, file$3, 27, 0, 602);
			dispose = listen_dev(select, "input", /*onChangeValue*/ ctx[5], false, false, false);
		},
		m: function mount(target, anchor) {
			insert_dev(target, select, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(select, null);
			}

			if (each_1_else) {
				each_1_else.m(select, null);
			}
		},
		p: function update(ctx, [dirty]) {
			const each_value = /*options*/ ctx[3];
			each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, select, destroy_block, create_each_block, null, get_each_context);

			if (each_value.length) {
				if (each_1_else) {
					each_1_else.d(1);
					each_1_else = null;
				}
			} else if (!each_1_else) {
				each_1_else = create_else_block$1(ctx);
				each_1_else.c();
				each_1_else.m(select, null);
			}

			if (dirty & /*id*/ 1) {
				attr_dev(select, "id", /*id*/ ctx[0]);
			}

			if (dirty & /*name*/ 2) {
				attr_dev(select, "name", /*name*/ ctx[1]);
			}

			if (dirty & /*classe*/ 4) {
				attr_dev(select, "class", /*classe*/ ctx[2]);
			}

			if (dirty & /*disabled*/ 16) {
				prop_dev(select, "disabled", /*disabled*/ ctx[4]);
			}
		},
		i: noop,
		o: noop,
		d: function destroy(detaching) {
			if (detaching) detach_dev(select);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].d();
			}

			if (each_1_else) each_1_else.d();
			dispose();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$3.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$3($$self, $$props, $$invalidate) {
	let { id = "" } = $$props;
	let { name = "" } = $$props;
	let { classe = "" } = $$props;
	let { options = [] } = $$props;
	let { disabled = false } = $$props;
	const dispatch = createEventDispatcher();

	function onChangeValue(event) {
		dispatch("changeValue", { name, value: event.target.value });
	}

	onMount(() => {
		if (options.length > 0) {
			dispatch("changeValue", { name, value: options[0].value });
		}
	});

	const writable_props = ["id", "name", "classe", "options", "disabled"];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Select> was created with unknown prop '${key}'`);
	});

	$$self.$set = $$props => {
		if ("id" in $$props) $$invalidate(0, id = $$props.id);
		if ("name" in $$props) $$invalidate(1, name = $$props.name);
		if ("classe" in $$props) $$invalidate(2, classe = $$props.classe);
		if ("options" in $$props) $$invalidate(3, options = $$props.options);
		if ("disabled" in $$props) $$invalidate(4, disabled = $$props.disabled);
	};

	$$self.$capture_state = () => {
		return { id, name, classe, options, disabled };
	};

	$$self.$inject_state = $$props => {
		if ("id" in $$props) $$invalidate(0, id = $$props.id);
		if ("name" in $$props) $$invalidate(1, name = $$props.name);
		if ("classe" in $$props) $$invalidate(2, classe = $$props.classe);
		if ("options" in $$props) $$invalidate(3, options = $$props.options);
		if ("disabled" in $$props) $$invalidate(4, disabled = $$props.disabled);
	};

	return [id, name, classe, options, disabled, onChangeValue];
}

class Select extends SvelteComponentDev {
	constructor(options) {
		super(options);

		init(this, options, instance$3, create_fragment$3, safe_not_equal, {
			id: 0,
			name: 1,
			classe: 2,
			options: 3,
			disabled: 4
		});

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "Select",
			options,
			id: create_fragment$3.name
		});
	}

	get id() {
		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set id(value) {
		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get name() {
		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set name(value) {
		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get classe() {
		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set classe(value) {
		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get options() {
		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set options(value) {
		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get disabled() {
		throw new Error("<Select>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set disabled(value) {
		throw new Error("<Select>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/Components/Radio.svelte generated by Svelte v3.16.0 */
const file$4 = "src/Components/Radio.svelte";

function get_each_context$1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[6] = list[i];
	child_ctx[8] = i;
	return child_ctx;
}

// (27:0) {#each radios as radio, i}
function create_each_block$1(ctx) {
	let div;
	let input;
	let input_id_value;
	let input_value_value;
	let input_checked_value;
	let t0;
	let span;
	let t1_value = /*radio*/ ctx[6].title + "";
	let t1;
	let t2;
	let div_class_value;
	let dispose;

	const block = {
		c: function create() {
			div = element("div");
			input = element("input");
			t0 = space();
			span = element("span");
			t1 = text(t1_value);
			t2 = space();
			this.h();
		},
		l: function claim(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);

			input = claim_element(div_nodes, "INPUT", {
				type: true,
				class: true,
				id: true,
				name: true,
				value: true,
				checked: true
			});

			t0 = claim_space(div_nodes);
			span = claim_element(div_nodes, "SPAN", {});
			var span_nodes = children(span);
			t1 = claim_text(span_nodes, t1_value);
			span_nodes.forEach(detach_dev);
			t2 = claim_space(div_nodes);
			div_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(input, "type", "radio");
			attr_dev(input, "class", /*classe*/ ctx[1]);
			attr_dev(input, "id", input_id_value = /*radio*/ ctx[6].id);
			attr_dev(input, "name", /*name*/ ctx[0]);
			input.value = input_value_value = /*radio*/ ctx[6].value;
			input.checked = input_checked_value = /*i*/ ctx[8] === 0;
			add_location(input, file$4, 28, 4, 683);
			add_location(span, file$4, 36, 4, 851);

			attr_dev(div, "class", div_class_value = /*aligne*/ ctx[2] === "inline"
			? "form-check-inline"
			: "form-check");

			add_location(div, file$4, 27, 2, 608);
			dispose = listen_dev(input, "input", /*onChangeValue*/ ctx[4], false, false, false);
		},
		m: function mount(target, anchor) {
			insert_dev(target, div, anchor);
			append_dev(div, input);
			append_dev(div, t0);
			append_dev(div, span);
			append_dev(span, t1);
			append_dev(div, t2);
		},
		p: function update(ctx, dirty) {
			if (dirty & /*classe*/ 2) {
				attr_dev(input, "class", /*classe*/ ctx[1]);
			}

			if (dirty & /*radios*/ 8 && input_id_value !== (input_id_value = /*radio*/ ctx[6].id)) {
				attr_dev(input, "id", input_id_value);
			}

			if (dirty & /*name*/ 1) {
				attr_dev(input, "name", /*name*/ ctx[0]);
			}

			if (dirty & /*radios*/ 8 && input_value_value !== (input_value_value = /*radio*/ ctx[6].value)) {
				prop_dev(input, "value", input_value_value);
			}

			if (dirty & /*radios*/ 8 && t1_value !== (t1_value = /*radio*/ ctx[6].title + "")) set_data_dev(t1, t1_value);

			if (dirty & /*aligne*/ 4 && div_class_value !== (div_class_value = /*aligne*/ ctx[2] === "inline"
			? "form-check-inline"
			: "form-check")) {
				attr_dev(div, "class", div_class_value);
			}
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(div);
			dispose();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_each_block$1.name,
		type: "each",
		source: "(27:0) {#each radios as radio, i}",
		ctx
	});

	return block;
}

function create_fragment$4(ctx) {
	let each_1_anchor;
	let each_value = /*radios*/ ctx[3];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
	}

	const block = {
		c: function create() {
			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			each_1_anchor = empty();
		},
		l: function claim(nodes) {
			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(nodes);
			}

			each_1_anchor = empty();
		},
		m: function mount(target, anchor) {
			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(target, anchor);
			}

			insert_dev(target, each_1_anchor, anchor);
		},
		p: function update(ctx, [dirty]) {
			if (dirty & /*aligne, radios, classe, name, onChangeValue*/ 31) {
				each_value = /*radios*/ ctx[3];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context$1(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block$1(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}
		},
		i: noop,
		o: noop,
		d: function destroy(detaching) {
			destroy_each(each_blocks, detaching);
			if (detaching) detach_dev(each_1_anchor);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$4.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$4($$self, $$props, $$invalidate) {
	let { name = "" } = $$props;
	let { classe = "" } = $$props;
	let { aligne = "default" } = $$props;
	let { radios = [] } = $$props;
	const dispatch = createEventDispatcher();

	function onChangeValue(event) {
		dispatch("changeValue", { name, value: event.target.value });
	}

	onMount(() => {
		if (radios.length > 0) {
			dispatch("changeValue", { name, value: radios[0].value });
		}
	});

	const writable_props = ["name", "classe", "aligne", "radios"];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Radio> was created with unknown prop '${key}'`);
	});

	$$self.$set = $$props => {
		if ("name" in $$props) $$invalidate(0, name = $$props.name);
		if ("classe" in $$props) $$invalidate(1, classe = $$props.classe);
		if ("aligne" in $$props) $$invalidate(2, aligne = $$props.aligne);
		if ("radios" in $$props) $$invalidate(3, radios = $$props.radios);
	};

	$$self.$capture_state = () => {
		return { name, classe, aligne, radios };
	};

	$$self.$inject_state = $$props => {
		if ("name" in $$props) $$invalidate(0, name = $$props.name);
		if ("classe" in $$props) $$invalidate(1, classe = $$props.classe);
		if ("aligne" in $$props) $$invalidate(2, aligne = $$props.aligne);
		if ("radios" in $$props) $$invalidate(3, radios = $$props.radios);
	};

	return [name, classe, aligne, radios, onChangeValue];
}

class Radio extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$4, create_fragment$4, safe_not_equal, { name: 0, classe: 1, aligne: 2, radios: 3 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "Radio",
			options,
			id: create_fragment$4.name
		});
	}

	get name() {
		throw new Error("<Radio>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set name(value) {
		throw new Error("<Radio>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get classe() {
		throw new Error("<Radio>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set classe(value) {
		throw new Error("<Radio>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get aligne() {
		throw new Error("<Radio>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set aligne(value) {
		throw new Error("<Radio>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get radios() {
		throw new Error("<Radio>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set radios(value) {
		throw new Error("<Radio>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/Components/Message.svelte generated by Svelte v3.16.0 */
const file$5 = "src/Components/Message.svelte";

// (30:2) {#if error}
function create_if_block$1(ctx) {
	let t_value = /*displayError*/ ctx[1](/*error*/ ctx[0]) + "";
	let t;

	const block = {
		c: function create() {
			t = text(t_value);
		},
		l: function claim(nodes) {
			t = claim_text(nodes, t_value);
		},
		m: function mount(target, anchor) {
			insert_dev(target, t, anchor);
		},
		p: function update(ctx, dirty) {
			if (dirty & /*error*/ 1 && t_value !== (t_value = /*displayError*/ ctx[1](/*error*/ ctx[0]) + "")) set_data_dev(t, t_value);
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(t);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block$1.name,
		type: "if",
		source: "(30:2) {#if error}",
		ctx
	});

	return block;
}

function create_fragment$5(ctx) {
	let div;
	let if_block = /*error*/ ctx[0] && create_if_block$1(ctx);

	const block = {
		c: function create() {
			div = element("div");
			if (if_block) if_block.c();
			this.h();
		},
		l: function claim(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			if (if_block) if_block.l(div_nodes);
			div_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(div, "class", "invalid-feedback");
			add_location(div, file$5, 28, 0, 856);
		},
		m: function mount(target, anchor) {
			insert_dev(target, div, anchor);
			if (if_block) if_block.m(div, null);
		},
		p: function update(ctx, [dirty]) {
			if (/*error*/ ctx[0]) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block$1(ctx);
					if_block.c();
					if_block.m(div, null);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},
		i: noop,
		o: noop,
		d: function destroy(detaching) {
			if (detaching) detach_dev(div);
			if (if_block) if_block.d();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$5.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$5($$self, $$props, $$invalidate) {
	let { error } = $$props;
	let { messages = {} } = $$props;

	const rules = {
		required: "This field is required",
		min: "This field must be more characters long",
		max: "This field must be more characters long",
		between: "This field must be between values defined",
		equal: "This field must be equal to value defined",
		email: "This email format is not valid",
		url: "This field must be an url valid",
		custom_rule: "Error"
	};

	function displayError(rule) {
		let message = "";

		if (messages[rule]) {
			message += messages[rule] ? messages[rule] : rules["custom_rule"];
		} else {
			message += rules[rule] ? rules[rule] : rules["custom_rule"];
		}

		return message;
	}

	const writable_props = ["error", "messages"];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Message> was created with unknown prop '${key}'`);
	});

	$$self.$set = $$props => {
		if ("error" in $$props) $$invalidate(0, error = $$props.error);
		if ("messages" in $$props) $$invalidate(2, messages = $$props.messages);
	};

	$$self.$capture_state = () => {
		return { error, messages };
	};

	$$self.$inject_state = $$props => {
		if ("error" in $$props) $$invalidate(0, error = $$props.error);
		if ("messages" in $$props) $$invalidate(2, messages = $$props.messages);
	};

	return [error, displayError, messages];
}

class Message extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$5, create_fragment$5, safe_not_equal, { error: 0, messages: 2 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "Message",
			options,
			id: create_fragment$5.name
		});

		const { ctx } = this.$$;
		const props = options.props || ({});

		if (/*error*/ ctx[0] === undefined && !("error" in props)) {
			console.warn("<Message> was created without expected prop 'error'");
		}
	}

	get error() {
		throw new Error("<Message>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set error(value) {
		throw new Error("<Message>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	get messages() {
		throw new Error("<Message>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set messages(value) {
		throw new Error("<Message>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

/* src/Components/Field.svelte generated by Svelte v3.16.0 */
const file$6 = "src/Components/Field.svelte";

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[12] = list[i];
	child_ctx[14] = i;
	return child_ctx;
}

function get_each_context$2(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[9] = list[i];
	return child_ctx;
}

// (70:4) {#if field.label}
function create_if_block_8(ctx) {
	let label;
	let t_value = /*field*/ ctx[9].label + "";
	let t;
	let label_for_value;

	const block = {
		c: function create() {
			label = element("label");
			t = text(t_value);
			this.h();
		},
		l: function claim(nodes) {
			label = claim_element(nodes, "LABEL", { for: true });
			var label_nodes = children(label);
			t = claim_text(label_nodes, t_value);
			label_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(label, "for", label_for_value = /*field*/ ctx[9].id);
			add_location(label, file$6, 70, 6, 2086);
		},
		m: function mount(target, anchor) {
			insert_dev(target, label, anchor);
			append_dev(label, t);
		},
		p: function update(ctx, dirty) {
			if (dirty & /*fields*/ 1 && t_value !== (t_value = /*field*/ ctx[9].label + "")) set_data_dev(t, t_value);

			if (dirty & /*fields*/ 1 && label_for_value !== (label_for_value = /*field*/ ctx[9].id)) {
				attr_dev(label, "for", label_for_value);
			}
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(label);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_8.name,
		type: "if",
		source: "(70:4) {#if field.label}",
		ctx
	});

	return block;
}

// (106:37) 
function create_if_block_7(ctx) {
	let current;

	const radio = new Radio({
			props: {
				name: /*field*/ ctx[9].name,
				classe: /*field*/ ctx[9].class,
				radios: /*field*/ ctx[9].radios,
				aligne: /*field*/ ctx[9].aligne
			},
			$$inline: true
		});

	radio.$on("changeValue", /*changeValueHander*/ ctx[3]);

	const block = {
		c: function create() {
			create_component(radio.$$.fragment);
		},
		l: function claim(nodes) {
			claim_component(radio.$$.fragment, nodes);
		},
		m: function mount(target, anchor) {
			mount_component(radio, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const radio_changes = {};
			if (dirty & /*fields*/ 1) radio_changes.name = /*field*/ ctx[9].name;
			if (dirty & /*fields*/ 1) radio_changes.classe = /*field*/ ctx[9].class;
			if (dirty & /*fields*/ 1) radio_changes.radios = /*field*/ ctx[9].radios;
			if (dirty & /*fields*/ 1) radio_changes.aligne = /*field*/ ctx[9].aligne;
			radio.$set(radio_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(radio.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(radio.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(radio, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_7.name,
		type: "if",
		source: "(106:37) ",
		ctx
	});

	return block;
}

// (98:38) 
function create_if_block_6(ctx) {
	let current;

	const select = new Select({
			props: {
				id: /*field*/ ctx[9].id,
				name: /*field*/ ctx[9].name,
				classe: /*field*/ ctx[9].class,
				options: /*field*/ ctx[9].options,
				disabled: /*field*/ ctx[9].disabled
			},
			$$inline: true
		});

	select.$on("changeValue", /*changeValueHander*/ ctx[3]);

	const block = {
		c: function create() {
			create_component(select.$$.fragment);
		},
		l: function claim(nodes) {
			claim_component(select.$$.fragment, nodes);
		},
		m: function mount(target, anchor) {
			mount_component(select, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const select_changes = {};
			if (dirty & /*fields*/ 1) select_changes.id = /*field*/ ctx[9].id;
			if (dirty & /*fields*/ 1) select_changes.name = /*field*/ ctx[9].name;
			if (dirty & /*fields*/ 1) select_changes.classe = /*field*/ ctx[9].class;
			if (dirty & /*fields*/ 1) select_changes.options = /*field*/ ctx[9].options;
			if (dirty & /*fields*/ 1) select_changes.disabled = /*field*/ ctx[9].disabled;
			select.$set(select_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(select.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(select.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(select, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_6.name,
		type: "if",
		source: "(98:38) ",
		ctx
	});

	return block;
}

// (88:40) 
function create_if_block_5(ctx) {
	let current;

	const textarea = new Textarea({
			props: {
				id: /*field*/ ctx[9].id,
				name: /*field*/ ctx[9].name,
				value: /*field*/ ctx[9].value,
				classe: /*field*/ ctx[9].class,
				rows: /*field*/ ctx[9].rows,
				cols: /*field*/ ctx[9].cols,
				disabled: /*field*/ ctx[9].disabled
			},
			$$inline: true
		});

	textarea.$on("changeValue", /*changeValueHander*/ ctx[3]);

	const block = {
		c: function create() {
			create_component(textarea.$$.fragment);
		},
		l: function claim(nodes) {
			claim_component(textarea.$$.fragment, nodes);
		},
		m: function mount(target, anchor) {
			mount_component(textarea, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const textarea_changes = {};
			if (dirty & /*fields*/ 1) textarea_changes.id = /*field*/ ctx[9].id;
			if (dirty & /*fields*/ 1) textarea_changes.name = /*field*/ ctx[9].name;
			if (dirty & /*fields*/ 1) textarea_changes.value = /*field*/ ctx[9].value;
			if (dirty & /*fields*/ 1) textarea_changes.classe = /*field*/ ctx[9].class;
			if (dirty & /*fields*/ 1) textarea_changes.rows = /*field*/ ctx[9].rows;
			if (dirty & /*fields*/ 1) textarea_changes.cols = /*field*/ ctx[9].cols;
			if (dirty & /*fields*/ 1) textarea_changes.disabled = /*field*/ ctx[9].disabled;
			textarea.$set(textarea_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(textarea.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(textarea.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(textarea, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_5.name,
		type: "if",
		source: "(88:40) ",
		ctx
	});

	return block;
}

// (74:4) {#if field.type === 'text' || field.type === 'password' || field.type === 'email' || field.type === 'tel' || field.type === 'number' || field.type === 'range' || field.type === 'date' || field.type === 'color' || field.type === 'file' || field.type === 'datetimelocal'}
function create_if_block_4(ctx) {
	let current;

	const input = new Input({
			props: {
				type: /*field*/ ctx[9].type,
				id: /*field*/ ctx[9].id,
				name: /*field*/ ctx[9].name,
				value: /*field*/ ctx[9].value,
				classe: /*field*/ ctx[9].class,
				placeholder: /*field*/ ctx[9].placeholder,
				min: /*field*/ ctx[9].min,
				max: /*field*/ ctx[9].max,
				step: /*field*/ ctx[9].step,
				autocomplete: /*field*/ ctx[9].autocomplete,
				disabled: /*field*/ ctx[9].disabled
			},
			$$inline: true
		});

	input.$on("changeValue", /*changeValueHander*/ ctx[3]);

	const block = {
		c: function create() {
			create_component(input.$$.fragment);
		},
		l: function claim(nodes) {
			claim_component(input.$$.fragment, nodes);
		},
		m: function mount(target, anchor) {
			mount_component(input, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const input_changes = {};
			if (dirty & /*fields*/ 1) input_changes.type = /*field*/ ctx[9].type;
			if (dirty & /*fields*/ 1) input_changes.id = /*field*/ ctx[9].id;
			if (dirty & /*fields*/ 1) input_changes.name = /*field*/ ctx[9].name;
			if (dirty & /*fields*/ 1) input_changes.value = /*field*/ ctx[9].value;
			if (dirty & /*fields*/ 1) input_changes.classe = /*field*/ ctx[9].class;
			if (dirty & /*fields*/ 1) input_changes.placeholder = /*field*/ ctx[9].placeholder;
			if (dirty & /*fields*/ 1) input_changes.min = /*field*/ ctx[9].min;
			if (dirty & /*fields*/ 1) input_changes.max = /*field*/ ctx[9].max;
			if (dirty & /*fields*/ 1) input_changes.step = /*field*/ ctx[9].step;
			if (dirty & /*fields*/ 1) input_changes.autocomplete = /*field*/ ctx[9].autocomplete;
			if (dirty & /*fields*/ 1) input_changes.disabled = /*field*/ ctx[9].disabled;
			input.$set(input_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(input.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(input.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(input, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_4.name,
		type: "if",
		source: "(74:4) {#if field.type === 'text' || field.type === 'password' || field.type === 'email' || field.type === 'tel' || field.type === 'number' || field.type === 'range' || field.type === 'date' || field.type === 'color' || field.type === 'file' || field.type === 'datetimelocal'}",
		ctx
	});

	return block;
}

// (115:4) {#if field.description}
function create_if_block_2$1(ctx) {
	let if_block_anchor;
	let current;
	let if_block = /*field*/ ctx[9].description.text && create_if_block_3(ctx);

	const block = {
		c: function create() {
			if (if_block) if_block.c();
			if_block_anchor = empty();
		},
		l: function claim(nodes) {
			if (if_block) if_block.l(nodes);
			if_block_anchor = empty();
		},
		m: function mount(target, anchor) {
			if (if_block) if_block.m(target, anchor);
			insert_dev(target, if_block_anchor, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			if (/*field*/ ctx[9].description.text) {
				if (if_block) {
					if_block.p(ctx, dirty);
					transition_in(if_block, 1);
				} else {
					if_block = create_if_block_3(ctx);
					if_block.c();
					transition_in(if_block, 1);
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			} else if (if_block) {
				group_outros();

				transition_out(if_block, 1, 1, () => {
					if_block = null;
				});

				check_outros();
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o: function outro(local) {
			transition_out(if_block);
			current = false;
		},
		d: function destroy(detaching) {
			if (if_block) if_block.d(detaching);
			if (detaching) detach_dev(if_block_anchor);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_2$1.name,
		type: "if",
		source: "(115:4) {#if field.description}",
		ctx
	});

	return block;
}

// (116:6) {#if field.description.text}
function create_if_block_3(ctx) {
	let current;

	const tag = new Tag({
			props: {
				tag: /*field*/ ctx[9].description.tag,
				classes: /*field*/ ctx[9].description.class,
				$$slots: { default: [create_default_slot_1] },
				$$scope: { ctx }
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			create_component(tag.$$.fragment);
		},
		l: function claim(nodes) {
			claim_component(tag.$$.fragment, nodes);
		},
		m: function mount(target, anchor) {
			mount_component(tag, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const tag_changes = {};
			if (dirty & /*fields*/ 1) tag_changes.tag = /*field*/ ctx[9].description.tag;
			if (dirty & /*fields*/ 1) tag_changes.classes = /*field*/ ctx[9].description.class;

			if (dirty & /*$$scope, fields*/ 32769) {
				tag_changes.$$scope = { dirty, ctx };
			}

			tag.$set(tag_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(tag.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(tag.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(tag, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_3.name,
		type: "if",
		source: "(116:6) {#if field.description.text}",
		ctx
	});

	return block;
}

// (117:8) <Tag tag={field.description.tag} classes={field.description.class}>
function create_default_slot_1(ctx) {
	let t_value = /*field*/ ctx[9].description.text + "";
	let t;

	const block = {
		c: function create() {
			t = text(t_value);
		},
		l: function claim(nodes) {
			t = claim_text(nodes, t_value);
		},
		m: function mount(target, anchor) {
			insert_dev(target, t, anchor);
		},
		p: function update(ctx, dirty) {
			if (dirty & /*fields*/ 1 && t_value !== (t_value = /*field*/ ctx[9].description.text + "")) set_data_dev(t, t_value);
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(t);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_default_slot_1.name,
		type: "slot",
		source: "(117:8) <Tag tag={field.description.tag} classes={field.description.class}>",
		ctx
	});

	return block;
}

// (123:4) {#if !isValidForm}
function create_if_block$2(ctx) {
	let if_block_anchor;
	let current;
	let if_block = /*$form*/ ctx[2][/*field*/ ctx[9].name].validation.errors.length > 0 && create_if_block_1$1(ctx);

	const block = {
		c: function create() {
			if (if_block) if_block.c();
			if_block_anchor = empty();
		},
		l: function claim(nodes) {
			if (if_block) if_block.l(nodes);
			if_block_anchor = empty();
		},
		m: function mount(target, anchor) {
			if (if_block) if_block.m(target, anchor);
			insert_dev(target, if_block_anchor, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			if (/*$form*/ ctx[2][/*field*/ ctx[9].name].validation.errors.length > 0) {
				if (if_block) {
					if_block.p(ctx, dirty);
					transition_in(if_block, 1);
				} else {
					if_block = create_if_block_1$1(ctx);
					if_block.c();
					transition_in(if_block, 1);
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			} else if (if_block) {
				group_outros();

				transition_out(if_block, 1, 1, () => {
					if_block = null;
				});

				check_outros();
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o: function outro(local) {
			transition_out(if_block);
			current = false;
		},
		d: function destroy(detaching) {
			if (if_block) if_block.d(detaching);
			if (detaching) detach_dev(if_block_anchor);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block$2.name,
		type: "if",
		source: "(123:4) {#if !isValidForm}",
		ctx
	});

	return block;
}

// (124:6) {#if $form[field.name].validation.errors.length > 0}
function create_if_block_1$1(ctx) {
	let each_1_anchor;
	let current;
	let each_value_1 = /*$form*/ ctx[2][/*field*/ ctx[9].name].validation.errors;
	let each_blocks = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	const out = i => transition_out(each_blocks[i], 1, 1, () => {
		each_blocks[i] = null;
	});

	const block = {
		c: function create() {
			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			each_1_anchor = empty();
		},
		l: function claim(nodes) {
			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(nodes);
			}

			each_1_anchor = empty();
		},
		m: function mount(target, anchor) {
			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(target, anchor);
			}

			insert_dev(target, each_1_anchor, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			if (dirty & /*$form, fields*/ 5) {
				each_value_1 = /*$form*/ ctx[2][/*field*/ ctx[9].name].validation.errors;
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
						transition_in(each_blocks[i], 1);
					} else {
						each_blocks[i] = create_each_block_1(child_ctx);
						each_blocks[i].c();
						transition_in(each_blocks[i], 1);
						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
					}
				}

				group_outros();

				for (i = each_value_1.length; i < each_blocks.length; i += 1) {
					out(i);
				}

				check_outros();
			}
		},
		i: function intro(local) {
			if (current) return;

			for (let i = 0; i < each_value_1.length; i += 1) {
				transition_in(each_blocks[i]);
			}

			current = true;
		},
		o: function outro(local) {
			each_blocks = each_blocks.filter(Boolean);

			for (let i = 0; i < each_blocks.length; i += 1) {
				transition_out(each_blocks[i]);
			}

			current = false;
		},
		d: function destroy(detaching) {
			destroy_each(each_blocks, detaching);
			if (detaching) detach_dev(each_1_anchor);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_1$1.name,
		type: "if",
		source: "(124:6) {#if $form[field.name].validation.errors.length > 0}",
		ctx
	});

	return block;
}

// (125:8) {#each $form[field.name].validation.errors as error, index}
function create_each_block_1(ctx) {
	let current;

	const message = new Message({
			props: {
				error: /*error*/ ctx[12],
				messages: /*field*/ ctx[9].messages
			},
			$$inline: true
		});

	const block = {
		c: function create() {
			create_component(message.$$.fragment);
		},
		l: function claim(nodes) {
			claim_component(message.$$.fragment, nodes);
		},
		m: function mount(target, anchor) {
			mount_component(message, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const message_changes = {};
			if (dirty & /*$form, fields*/ 5) message_changes.error = /*error*/ ctx[12];
			if (dirty & /*fields*/ 1) message_changes.messages = /*field*/ ctx[9].messages;
			message.$set(message_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(message.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(message.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			destroy_component(message, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_each_block_1.name,
		type: "each",
		source: "(125:8) {#each $form[field.name].validation.errors as error, index}",
		ctx
	});

	return block;
}

// (66:2) <Tag     tag={field.prefix ? (field.prefix.tag ? field.prefix.tag : 'div') : 'div'}     classes={field.prefix ? (field.prefix.class ? field.prefix.class : 'form-group') : 'form-group'}>
function create_default_slot(ctx) {
	let t0;
	let current_block_type_index;
	let if_block1;
	let t1;
	let t2;
	let t3;
	let current;
	let if_block0 = /*field*/ ctx[9].label && create_if_block_8(ctx);
	const if_block_creators = [create_if_block_4, create_if_block_5, create_if_block_6, create_if_block_7];
	const if_blocks = [];

	function select_block_type(ctx, dirty) {
		if (/*field*/ ctx[9].type === "text" || /*field*/ ctx[9].type === "password" || /*field*/ ctx[9].type === "email" || /*field*/ ctx[9].type === "tel" || /*field*/ ctx[9].type === "number" || /*field*/ ctx[9].type === "range" || /*field*/ ctx[9].type === "date" || /*field*/ ctx[9].type === "color" || /*field*/ ctx[9].type === "file" || /*field*/ ctx[9].type === "datetimelocal") return 0;
		if (/*field*/ ctx[9].type === "textarea") return 1;
		if (/*field*/ ctx[9].type === "select") return 2;
		if (/*field*/ ctx[9].type === "radio") return 3;
		return -1;
	}

	if (~(current_block_type_index = select_block_type(ctx))) {
		if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
	}

	let if_block2 = /*field*/ ctx[9].description && create_if_block_2$1(ctx);
	let if_block3 = !/*isValidForm*/ ctx[1] && create_if_block$2(ctx);

	const block = {
		c: function create() {
			if (if_block0) if_block0.c();
			t0 = space();
			if (if_block1) if_block1.c();
			t1 = space();
			if (if_block2) if_block2.c();
			t2 = space();
			if (if_block3) if_block3.c();
			t3 = space();
		},
		l: function claim(nodes) {
			if (if_block0) if_block0.l(nodes);
			t0 = claim_space(nodes);
			if (if_block1) if_block1.l(nodes);
			t1 = claim_space(nodes);
			if (if_block2) if_block2.l(nodes);
			t2 = claim_space(nodes);
			if (if_block3) if_block3.l(nodes);
			t3 = claim_space(nodes);
		},
		m: function mount(target, anchor) {
			if (if_block0) if_block0.m(target, anchor);
			insert_dev(target, t0, anchor);

			if (~current_block_type_index) {
				if_blocks[current_block_type_index].m(target, anchor);
			}

			insert_dev(target, t1, anchor);
			if (if_block2) if_block2.m(target, anchor);
			insert_dev(target, t2, anchor);
			if (if_block3) if_block3.m(target, anchor);
			insert_dev(target, t3, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			if (/*field*/ ctx[9].label) {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_8(ctx);
					if_block0.c();
					if_block0.m(t0.parentNode, t0);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			let previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx);

			if (current_block_type_index === previous_block_index) {
				if (~current_block_type_index) {
					if_blocks[current_block_type_index].p(ctx, dirty);
				}
			} else {
				if (if_block1) {
					group_outros();

					transition_out(if_blocks[previous_block_index], 1, 1, () => {
						if_blocks[previous_block_index] = null;
					});

					check_outros();
				}

				if (~current_block_type_index) {
					if_block1 = if_blocks[current_block_type_index];

					if (!if_block1) {
						if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
						if_block1.c();
					}

					transition_in(if_block1, 1);
					if_block1.m(t1.parentNode, t1);
				} else {
					if_block1 = null;
				}
			}

			if (/*field*/ ctx[9].description) {
				if (if_block2) {
					if_block2.p(ctx, dirty);
					transition_in(if_block2, 1);
				} else {
					if_block2 = create_if_block_2$1(ctx);
					if_block2.c();
					transition_in(if_block2, 1);
					if_block2.m(t2.parentNode, t2);
				}
			} else if (if_block2) {
				group_outros();

				transition_out(if_block2, 1, 1, () => {
					if_block2 = null;
				});

				check_outros();
			}

			if (!/*isValidForm*/ ctx[1]) {
				if (if_block3) {
					if_block3.p(ctx, dirty);
					transition_in(if_block3, 1);
				} else {
					if_block3 = create_if_block$2(ctx);
					if_block3.c();
					transition_in(if_block3, 1);
					if_block3.m(t3.parentNode, t3);
				}
			} else if (if_block3) {
				group_outros();

				transition_out(if_block3, 1, 1, () => {
					if_block3 = null;
				});

				check_outros();
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(if_block1);
			transition_in(if_block2);
			transition_in(if_block3);
			current = true;
		},
		o: function outro(local) {
			transition_out(if_block1);
			transition_out(if_block2);
			transition_out(if_block3);
			current = false;
		},
		d: function destroy(detaching) {
			if (if_block0) if_block0.d(detaching);
			if (detaching) detach_dev(t0);

			if (~current_block_type_index) {
				if_blocks[current_block_type_index].d(detaching);
			}

			if (detaching) detach_dev(t1);
			if (if_block2) if_block2.d(detaching);
			if (detaching) detach_dev(t2);
			if (if_block3) if_block3.d(detaching);
			if (detaching) detach_dev(t3);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_default_slot.name,
		type: "slot",
		source: "(66:2) <Tag     tag={field.prefix ? (field.prefix.tag ? field.prefix.tag : 'div') : 'div'}     classes={field.prefix ? (field.prefix.class ? field.prefix.class : 'form-group') : 'form-group'}>",
		ctx
	});

	return block;
}

// (64:0) {#each fields as field (field.name)}
function create_each_block$2(key_1, ctx) {
	let first;
	let current;

	const tag = new Tag({
			props: {
				tag: /*field*/ ctx[9].prefix
				? /*field*/ ctx[9].prefix.tag
					? /*field*/ ctx[9].prefix.tag
					: "div"
				: "div",
				classes: /*field*/ ctx[9].prefix
				? /*field*/ ctx[9].prefix.class
					? /*field*/ ctx[9].prefix.class
					: "form-group"
				: "form-group",
				$$slots: { default: [create_default_slot] },
				$$scope: { ctx }
			},
			$$inline: true
		});

	const block = {
		key: key_1,
		first: null,
		c: function create() {
			first = empty();
			create_component(tag.$$.fragment);
			this.h();
		},
		l: function claim(nodes) {
			first = empty();
			claim_component(tag.$$.fragment, nodes);
			this.h();
		},
		h: function hydrate() {
			this.first = first;
		},
		m: function mount(target, anchor) {
			insert_dev(target, first, anchor);
			mount_component(tag, target, anchor);
			current = true;
		},
		p: function update(ctx, dirty) {
			const tag_changes = {};

			if (dirty & /*fields*/ 1) tag_changes.tag = /*field*/ ctx[9].prefix
			? /*field*/ ctx[9].prefix.tag
				? /*field*/ ctx[9].prefix.tag
				: "div"
			: "div";

			if (dirty & /*fields*/ 1) tag_changes.classes = /*field*/ ctx[9].prefix
			? /*field*/ ctx[9].prefix.class
				? /*field*/ ctx[9].prefix.class
				: "form-group"
			: "form-group";

			if (dirty & /*$$scope, isValidForm, $form, fields*/ 32775) {
				tag_changes.$$scope = { dirty, ctx };
			}

			tag.$set(tag_changes);
		},
		i: function intro(local) {
			if (current) return;
			transition_in(tag.$$.fragment, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(tag.$$.fragment, local);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) detach_dev(first);
			destroy_component(tag, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_each_block$2.name,
		type: "each",
		source: "(64:0) {#each fields as field (field.name)}",
		ctx
	});

	return block;
}

function create_fragment$6(ctx) {
	let each_blocks = [];
	let each_1_lookup = new Map();
	let each_1_anchor;
	let current;
	let each_value = /*fields*/ ctx[0];
	const get_key = ctx => /*field*/ ctx[9].name;

	for (let i = 0; i < each_value.length; i += 1) {
		let child_ctx = get_each_context$2(ctx, each_value, i);
		let key = get_key(child_ctx);
		each_1_lookup.set(key, each_blocks[i] = create_each_block$2(key, child_ctx));
	}

	const block = {
		c: function create() {
			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			each_1_anchor = empty();
		},
		l: function claim(nodes) {
			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(nodes);
			}

			each_1_anchor = empty();
		},
		m: function mount(target, anchor) {
			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(target, anchor);
			}

			insert_dev(target, each_1_anchor, anchor);
			current = true;
		},
		p: function update(ctx, [dirty]) {
			const each_value = /*fields*/ ctx[0];
			group_outros();
			each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, each_1_anchor.parentNode, outro_and_destroy_block, create_each_block$2, each_1_anchor, get_each_context$2);
			check_outros();
		},
		i: function intro(local) {
			if (current) return;

			for (let i = 0; i < each_value.length; i += 1) {
				transition_in(each_blocks[i]);
			}

			current = true;
		},
		o: function outro(local) {
			for (let i = 0; i < each_blocks.length; i += 1) {
				transition_out(each_blocks[i]);
			}

			current = false;
		},
		d: function destroy(detaching) {
			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].d(detaching);
			}

			if (detaching) detach_dev(each_1_anchor);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$6.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$6($$self, $$props, $$invalidate) {
	let $valuesForm;
	let $form;
	validate_store(valuesForm, "valuesForm");
	component_subscribe($$self, valuesForm, $$value => $$invalidate(6, $valuesForm = $$value));
	let { fields = [] } = $$props;
	let values = [];
	let isValidForm = true;

	const setValuesForm = (isValidForm, values) => {
		valuesForm.set({ isValidForm, values: { ...values } });
	};

	const changeValueHander = event => {
		values[`${event.detail.name}`] = event.detail.value;

		fields.filter(field => {
			if (field.name === event.detail.name) {
				field.value = event.detail.value;
			}
		});

		setValuesForm(isValidForm, values);
	};

	let fieldsToValidate = {};

	const form = validator(() => {
		if (fields.length > 0) {
			fields.map(field => {
				let { validation } = field;
				const value = field.value ? field.value : null;

				const fieldValidate = {
					[field.name]: {
						value: values[field.name] ? values[field.name] : value,
						validators: validation
					}
				};

				fieldsToValidate = { ...fieldsToValidate, ...fieldValidate };
			});
		}

		return fieldsToValidate;
	});

	validate_store(form, "form");
	component_subscribe($$self, form, value => $$invalidate(2, $form = value));

	form.subscribe(data => {
		$$invalidate(1, isValidForm = data.valid);
		setValuesForm(isValidForm, values);
	});

	onMount(() => {
	});

	onDestroy([valuesForm]);
	const writable_props = ["fields"];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Field> was created with unknown prop '${key}'`);
	});

	$$self.$set = $$props => {
		if ("fields" in $$props) $$invalidate(0, fields = $$props.fields);
	};

	$$self.$capture_state = () => {
		return {
			fields,
			values,
			isValidForm,
			fieldsToValidate,
			$valuesForm,
			$form
		};
	};

	$$self.$inject_state = $$props => {
		if ("fields" in $$props) $$invalidate(0, fields = $$props.fields);
		if ("values" in $$props) values = $$props.values;
		if ("isValidForm" in $$props) $$invalidate(1, isValidForm = $$props.isValidForm);
		if ("fieldsToValidate" in $$props) fieldsToValidate = $$props.fieldsToValidate;
		if ("$valuesForm" in $$props) valuesForm.set($valuesForm = $$props.$valuesForm);
		if ("$form" in $$props) form.set($form = $$props.$form);
	};

	return [fields, isValidForm, $form, changeValueHander];
}

class Field extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$6, create_fragment$6, safe_not_equal, { fields: 0 });

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "Field",
			options,
			id: create_fragment$6.name
		});
	}

	get fields() {
		throw new Error("<Field>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}

	set fields(value) {
		throw new Error("<Field>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
	}
}

export { Field, valuesForm };
//# sourceMappingURL=svelteformly.es.js.map
