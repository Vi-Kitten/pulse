// @ts-check

/**
 * @template T
 * @typedef {[] | [T]} Maybe
 */

/**
 * @template {unknown[]} Args
 * @template Ret
 * @param {(...xs: Args) => Ret} f 
 * @returns {(...xs: Args) => Ret}
 */
function once(f) {
    /** @type {Maybe<Ret>} */
    let val = [];
    return (...args) => {
        if (val.length) return val[0];
        let ret = f(...args);
        val = [ret];
        return ret;
    };
}

export async function painted() {
    await new Promise(res =>
        requestAnimationFrame(() => requestAnimationFrame(res))
    );
}

/** @typedef {(elems: HTMLElement[]) => void} Renderer */
/** 
 * @template [T=void]
 * @typedef {() => T} Action
 * */

/**
 * @param {Renderer} render 
 * @param {number} n
 * @return {Renderer[]} 
 */
function fan_in(render, n) {
    const renderBuffer = Array(n).fill(null);
    return Array.from({ length: n }, (_, i) => elems => {
        renderBuffer[i] = elems;
        if (renderBuffer.includes(null)) return;
        render(renderBuffer.flat());
    })
}

/**
 * A graphical interactivity monad with alternative structure for signal handling.
 * @template out T
 */
export class Prompt {
    /**
     * @param {(render: Renderer, res: (val: T) => void) => void} mount 
     */
    constructor(mount) {
        /**
         * @readonly
         * @type {(render: Renderer, res: (val: T) => void) => void} 
         */
        this.mount = (render, res) => {
            let finished = false;
            /**
             * @type {HTMLElement[]}
             */
            let current_elems = [];

            mount(elems => {
                if (finished) return;

                render(elems);
                current_elems = elems;
            }, val => {
                if (finished) return;
                finished = true;
                for (let elem of current_elems) {
                    elem.inert = true;
                }

                res(val);
            });
        };
    }
    /**
     * @template U
     * @param {(x: T) => U} f 
     * @returns {Prompt<U>}
     */
    map(f) { return new Prompt((render, res) =>

        this.mount(render, x => res(f(x)))

    );}
    /**
     * Render with a continuation after submition.
     * 
     * _Sequential operator_
     * @template U
     * @param {(val: T, early: (ret: U) => void) => Prompt<U>} f
     * @returns {Prompt<U>}
     */
    then(f) { return new Prompt((render, res) =>

        this.mount(render, val =>
            Prompt.do(ret => f(val, ret)).mount(render, res)  
        )

    );}
    /**
     * @template T
     * @param {T} val
     * @returns {Prompt<T>}
     */
    static done(val) { return new Prompt((_, res) =>

        res(val)
    
    );}
    /**
     * @template T
     * @param {(early: (ret: T) => void) => Prompt<T>} f 
     * @returns {Prompt<T>}
     */
    static do(f) { return new Prompt((render, res) =>
        
        f(res).mount(render, res)
    
    );}
    /**
     * Combine multiple components, selecting the first one.
     * @template T
     * @param  {Prompt<T>[]} components
     * @returns {Prompt<T>}
     */
    static select(...components) { return new Prompt((render, res) =>

        fan_in(render, components.length).map((render, i) =>
            components[i].mount(render, res)
        )

    );}
}

/**
 * An applicative form combinator system for data presentation and entry.
 * @template out T
 * @extends {Prompt<T>}
 */
export class Form extends Prompt {
    /**
     * @param {(render: Renderer, flush: Action) => Action<T>} link 
     */
    constructor(link) {
        super((render, res) => {
            /** @type {Maybe<Action<T>>} */
            let mounted = [];

            const run = once(() => res(mounted.length
                ? mounted[0]()
                : (() => { throw new Error("Internal rooting state error")})()
            ));

            let fastFlush = false;
            mounted = [link(render, () => mounted.length
                ? run()
                : (() => { fastFlush = true; })()
            )];
            if (fastFlush) run();
        });
        /**
         * @readonly
         * @type {(render: Renderer, flush: Action) => Action<T>} 
         */
        this.link = (render, flush) => {
            let finished = false;
            /**
             * @type {HTMLElement[]}
             */
            let current_elems = [];

            return link(elems => {
                if (finished) return;

                render(elems);
                current_elems = elems;
            }, () => {
                if (finished) return;
                finished = true;
                for (let elem of current_elems) {
                    elem.inert = true;
                }

                flush();
            });
        };
    }
    /**
     * @template U
     * @param {(x: T) => U} f 
     * @returns {Form<U>}
     */
    map(f) { return new Form((render, flush) => {

        let submit = this.link(render, flush);
        return () => f(submit());

    });}
    /**
     * Extract the value without rendering.
     * @returns {T}
     */
    rhetorical() { return this.link(_ => {}, () => {})(); }
    /**
     * Store value until flush.
     * @template T
     * @param {T} val 
     * @returns {Form<T>}
     */
    static wrap(val) { return new Form((render, _) => {

        render([]);
        return () => val;

    })}
    /**
     * Repeatedly render and change value.
     * @template T
     * @param {T} init
     * @param {(state: T, cont: (val: T) => void, brk: (ret: T) => void) => Prompt<T>} f
     * @returns {Form<T>}
     */
    static loop(init, f) { return Form.loopWith(init, f, x => x); }
    /**
     * Repeatedly render and change value, breaking or projecting to a different type.
     * @template T
     * @template U
     * @param {T} init
     * @param {(state: T, cont: (val: T) => void, brk: (ret: U) => void) => Prompt<T>} f
     * @param {(state: T) => U} proj
     * @returns {Form<U>}
     */
    static loopWith(init, f, proj) { return new Form((render, flush) => {

        let state = init;
        /** @type {Maybe<U>} */
        let final = [];

        function step() {
            // trampolined recursion
            let looping = true, immediate = true;
            function stepInner() {
                if (looping) {
                    immediate = true;
                } else {
                    step();
                }
            }
            
            while (immediate) {
                if (final.length != 0) break;
                immediate = false;

                Prompt.do(cont => f(state, cont, val => {
                    // on break
                    final = [val];
                    flush();
                })).mount(render, val => {
                    // on continue
                    state = val;
                    stepInner();
                });
            }

            looping = false;
        }
        step();

        return () => {
            if (final.length == 0) {
                final = [proj(state)]
            }
            return final[0];
        };

    });}
    /**
     * Combine multiple forms into a single larger form.
     * @template {unknown[]} Args
     * @param  {{[K in keyof Args]: Form<Args[K]>}} forms
     * @returns {Form<Args>}
     */
    static array(...forms) { return new Form((render, flush) => {

        let submits = fan_in(render, forms.length).map((render, i) =>
            forms[i].link(render, flush)
        );
        return () => /** @type {Args} */ (submits.map(f => f()));

    });}
}

/**
 * @template out A
 * @template {HTMLElement} [in E=HTMLElement]
 */
export class EventHandler {
    /**
     * @param {(elem: E, resolve: (a: A) => void) => void} listen
     */
    constructor(listen) {
        /**
         * @readonly
         */
        this.listen = listen;
    }
    /**
     * @template {keyof HTMLElementEventMap} K
     * @template B
     * @param {K} type
     * @param {(elem: E, e: HTMLElementEventMap[K], resolve: (b: B) => void) => void} handler
     * @returns {EventHandler<A | B, E>}
     */
    onWith(type, handler) {
        return new EventHandler((elem, resolve) => {
            this.listen(elem, resolve);
            elem.addEventListener(type, e => handler(elem, e, resolve));
        });
    }
    /**
     * Handle event.
     * @template {keyof HTMLElementEventMap} K
     * @template B
     * @param {K} type
     * @param {(elem : E, e: HTMLElementEventMap[K]) => B} f
     * @returns {EventHandler<A | B, E>}
     */
    on(type, f) {
        return this.onWith(type, (elem, e, resolve) => resolve(f(elem, e)));
    }
    /**
     * Handle key.
     * @template B
     * @param {string} key
     * @param {(elem: E, e: KeyboardEvent) => B} f
     * @returns {EventHandler<A | B, E>}
     */
    onKey(key, f) {
        return this.onWith('keydown', (elem, e, resolve) => {
            if (!e.isComposing && e.key.toLowerCase() == key.toLowerCase()) resolve(f(elem, e));
        });
    }
}

/**
 * Blank event handler.
 * @readonly
 * @type {EventHandler<never>}
 * */
export const blank = new EventHandler(() => {});

// /**
//  * @template [A=never]
//  * @param {Selector<A, HTMLElement>} selector
//  * @param {string} html
//  * @returns {Prompt<A>}
//  */
// function HTML(selector, html) { return new Prompt((render, res) => {

//     let temp = document.createElement('template');
//     temp.innerHTML = html.trim();
//     let elems = /** @type {HTMLElement[]} */ ([...temp.content.children]);
//     for (let elem of elems) {
//         selector.listen(elem, res);
//     }
//     render(elems);

// });}

/**
 * Create a prompt with a give tag and event handler.
 * @template {keyof HTMLElementTagNameMap} K
 * @template [A=never]
 * @param {K} tag
 * @param {Partial<HTMLElementTagNameMap[K]>} props
 * @param {EventHandler<A, HTMLElementTagNameMap[K]>} selector
 * @param {string} html
 * @returns {Prompt<A>}
 */
export function show(tag, props, selector, html) { return new Prompt((render, res) => {

    let elem = document.createElement(tag);
    elem.innerHTML = html.trim();
    Object.assign(elem, props);
    selector.listen(elem, res);
    render([elem]);

});}