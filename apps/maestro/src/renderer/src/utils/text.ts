// Re-export only. The helpers themselves live in `@repo/maestro-core/text`.
//
// They were copied here when the session log came across and the create-* routes had not been
// ported. Now that they have, the copy is actively dangerous: `buildDesc` decides the
// `description:` a form PREVIEWS and the one the node-side scaffold WRITES, and two
// implementations of it means a preview that can quietly stop matching the file on disk. So there
// is one implementation, in the package both processes can import from.
//
// `@repo/maestro-core/text` — the SUBPATH, not the barrel. The barrel re-exports fs and
// child_process; test/isolation.ts fails the build if it ever appears outside src/main. This
// module has no imports at all.

export { buildDesc, clip, firstSentence, joinOxford, stripNamespace, titleFromName } from "@repo/maestro-core/text";
