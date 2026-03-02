# Why rainbow doesn't have `dynamic`

## Background

[Unicorn](https://github.com/art-w/unicorn) is an OCaml UI library built on the same optics model as rainbow. It has seven combinators; the last and most powerful is `dynamic`:

```ocaml
val dynamic : ('a t * 'a) t
```

It's a widget that renders a widget. The state it edits is a `(widget, data)` pair. Its defining law is:

```
stateful w dynamic  =  w
```

Embed a widget `w` as the internal state of `dynamic` and you get back `w`. This makes widget *instances* first-class values in application state.

## The problem it solves

In Unicorn, internal state is tied to position by default. If you have two todolist widgets side by side and swap their data, their local state (e.g. the draft text in the "add item" input) stays put — because local state lives at a position in the widget tree, not with the data.

`dynamic` fixes this by putting the widget reference *into* application state. Swapping a `(widget, data)` pair swaps both the rendering and the local state together. Identity follows the widget object reference, not the tree position.

## Why rainbow doesn't need it

Rainbow has no widget layer. There is nothing for a `Signal<Signal<A>>` to *be* in the way `('a t * 'a) t` is something in Unicorn.

More importantly, `dynamic` is a fix for *implicit identity*. When identity is carried by widget object references, you have to promote those references into state to move identity around. But if your data model already has *explicit identity* — stable IDs on records — the problem doesn't arise.

Consider the cases `dynamic` covers:

| Problem | Unicorn solution | Rainbow solution |
|---|---|---|
| Swap two stateful widgets | Put widget refs in state, swap pairs | Make layout explicit in state |
| Keyed list reordering | `list dynamic` | Put IDs in data, look up local state by ID |
| Duplicate with independent state | Each `dynamic` instance is a separate ref | Each copy gets a distinct ID |

All three collapse into: **make identity explicit in the domain model**.

A `Signal<Map<Id, LocalState>>` composed with a lens into it is sufficient. No new combinator is needed.

## A note on projectional editors

A structural/projectional editor is a useful test case because its state layout is itself a value — a tree of nodes, each with an explicit ID. Moving a node means updating the layout tree. Local UI state (collapsed, cursor position, focused) is keyed by node ID.

This architecture never encounters the identity-vs-position problem that `dynamic` solves, because identity is baked into the data from the start. The editor *already* internalizes the insight at the domain level.

## Conclusion

`dynamic` is not absent from rainbow because it is too hard to implement. It is absent because it does not have a natural home in a library without a widget layer, and the problems it solves are better addressed by making identity explicit in the data model — which is good domain modelling practice regardless of the framework.
