# Pulse

Pulse is a _WIP_ GUI combinator library consisting of:

- The type `Prompt` with a monad structure allowing computations to request input from the user and a complementary alternative structure which allows for exclusive paths to be presented.
- The subtype `Form` of `Prompt` with an applicative structure that presents data in parallel.

One of the most powerful concepts is `Form.loop` which creates a form item from a `Prompt` that repeatedly updates a value, providing continue and break divergents for ease of programming, here is an example:

```js
let prompt = Form.loop(0, (n, cont, brk) => Prompt.select(
    show('button', {}, blank.on('click', () => n + 1), "+1"),
    show('p', {}, blank, `${n}`),
    show('button', {}, blank.on('click', () => n - 1), "-1"),
    show('button', {}, blank.on('click', () => brk(n)), "submit")
));
```

I plan to add:

- Focus preservation.
- Drag and drop.
