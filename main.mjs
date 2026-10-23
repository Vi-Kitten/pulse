// @ts-check
import { Form, Prompt, show, blank, painted } from './pulse.mjs';

let prompt = Form.loop(0, (n, cont, brk) => Prompt.select(
    show('button', {}, blank.on('click', () => n + 1), "+1"),
    show('p', {}, blank, `${n}`),
    show('button', {}, blank.on('click', () => n - 1), "-1"),
    // show('button', {}, blank.on('click', () => brk(n)), "submit")
));

prompt.mount(elems => document.body.replaceChildren(...elems), val => painted().then(() => {
    location.replace('about:blank');
    if (val !== undefined) {
        alert(val);
    }
}));