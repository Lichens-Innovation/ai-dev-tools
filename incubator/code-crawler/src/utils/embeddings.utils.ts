/**
 * Vector helpers for semantic search. Embeddings from Transformers.js use `normalize: true`, so dot product equals cosine similarity.
 */

export const l2NormalizeInPlace = (v: Float32Array): Float32Array => {
  let sumSq = 0;
  for (let i = 0; i < v.length; i += 1) {
    sumSq += v[i] * v[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0 || !Number.isFinite(norm)) {
    return v;
  }
  for (let i = 0; i < v.length; i += 1) {
    v[i] /= norm;
  }
  return v;
};

const dotProduct = (a: Float32Array, b: Float32Array): number => {
  if (a.length !== b.length) {
    throw new Error(`dotProduct: length mismatch (${a.length} vs ${b.length})`);
  }
  let s = 0;
  for (let i = 0; i < a.length; i += 1) {
    s += a[i] * b[i];
  }
  return s;
};

/**
 * Distance for ranking: smaller is more similar. For L2-normalized
 * vectors, dot equals cosine similarity in [-1, 1].
 */
export const cosineDistanceFromNormalizedVectors = (a: Float32Array, b: Float32Array): number => 1 - dotProduct(a, b);
