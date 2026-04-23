/**
 * Per-language extension groups for semantic graph chunking and tree-sitter grammar selection.
 * Each language: a readonly tuple (`*_FILE_EXTENSIONS`) and a lookup set (`*_FILE_EXTENSION_SET`).
 */

export const TYPESCRIPT_FILE_EXTENSIONS = [".ts", ".tsx"] as const;
export const TYPESCRIPT_FILE_EXTENSION_SET = new Set<string>(TYPESCRIPT_FILE_EXTENSIONS);

export const JAVASCRIPT_FILE_EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs"] as const;
export const JAVASCRIPT_FILE_EXTENSION_SET = new Set<string>(JAVASCRIPT_FILE_EXTENSIONS);

export const PYTHON_FILE_EXTENSIONS = [".py", ".pyi"] as const;
export const PYTHON_FILE_EXTENSION_SET = new Set<string>(PYTHON_FILE_EXTENSIONS);

/** C/C++ sources and headers parsed with tree-sitter-cpp. */
export const CPP_FILE_EXTENSIONS = [".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx", ".h"] as const;
export const CPP_FILE_EXTENSION_SET = new Set<string>(CPP_FILE_EXTENSIONS);

export const CSHARP_FILE_EXTENSIONS = [".cs"] as const;
export const CSHARP_FILE_EXTENSION_SET = new Set<string>(CSHARP_FILE_EXTENSIONS);
