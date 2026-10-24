// @ts-check

/**
 * @template T
 * @typedef {[] | [T]} Maybe
 */

export async function painted() {
    await new Promise(res =>
        requestAnimationFrame(() => requestAnimationFrame(res))
    );
}

class PulseNever {
    /**
     * @param {PulseScope} scope 
     */
    constructor(scope) {
        /**
         * @readonly
         */
        this.scope = scope;
    }
}

class PulseScope {
    /**
     * @returns {never}
     */
    jump() {
        throw new PulseNever(this);
    }
    /**
     * @param {() => void} f
     * @returns {void}
     */
    guard(f) {
        try { f(); } catch (err) {
            if (err instanceof PulseNever && err.scope === this) {
                return;
            } else {
                throw err;
            }
        }
    }
    /**
     * @param {() => void} f
     */
    static guardAll(f) {
        try { f(); } catch (err) {
            if (err instanceof PulseNever) {
                return;
            } else {
                throw err;
            }
        }
    }
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
function fanIn(render, n) {
    if (n === 0) {
        render([])
        return [];
    }
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
            let currentElems = [];

            mount(elems => {
                if (finished) return;

                render(elems);
                currentElems = elems;
            }, val => {
                if (finished) return;
                finished = true;
                for (let elem of currentElems) {
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
     * Render with a continuation after submission.
     * 
     * _Sequential operator_
     * @template U
     * @template [V=U]
     * @param {(val: T, early: (ret: V) => never) => Prompt<U>} f
     * @returns {Prompt<U | V>}
     */
    then(f) { return new Prompt((render, res) =>

        this.mount(render, val =>
            Prompt.do(ret => f(val, ret)).mount(render, res)  
        )

    );}
    /**
     * @template [U=T]
     * @param {(res: (val: U) => void) => void} f
     * @returns {Prompt<T | U>}
     */
    withPromise(f) { return new Prompt((render, res) => {

        this.mount(render, res);
        new Promise(f).then(x => PulseScope.guardAll(() => res(x)));

    });}
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
     * @template [U=T]
     * @param {(early: (ret: U) => never) => Prompt<T>} f 
     * @returns {Prompt<T | U>}
     */
    static do(f) { return new Prompt((render, res) => {

        const scope = new PulseScope();
        scope.guard(() => f(val => {
            res(val);
            return scope.jump();
        }).mount(render, res));
    
    });}
    /**
     * @returns {Prompt<never>}
     */
    static never() { return new Prompt((render, _) => render([])); }
    /**
     * Combine multiple components, selecting the first one.
     * @template T
     * @param  {Prompt<T>[]} components
     * @returns {Prompt<T>}
     */
    static select(...components) { return new Prompt((render, res) =>

        fanIn(render, components.length).map((render, i) =>
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
            let flushed = false;

            const run = () => {
                if (!mounted.length) throw new Error("Internal rooting state error");
                if (flushed) return;
                flushed = true;
                res(mounted[0]());
            }

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
            let currentElems = [];

            return link(elems => {
                if (finished) return;

                render(elems);
                currentElems = elems;
            }, () => {
                if (finished) return;
                finished = true;
                for (let elem of currentElems) {
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
     * @template [U=T]
     * @param {T} init
     * @param {(state: T, cont: (val: T) => never, brk: (ret: U) => never) => Prompt<T>} f
     * @returns {Form<T | U>}
     */
    static loop(init, f) { return Form.loopWith(init, f, /** @type {(x: T) => T | U} */ (x => x)); }
    /**
     * Repeatedly render and change value, breaking or projecting to a different type.
     * @template T
     * @template [U=T]
     * @param {T} init
     * @param {(state: T, cont: (val: T) => never, brk: (ret: U) => never) => Prompt<T>} f
     * @param {(state: T) => U} proj
     * @returns {Form<U>}
     */
    static loopWith(init, f, proj) { return new Form((render, flush) => {

        const scope = new PulseScope();
        let state = init;
        /** @type {Maybe<U>} */
        let final = [];

        function step() { scope.guard(() => {

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
                if (final.length !== 0) break;
                immediate = false;

                Prompt.do(cont => f(state, cont, val => {
                    // on break
                    final = [val];
                    flush();
                    looping = false;
                    return scope.jump();
                })).mount(render, val => {
                    // on continue
                    state = val;
                    stepInner();
                });
            }

            looping = false;
        });}
        step();

        return () => {
            if (final.length === 0) {
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

        let submits = fanIn(render, forms.length).map((render, i) =>
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
     * @param {(elem: E, e: HTMLElementEventMap[K], resolve: (b: B) => void) => void} func
     * @returns {EventHandler<A | B, E>}
     */
    onWith(type, func) {
        return new EventHandler((elem, resolve) => {
            this.listen(elem, resolve);
            elem.addEventListener(type, e => queueMicrotask(() => PulseScope.guardAll(() => func(elem, e, resolve))));
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
            if (!e.isComposing && e.key.toLowerCase() === key.toLowerCase()) resolve(f(elem, e));
        });
    }
}

/**
 * Blank event handler.
 * @type {EventHandler<never>}
 * */
export const blank = new EventHandler(() => {});

/**
 * Create a prompt with a given tag and event handler.
 * @template {keyof HTMLElementTagNameMap} K
 * @template [A=never]
 * @param {K} tag
 * @param {Partial<HTMLElementTagNameMap[K]>} props
 * @param {EventHandler<A, HTMLElementTagNameMap[K]>} handler
 * @param {string} html
 * @returns {Prompt<A>}
 */
export function show(tag, props, handler, html) { return new Prompt((render, res) => {

    let elem = document.createElement(tag);
    elem.innerHTML = html.trim();
    Object.assign(elem, props);
    handler.listen(elem, res);
    render([elem]);

});}