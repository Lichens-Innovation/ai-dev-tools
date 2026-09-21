---
name: gluestack-ui
description: Use whenever adding a new feature to the mobile app or refactoring components, explains how to use the gluestack UI librarie to use headless components.
---

# gluestack UI

> **Authoritative reference (offline):** the full gluestack v5 docs are checked into the repo at
> `docs/gluestack-full-llm.md` (a copy of <https://gluestack.io/llms-full.txt>). Grep it before
> theorizing about component APIs, theming, dark mode, or the provider — e.g.
> `grep -n "Dark Mode\|config.ts\|@theme\|setColorScheme" docs/gluestack-full-llm.md`. It resolved
> the theming pipeline that source-reading alone got wrong.

## Adding a component

Run: `cd apps/mobile && npx gluestack-ui@latest add <component>`. **Make sure to add from the apps/mobile directory !!!**

> Note: If the component has a web version, you can delete it after the install.

### Adding the style tokens to a new component

When adding a gluestack-ui component, gluestack copies source files into the src/components/ directory.
The tokens are in the tva({...}) style definitions. Every className string in the component is a Tailwind utility, and any utility that starts with a color name references a CSS variable. For example:

```
// From src/components/button/index.tsx
const buttonStyle = tva({
  base: '... data-[focus-visible=true]:web:ring-2 ...',
  variants: {
    variant: {
      default: 'bg-primary data-[hover=true]:bg-primary/90',
      destructive: 'bg-destructive ...',
      outline: 'border border-border bg-background ...',
      secondary: 'bg-secondary text-secondary-foreground ...',
      ghost: 'data-[hover=true]:bg-accent ...',
    },
  },
});
```

Each color utility maps to a CSS variable: bg-primary → --color-primary, bg-destructive → --color-destructive,
text-secondary-foreground → --color-secondary-foreground, etc. The Tailwind convention is always bg-X → --color-X.

Exceptions — non-color tokens:

- font-body, font-heading → --font-body, --font-heading
- tracking-md → --tracking-md
- shadow-hard-2, shadow-soft-4 → --shadow-\* (gluestack shadow tokens — these didn't break anything since RN ignores unknown
  shadow utilities gracefully)

To make sure that tokens from the new components are mapped to the repo theme:

1. Find every token it uses: `grep -h "base:\|variants:" src/components/<component>/index.tsx | grep -oE '[a-z]+-[a-z-]+' | sort -u`
2. Then cross-reference the result against what's already defined in global.css. Anything in the grep output that isn't already in the @theme inline block needs to be bridged.
3. For a faster check or validation — just grep for undefined tokens: `grep -oE '\b(bg|text|border|ring|fill|stroke)-[a-z][a-z-]+' src/components/<component>/index.tsx | sort -u`
4. For each result, check if `--color-<name>` is already mapped in `global.css`'s `@theme inline`
   block. If not, add a mapping to an existing `@noa` palette var:
   a. `apps/mobile/global.css`, in `@theme inline`: `--color-<name>: var(--noa-<token>);`
      (bind to a raw `--noa-*` var — **never** a self-reference `var(--color-<name>)`, which
      Tailwind v4 collapses to nothing).
   b. If no `@noa/theme` token fits, add one to `packages/theme/src/theme.css` (a `--noa-*` custom
      property using `light-dark(<light>, <dark>)`). `theme.css` is hand-authored (no generation);
      `global.css` imports it.

See the **mobile-setup** skill → "Color theming pipeline" for the full mechanism and the two rules
that, if broken, make every color silently fall back to React Native defaults.

## NativeWind v5 integration — providers & the `className` remapping rule

gluestack-ui v5 requires Tailwind v4 + NativeWind **v5**, whose styling model differs from v4.
Two integration facts must hold or components break **silently** (render nothing, no error).

### Overlay & toast components need their providers mounted

Modal, Select's Actionsheet, Popover, Menu, Tooltip, Toast — every gluestack overlay renders
through an `Overlay` → `OverlayContainer` portal that returns `null` unless a **`PortalProvider`
(exported as `OverlayProvider`)** is mounted above it. gluestack `useToast` likewise needs
`ToastProvider`. Our custom `src/components/gluestack-ui-provider/index.tsx` wraps children in both
(matching gluestack's official Expo/NativeWind starter provider):

```tsx
import { OverlayProvider } from "@gluestack-ui/core/overlay/creator";
import { ToastProvider } from "@gluestack-ui/core/toast/creator";
// …inside the provider's root View (which also calls Appearance.setColorScheme(mode)):
<OverlayProvider><ToastProvider>{children}</ToastProvider></OverlayProvider>
```

If a Modal/Select "doesn't open" with no error, the provider is missing. (This is exactly the
regression that hit our About modal after the v5 refactor — the custom provider had dropped both
wrappers.) `ToastProvider` (gluestack) is independent of the `react-native-toast-message` `<Toast />`
in `_layout.tsx`.

> The provider does **not** inject colors via NativeWind `vars()` — the palette is declared
> statically in `@noa/theme/theme.css` and switched by `Appearance.setColorScheme(mode)`. See the
> **mobile-setup** skill → "Color theming pipeline" (a runtime `vars()` approach silently fails).

### `ModalBody` is a `ScrollView` — child layout goes on `contentContainerClassName`

gluestack's `ModalBody` (and any raw `ScrollView`) rejects child-layout utilities on `className`:
`items-*`, `justify-*`, `gap-*`, and child `flex-*` must go on `contentContainerClassName`, else
you get `Invariant Violation: ScrollView child layout (["alignItems"]) must be applied through the
contentContainerStyle prop`. Keep only the scroll view's own box styling (margins, its own bg) on
`className`.

### `className` is applied by import-rewriting — only on remapped components

NativeWind v5 **removed the v4 JSX transform** and instead rewrites `react-native` imports to
`react-native-css`'s className-aware components at the Metro layer
(<https://www.nativewind.dev/blog/v5-migration-guide>). This is why gluestack components style
correctly — they wrap their primitives internally via the unified **`styled()`** API (v5's
replacement for the deprecated `cssInterop`/`remapProps`).

**The trap:** a bare `className` on a component that is NOT a core RN component and NOT gluestack
and NOT `styled()`-wrapped is silently dropped. The worst offender is **`SafeAreaView`** — even
though `react-native-safe-area-context` *is* remapped, the wrapper interops `SafeAreaProvider`
only; `SafeAreaView` is re-exported raw. A `className="flex-1"` on it collapses the layout →
**blank screen**. Fix: `<SafeAreaView style={{ flex: 1 }}>` with a core `<View className="flex-1 …">`
child. Full write-up (and the `styled()` escape hatch for other third-party components) in the
**mobile-setup** skill → "`className` only works on remapped components" (issue #15).

### Freshly-added scaffolds fail `typecheck` with TS2590 — strip the needless `styled()`

`npx gluestack-ui add` copies scaffolds that wrap **everything** in `styled()`, including RN core
components. That is redundant under v5 (Metro already rewrote those imports, see above) and it
breaks typecheck: `styled()`'s return type is a mapped type over the component's *entire* prop
union, and Reanimated / `@legendapp/motion` wrapped components blow TypeScript's
union-complexity limit.

```
error TS2590: Expression produces a union type that is too complex to represent.
```

**The budget is per-file and cumulative, so the error count lies.** Fixing one `styled()` call
makes the error jump to the next call in the same file, and clearing a whole file surfaces a new
error in a *different* file that was previously silent. Never assume "1 error left" means one fix
left — re-run `npx tsc --noEmit` after every change and keep going until it prints
`No errors found`.

Find every candidate:

```bash
cd apps/mobile
grep -rn "styled(" src/components/ | grep -vE "styled\((UIIcon|UI[A-Z])"   # wrapped non-gluestack components
grep -rln "createAnimatedComponent\|createMotionAnimatedComponent\|Motion\." src/components/
```

Decision tree per `styled(X, …)` call:

| `X` is… | Action |
|---|---|
| an RN core component (`View`, `Pressable`, `ScrollView`, `FlatList`, `VirtualizedList`, `SectionList`) or `H4` from `@expo/html-elements` | **Delete the wrapper.** Pass `X` directly to the `create*()` call. Metro's import rewriting already handles `className` *and* `contentContainerClassName`. |
| a gluestack creator export (`UIIcon`, …) | **Keep `styled()`.** Nothing else makes it className-aware. |
| Reanimated / Motion wrapped (`Animated.createAnimatedComponent(View)`, `createMotionAnimatedComponent(Pressable)`, `Motion.View`) | **Keep `styled()`, but narrow the props first** (below). These still need the wrapper, so shrink what `styled()` has to map over. |

Narrow an animated component to only the props actually passed to it — cast at the
`createAnimatedComponent` call, not at the `styled()` call (an `as` on the result still forces TS
to compute the exploding source type):

```ts
type IAnimatedViewProps = {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  entering?: React.ComponentProps<typeof Animated.View>["entering"];
  exiting?: React.ComponentProps<typeof Animated.View>["exiting"];
};
const AnimatedView = Animated.createAnimatedComponent(View) as React.ComponentType<IAnimatedViewProps>;
const StyledAnimatedView = styled(AnimatedView, { className: "style" });
```

A `Pick<React.ComponentProps<typeof View>, …>` is **not** narrow enough on its own — and keeping
`MotionComponentProps<…>` whole is still fine, since gluestack passes `initial`/`animate`/`exit`
through. Check what the scaffold actually passes before choosing the prop list (grep the file for
`<UIFoo.Content` / `<UIFoo.Backdrop`).

Worked examples in the repo: `src/components/actionsheet/index.tsx` ships the correct
no-`styled()` shape already — **diff a broken scaffold against it before hand-fixing anything**,
since gluestack ships both shapes. `modal/index.tsx` and `toast/index.tsx` show the narrowing
pattern; `select/select-actionsheet.tsx` shows both together.

### `nativeStyleToProp` is deprecated → `nativeStyleMapping`

Older scaffolds use the v4 key and fail with `Type '{ color: true; }' is not assignable to type
'undefined'`:

```bash
grep -rn "nativeStyleToProp" apps/mobile/src/   # rename each hit to nativeStyleMapping
```

```ts
// spinner/index.tsx
styled(ActivityIndicator, { className: { target: "style", nativeStyleMapping: { color: true } } });
```

> **Known upstream bug — do not "fix" it via tsconfig.** `react-native-css` ships
> `runtime.d.ts → ./web` and `runtime.native.d.ts → ./native`, but its root `exports` declares no
> `react-native` types condition. TypeScript therefore checks the app against the **web** runtime
> while Metro bundles the **native** one. Both obvious corrections — `moduleSuffixes: [".native", ""]`
> and a `paths` redirect to `runtime.native.d.ts` — turn 3 errors into 27, because the native
> typings are less complete. Narrow the props instead (above) and leave module resolution alone.
> Re-test when NativeWind 5 leaves preview (`nativewind@5.0.0-preview.4` at time of writing).

Mobile `typecheck` is **not** in CI (`.github/workflows/test.yml` typechecks only the frontend), so
these errors accumulate silently. Run `just mobile typecheck` after adding any component.

## Getting Started

- [Accessibility](https://gluestack.io/ui/docs/hooks/ui/docs/home/core-concepts/accessibility)
- [CLI](https://gluestack.io/ui/docs/home/getting-started/cli): The gluestack-ui CLI is a tool that simplifies integrating the gluestack-ui into your project. It provides commands for initialising and adding components to your project.
- [@gluestack-ui/utils](https://gluestack.io/ui/docs/home/getting-started/gluestack-ui-nativewind-utils): @gluestack-ui/utils provides a collection of utility functions for seamless integration of gluestack-ui and nativewind.
- [Installation](https://gluestack.io/ui/docs/hooks/ui/docs/home/getting-started/installation): The fastest way to get started. The CLI detects your project type, prompts you to choose a styling engine, and automates the installation.
- [Introduction](https://gluestack.io/ui/docs/home/overview/introduction): gluestack-ui offers customizable, beautifully designed components for your projects. Unlike traditional libraries, it's not a pre-packaged dependency. Choose the components you need and copy-paste them directly into your React, Next.js & React Native projects.
- [Getting Started](https://gluestack.io/ui/docs/home/overview/quick-start)
- [Customizing Theme](https://gluestack.io/ui/docs/home/theme-configuration/customizing-theme): Customize your UI theme in gluestack-ui v5 using shadcn-inspired semantic color tokens. Define your theme in config.ts and apply it via GluestackUIProvider for consistent, accessible styling.
- [Dark Mode](https://gluestack.io/ui/docs/home/theme-configuration/dark-mode): Customize the theme in gluestack-ui v5 with Tailwind dark mode, UI theme dark mode colors, and React Native light & dark mode for different color schemes and color mode support.
- [Default Tokens](https://gluestack.io/ui/docs/home/theme-configuration/default-tokens): gluestack-ui v5 ships with shadcn-inspired default tokens, including colored tokens that provide access to theme values and flexibility to build and customize your own themed UI components.

## Components

- [Accordion](/ui/docs/components/accordion): Explore gluestack's Accordion component for Expo, next.js, React & React Native. Build sleek, interactive accordions ...
- [ActionSheet](/ui/docs/components/actionsheet): Discover the ActionSheet component for Expo, React & React Native. Easily create intuitive action sheets in your app ...
- [AlertDialog](/ui/docs/components/alert-dialog): Build seamless React Native dialogs with the AlertDialog component. Enhance user engagement with smooth and responsiv...
- [Alert](/ui/docs/components/alert): gluestack-ui offers a responsive React Native Alert component with multiple styles. Easily integrate alerts into your...
- [All Components](/ui/docs/components/all-components): 30+ responsive components for every screen and style
- [Avatar](/ui/docs/components/avatar): Enhance your UI with our React Native Avatar component. Explore gluestack's-ui Avatar for seamless design and customi...
- [Badge](/ui/docs/components/badge): Display status indicators with the Badge component. Perfect for notifications, labels, and status tags in your React ...
- [BottomSheet](/ui/docs/components/bottomsheet): A bottom sheet component for React Native built on top of @gorhom/bottom-sheet with gluestack-ui styling and NativeWi...
- [Box](/ui/docs/components/box): Use gluestack-ui Box, a powerful box component for flexible layouts. Customize styles, props, and structure easily fo...
- [Button](/ui/docs/components/button): Discover a powerful button component for React & React Native with customizable size, shape, color, and behavior. Per...
- [Calendar](/ui/docs/components/calendar): A versatile calendar component for React & React Native with support for single, multiple, and range date selection. ...
- [Card](/ui/docs/components/card): Build beautiful interfaces with the gluestack-ui Card component. This React Native card offers a clean, modern design...
- [Center](/ui/docs/components/center): gluestack-ui Center component helps center-align text and content in React Native. Perfect for creating responsive la...
- [Chat AI](/ui/docs/components/chat-ai): Build AI chat interfaces with a comprehensive set of components including conversations, messages, attachments, and p...
- [Checkbox](/ui/docs/components/checkbox): Build interactive forms with a checkbox component for React & React Native. Features include hover, focus, disabled s...
- [DateTimePicker](/ui/docs/components/date-time-picker): A comprehensive date and time picker component that provides a native experience on mobile platforms and a custom-bui...
- [Divider](/ui/docs/components/divider): gluestack-ui's Divider component ensures a well-structured interface. Use the Divider component for clean content sep...
- [Drawer](/ui/docs/components/drawer): Implement a responsive Drawer component in React & React Native for navigation and content display. Learn how to inst...
- [Fab](/ui/docs/components/fab): Improve your React Native app with the FAB component. Learn how to implement a React Native FAB button using gluestac...
- [FormControl](/ui/docs/components/form-control): Enhance form usability with FormControl components in React. Manage validation, disabled states, and more. Easy integ...
- [Grid](/ui/docs/components/grid): Discover a powerful Grid component for React & React Native with customizable layout and behavior. Perfect for creati...
- [Heading](/ui/docs/components/heading): Explore the gluestack-ui Heading Component with installation steps, API reference, and usage examples. Customize Reac...
- [HStack](/ui/docs/components/hstack): Use the gluestack-ui HStack component in React Native to align elements horizontally. Easily customize layouts with s...
- [Icon](/ui/docs/components/icon): Use gluestack-ui Icon component to enhance your web and mobile app with scalable component icons. A must-have React N...
- [Image Viewer](/ui/docs/components/image-viewer): The Image Viewer component provides an interactive way to display images with advanced gesture support. It includes p...
- [Image](/ui/docs/components/image): Enhance your app with the Image component from gluestack-ui. Build seamless UI component images in React & React Nati...
- [Input](/ui/docs/components/input): A feature-rich React Native Input component – supports icons, validation, and styling options for seamless user input...
- [Link](/ui/docs/components/link): Enhance navigation with a React Native link component. Seamless UI link design for intuitive user experiences. Learn ...
- [LiquidGlass](/ui/docs/components/liquid-glass): A glass effect component for React Native built on top of expo-glass-effect with gluestack-ui styling and NativeWind ...
- [Menu](/ui/docs/components/menu): Build a user-friendly interface with gluestack-ui menu component in React & React Native, designed for easy navigatio...
- [Modal](/ui/docs/components/modal): Create smooth and accessible modals in React & React Native. Implement React modal components for alerts, forms, and ...
- [Popover](/ui/docs/components/popover): Improve user experience with a React Popover component—perfect for contextual modals, tooltips & interactive UI eleme...
- [Portal](/ui/docs/components/portal): Learn how to use the Portal component in React and React Native to render content outside the DOM hierarchy. Explore ...
- [Pressable](/ui/docs/components/pressable): Simplify interactive UI with the Pressable component in React Native. Manage hover, pressed, and focus events efficie...
- [Progress](/ui/docs/components/progress): Enhance your app with a responsive Progress component. gluestack-ui offers a React Native progress bar for tracking s...
- [Radio](/ui/docs/components/radio): Enhance your UI with a React Native radio button. Easily integrate radio buttons component with full accessibility su...
- [Select](/ui/docs/components/select): Enhance your React Native app with a customizable Select dropdown component. Supports accessibility, animations, and ...
- [Skeleton](/ui/docs/components/skeleton): Discover the ultimate gluestack-ui Skeleton component for React & React Native. Improve app loading visuals with glue...
- [Slider](/ui/docs/components/slider): Create smooth, interactive controls with the gluestack-ui React Native Slider component. Customize track height, valu...
- [Spinner](/ui/docs/components/spinner): Enhance your UI with the gluestack-ui Spinner component. A React Native spinner with ShadCN styling for smooth loadin...
- [Switch](/ui/docs/components/switch): Enhance your UI with a sleek Switch Component. Built on React Native, it's customizable and accessible. Perfect for t...
- [Table](/ui/docs/components/table): Effortlessly manage tabular data with gluestack-ui Table component. A fully customizable React Native table component...
- [Tabs](/ui/docs/components/tabs): Create an organized UI using the gluestack-ui Tabs component in React & React Native. Add tabbed navigation seamlessl...
- [Text](/ui/docs/components/text): Enhance your app with gluestack-ui's Text component—an adaptable React Native text area with multiple styles, sizes, ...
- [TextArea](/ui/docs/components/textarea): Easily integrate a React & React Native Textarea component with multi-line input. Customize size, state, and accessib...
- [Toast](/ui/docs/components/toast): gluestack-ui Toast component for React Native lets you show toast messages effortlessly. Improve your Toast component...
- [Tooltip](/ui/docs/components/tooltip): Create an intuitive UI using the gluestack-ui Tooltip component in React & React Native. Add hints & tooltips seamles...
- [VStack](/ui/docs/components/vstack): Use the gluestack-ui VStack component to arrange elements vertically with customizable spacing. Simplify layout desig...

## Hooks

- [useBreakpointValue](https://gluestack.io/ui/docs/hooks/use-break-point-value): Learn how to use the useBreakpointValue hook to manage breaking point values, breakpoint components.
- [useMediaQuery](https://gluestack.io/ui/docs/hooks/use-media-query): Implement responsive designs in React & React Native with the useMediaQuery hook and component.

## Full Documentation

- [Full documentation](https://gluestack.io/llms-full.txt): Complete documentation for all components and guides
