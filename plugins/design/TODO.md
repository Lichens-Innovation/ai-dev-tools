# TODO

Delete this file before merging.

## Edit the hand-authored tokens in Claude Design

Done and tested without Claude Design's runtime:

- `design-nav.js` in jsdom: the footer's token rows (breakpoints disabled), live values on a
  component card and none on the palette card, invalid values ignored, the stored draft, Copy
  request (color and token lines), the row × and Reset, `setTokens()` and the event.
- The palette card's script in Node with a stub `DCLogic`: the Tokens groups and samples, the
  edits reaching the injected CSS and `designNav.setTokens`, invalid values kept in the field only.
- `palette.ts` round trips: token values rewritten in place, unknown names ignored, invalid values
  rejected, `font-inverted` / `border` left derived, new inputs added inside the inputs block.

### Left

- [ ] Test the card in a real Claude Design project (needs `support.js`): `sc-if` around the
      Tokens `<section>`, the text `<input>` `onChange` firing per keystroke, `disabled="{{ … }}"`
      on the breakpoint fields.
