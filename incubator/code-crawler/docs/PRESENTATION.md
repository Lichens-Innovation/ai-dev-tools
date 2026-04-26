# code-crawler — Recherche sémantique dans le code (40 min)

> **Audience :** Développeurs + profils techniques non-développeurs
> **Durée :** ~40 min · **10 slides**
> **Fil conducteur :** Chaque slide répond à la question *"pourquoi cette étape existe ?"*

---

## Slide 1 — Le problème : chercher par intention, pas par mot (5 min)

### Message clé

`grep` cherche des **mots exacts**. On veut chercher des **idées**.

### Contenu

Deux fonctions qui font exactement la même chose dans deux langages différents :

```typescript
// TypeScript — service A
async function fetchWithRetry(url: string, maxAttempts = 3): Promise<Response> { … }
```

```python
# Python — service B
def http_retry_wrapper(endpoint: str, max_tries: int = 3) -> requests.Response: …
```

Un `grep -r "retry"` dans un repo qui n'utilise que `http_retry_wrapper` ne retourne **rien**.
La question qu'on veut pouvoir poser : `"find HTTP retry handling"` — et retrouver les deux.

> **Pour les non-développeurs :** c'est comme chercher « voiture » dans une bibliothèque
> dont tous les livres parlent d' « automobile » — même concept, mot différent.

### Image suggérée

```
┌─────────────────────────────────────────────────────────────────┐
│  Intention humaine : "trouver la gestion des retries HTTP"      │
├─────────────────────────────────┬───────────────────────────────┤
│         grep (lexical)          │   recherche sémantique        │
│  cherche les MOTS               │   cherche le SENS             │
│  ✗ rate fetchWithRetry          │   ✓ trouve fetchWithRetry     │
│  ✗ rate http_retry_wrapper      │   ✓ trouve http_retry_wrapper │
└─────────────────────────────────┴───────────────────────────────┘
```

### Démo

1. Terminal : `grep -r "retry" ./src` — montrer les résultats (limités au mot exact)
2. `POST /api/semantic-search-workspace-files` avec `{ "queryText": "HTTP retry handling", "nbResults": 5 }`
3. Comparer : la recherche sémantique remonte les deux fonctions malgré les noms différents

---

## Slide 2 — Ce qu'est un vecteur d'embedding (4 min)

### Message clé

Transformer du texte en **coordonnées dans un espace de sens**.

### Contenu

Un modèle d'embedding convertit un fragment de texte → tableau de ~768 nombres (un **vecteur**).

- Deux textes au **sens proche** → vecteurs **proches** dans l'espace (faible distance)
- Deux textes au **sens éloigné** → vecteurs **éloignés**
- La "distance" mesure le sens, pas les mots

> **Pour les non-développeurs :** imaginez que chaque texte est une étoile dans le ciel.
> Les étoiles proches partagent le même sens. La recherche sémantique = trouver les étoiles
> les plus proches de votre requête.

### Image suggérée

```
   "HTTP retry"  •
                  • "fetchWithRetry"         • "database schema"
                                              • "SQL migration"
←———————————— sens "réseau / HTTP" ————————————— sens "base de données" ——→
```

Deux clusters visibles → points proches = sens proche, indépendamment des mots utilisés.

### Pointeurs de code (développeurs)

- `src/semantic-service/language-model-embedding.pipeline.ts` — `embedTextsWithLanguageModel()`
- Modèle : **`jinaai/jina-embeddings-v2-base-code`** (768 dimensions, entraîné sur du code)
- Pipeline : `pipeline("feature-extraction", model)` → mean pooling → L2 normalization

---

## Slide 3 — Pourquoi le code est spécial : les défis (5 min)

### Message clé

Le code n'est pas du texte naturel — un découpage naïf casse le sens.

### Contenu — 4 défis

**Défi 1 — Multi-langages**
TypeScript, Python, C++, C# ont des structures syntaxiques totalement différentes.
Une seule approche de découpage ne peut pas fonctionner pour tous.

**Défi 2 — Les identifiants ne ressemblent pas à des mots**
`buildAggregatedQueryMatchFromFileChunks` n'existe dans aucun dictionnaire.
Un modèle généraliste (entraîné sur Wikipedia) n'en comprend pas le sens → besoin de
modèles **spécialisés code** comme Jina ou CodeBERT.

**Défi 3 — Un découpage fixe brise le contexte**
Couper après 200 lignes peut tomber en plein milieu d'une fonction.
Un chunk incomplet = vecteur peu fiable = mauvais résultats.

**Défi 4 — Les relations entre symboles comptent**
Une fonction qui *appelle* `validateInput()` puis `saveToDb()` dit implicitement
qu'elle fait de la validation ET de la persistance — même si ces mots n'apparaissent pas
dans son corps.

### Image suggérée

```
Découpage naïf (lignes fixes)      Découpage AST (frontières syntaxiques)
───────────────────────────────    ───────────────────────────────────────
  lignes 1-20  → chunk 1             function foo() {   ← chunk 1 complet
  lignes 21-40 → chunk 2               …
  ← coupe foo() en deux !            }
                                     function bar() {   ← chunk 2 complet
                                       …
                                     }
```

### Pointeurs de code (développeurs)

- Chunkers par langue :
  - `src/semantic-service/chunking/graph-chunks-for-ecmascript.ts` (TypeScript/JavaScript)
  - `src/semantic-service/chunking/graph-chunks-for-python.ts`
  - `src/semantic-service/chunking/graph-chunks-for-cpp.ts`
  - `src/semantic-service/chunking/graph-chunks-for-csharp.ts`
- Registre de langues : `src/semantic-service/chunking/tree-sitter-language-registry.ts`

---

## Slide 4 — La solution : chunks AST + graphe d'appels (5 min)

### Message clé

On découpe selon les **frontières syntaxiques réelles** et on ajoute le contexte de
**qui appelle qui**.

### Contenu

**Tree-sitter** analyse le code source → arbre syntaxique (AST).
On extrait les nœuds signifiants : fonctions, méthodes, classes.

Chaque chunk reçoit un **header contextuel** avant embedding :

```
File: src/semantic-service/search/workspace-semantic-query.service.ts
Repo: code-crawler
Type: Function
Name: runWorkspaceSemanticQuery
Calls: embedTextsWithLanguageModel, queryNearest, fuseHybridChunkMatches
CalledBy: semanticSearchWorkspaceFiles
```

Suivi du corps de la fonction. Ce header est inclus dans le texte embeddé :
le vecteur « sait » **où** se situe le fragment et **ce qu'il fait** dans le graphe d'appels.

> **Pour les non-développeurs :** c'est comme mettre une fiche signalétique sur chaque
> page d'un livre : titre du chapitre, sujets traités, références aux autres chapitres.
> Le modèle indexe la fiche + la page ensemble.

### Image suggérée

```
  Fichier TypeScript brut
         │
         ▼  Tree-sitter → AST
  ┌────────────────────────────┐
  │  class SearchService       │ ← nœud AST
  │    runWorkspaceQuery() {   │ ← chunk 1  ──→ embedText = header + code
  │      …                     │
  │    }                       │
  │    embedQuery() {          │ ← chunk 2  ──→ embedText = header + code
  │      …                     │
  │    }                       │
  └────────────────────────────┘
```

### Pointeurs de code (développeurs)

- `src/semantic-service/chunking/graph-chunks.ts` — `buildSemanticGraphChunksForSource()` (point d'entrée)
- `src/semantic-service/chunking/graph-chunks.utils.ts` — `buildCallsAndCalledBy()`, `buildEmbedHeader()`

### Démo

Montrer un vrai embed text dans SQLite :

```sql
SELECT DOCUMENT FROM FILE_INDEX_CHUNK
WHERE FILE_ID LIKE '%workspace-semantic-query%'
LIMIT 2;
```

Le résultat montre le header + le code source brut concaténés.

---

## Slide 5 — Pipeline d'indexation : de la source à SQLite (3 min)

### Message clé

Pipeline linéaire avec **idempotence SHA-256** : on ne ré-indexe que ce qui a changé.

### Contenu

```
Dépôts Git (CODE_CRAWLER_ROOT)
  ↓  Parcours des fichiers
FileRecords (chemin + SHA-256 du contenu)
  ↓  Skip si SHA-256 inchangé
Chunking AST + graphe d'appels (tree-sitter)
  ↓  Batch embedding (Transformers.js / Jina)
Persistance SQLite :
  ├─ FILE_INDEX_METADATA    → 1 ligne / fichier (dépôt, chemin, SHA-256)
  ├─ FILE_INDEX_CHUNK       → 1 ligne / chunk (texte lisible, plages de lignes)
  ├─ FILE_INDEX_CHUNK_VEC   → vecteurs sqlite-vec (KNN)
  └─ FILE_INDEX_CHUNK_FTS   → texte plein FTS5/BM25 (recherche lexicale)
```

> Les quatre tables sont synchronisées par des triggers SQLite.
> Modifier un fichier = supprimer + recréer ses chunks et vecteurs en transaction.

### Pointeurs de code (développeurs)

- `src/semantic-service/indexing/semantic-index-upsert.pipeline.ts` — `tryUpsertFileRecordsToSemanticIndex()`
- `src/semantic-service/persistence/sqlite/semantic-index-sqlite.schema.ts` — schéma complet

### Démo

```bash
POST /api/prepare-repository-for-semantic-search
{ "repository": "code-crawler" }
```

Observer les logs de batch embedding dans le terminal.

---

## Slide 6 — KNN : récupérer plus pour trouver mieux (5 min)

### Message clé

La recherche vecteur retourne des **chunks**, pas des fichiers.
On en prend **5× plus que demandé** pour avoir de la matière à consolider.

### Contenu

Pour `nbResults = 10 fichiers` demandés, on récupère `5 × 10 = **50 chunks**`.

**Pourquoi ?**

Un même fichier peut avoir plusieurs chunks pertinents. Si on ne prend que 10 chunks,
un fichier qui contient 3 chunks très pertinents occupe 3 places sur 10 — et on manque
d'autres fichiers intéressants.

En prenant 50 chunks, on donne à l'étape de consolidation (slide 8) suffisamment de
candidats pour travailler.

**KNN via sqlite-vec :**
- Distance cosinus dans `FILE_INDEX_CHUNK_VEC`
- Résultats triés par distance croissante (plus petit = plus similaire)
- Filtrables par `repository` et `language`

### Image suggérée

```
  Requête (vecteur q)
         │
         ▼  KNN sqlite-vec — on demande 50 chunks
  ┌──────────────────────────────────────────┐
  │ chunk A — fichier X — distance = 0.12    │
  │ chunk B — fichier X — distance = 0.14    │ ← 2 chunks du même fichier X
  │ chunk C — fichier Y — distance = 0.18    │
  │ chunk D — fichier X — distance = 0.20    │ ← 3e chunk de fichier X !
  │ chunk E — fichier Z — distance = 0.22    │
  │ …  (jusqu'à 50)                          │
  └──────────────────────────────────────────┘
         │
         ▼  consolidation → 10 fichiers (slide 8)
```

### Pointeurs de code (développeurs)

- `src/semantic-service/search/workspace-semantic-query.service.ts` — `runWorkspaceSemanticQuery()` (ligne ~69)
- `src/semantic-service/search/match-consolidation-by-file.utils.ts` — `resolveChunkFetchCountForFileConsolidation()` : facteur ×5, plafonné à 500

---

## Slide 7 — Recherche hybride : vecteur + lexical (4 min)

### Message clé

Le vecteur seul **rate les noms exacts**. Le BM25 seul **rate le sens**.
On fusionne les deux pour avoir les avantages de chacun.

### Contenu

**Cas où le vecteur échoue :**
Chercher `"buildSafeFts5MatchQuery"` — nom trop spécifique pour qu'un modèle d'embedding
en comprenne le sens. La recherche vectorielle ne remonte pas le bon fichier.

**Cas où le BM25 échoue :**
Chercher `"gestion des erreurs réseau"` — aucun fichier TypeScript ne contient
littéralement ces mots français.

**Solution — fusion pondérée :**

```
Requête
  ├──→ Embedding → KNN sqlite-vec    → 50 chunks + distance cosinus
  └──→ Tokenisation → FTS5 / BM25   → 50 chunks + score BM25
              │                               │
        min-max [0,1]               min-max [0,1]
              │                               │
           × 0.7                  +        × 0.3
              └───────────────┬─────────────┘
                        score hybride
                              │
                     tri croissant (→ rang final)
```

### Pointeurs de code (développeurs)

- `src/semantic-service/search/hybrid-chunk-fusion.utils.ts` — `fuseHybridChunkMatches()`
  - Constantes : `HYBRID_WEIGHT_VECTOR = 0.7`, `HYBRID_WEIGHT_LEXICAL = 0.3`
- `src/semantic-service/search/fts5-query-sanitize.utils.ts` — `buildSafeFts5MatchQuery()`
  (tokénise la requête, échappe les caractères spéciaux FTS5)

---

## Slide 8 — Consolidation par fichier : le boost multi-chunks (5 min)

### Message clé

Un fichier avec **4 chunks pertinents** est plus fiable qu'un fichier avec **1 seul chunk**.
On le récompense.

### Contenu

Après la fusion hybride, on a une liste de **chunks** classés.

**Étape 1 — Grouper par fichier**
On regroupe tous les chunks par `fileId`.

**Étape 2 — Compter les "bons" chunks**
Pour chaque fichier, on compte les chunks dont la distance est dans une bande
de **±12%** autour du meilleur chunk du fichier.
Ce comptage est **plafonné à 6** (évite de sur-favoriser les très gros fichiers).

**Étape 3 — Effective Distance**

```
effective_distance = best_chunk_distance / (1 + 0.25 × (nb_chunks_proches − 1))
```

Résultat : un fichier avec 3 bons chunks voit sa distance divisée par 1.5 → il remonte.

### Image suggérée

```
AVANT consolidation (chunks)              APRÈS consolidation (fichiers)
──────────────────────────────────        ──────────────────────────────────
chunk A  fichier Y  d = 0.110            fichier X  eff_d = 0.120/1.50 = 0.080 ↑ (1er !)
chunk B  fichier X  d = 0.120    ──→     fichier Y  eff_d = 0.110  (1 seul chunk)
chunk C  fichier X  d = 0.135            fichier Z  eff_d = 0.200
chunk D  fichier X  d = 0.140
chunk E  fichier Z  d = 0.200

fichier Y était 1er (meilleur chunk unique)
fichier X passe devant grâce à ses 3 chunks proches → boost ×1.5
```

### Pointeurs de code (développeurs)

- `src/semantic-service/search/match-consolidation-by-file.utils.ts`
  - `consolidateSemanticQueryMatchesByFile()` — point d'entrée
  - `buildAggregatedQueryMatchFromFileChunks()` — agrège les chunks d'un fichier
  - `computeEffectiveDistanceForFileHits()` — formule de boost
- Constantes :
  - `FILE_CONSOLIDATION_MULTI_CHUNK_BOOST_WEIGHT = 0.25`
  - `FILE_CONSOLIDATION_PROXIMITY_SLACK = 0.12`
  - `FILE_CONSOLIDATION_MAX_BOOSTED_CHUNK_COUNT = 6`

### Démo

Dans la réponse JSON de `POST /api/semantic-search-workspace-files` :
- Le champ `relatedChunkCount` indique combien de chunks ont contribué au boost
- Chercher `"file consolidation boost scoring"` avec `nbResults: 8`
- Les fichiers avec `relatedChunkCount > 1` ont bénéficié du boost

---

## Slide 9 — Le re-ranker : dernière passe de précision (4 min)

### Message clé

Les modèles d'embedding (bi-encodeurs) sont rapides mais approximatifs.
Le **cross-encoder** regarde la requête ET le chunk ensemble → bien plus précis.

### Contenu

**Bi-encodeur (embedding — phase 1)**

```
Requête ──→ [Modèle] ──→ vecteur R ─┐
                                      ├──→ distance cosinus → score
Chunk   ──→ [Modèle] ──→ vecteur C ─┘
```

Rapide, scalable. Mais le modèle **ne voit pas la requête** quand il encode le chunk.

**Cross-encodeur (re-ranker — phase 2)**

```
[ Requête + Chunk ] ──→ [Modèle] ──→ score de pertinence direct
```

Le modèle reçoit les deux textes **ensemble** → il peut évaluer la pertinence réelle.
Trop lent pour tout le corpus → on l'applique seulement sur les **top-N candidats** déjà filtrés.

**Pipeline :**
Fusion hybride → top candidats → **cross-encoder** → re-tri final → consolidation par fichier

### Image suggérée

```
                  Phase 1 — rapide            Phase 2 — précis
                  Bi-encodeur                 Cross-encodeur
                  ──────────────────          ──────────────────────
  Grande échelle  Tout le corpus              Top-N seulement
  Temps           Millisecondes               Quelques secondes
  Précision       Bonne                       Excellente
  Entrée          Vecteurs séparés            (Requête, Chunk) ensemble
```

### Pointeurs de code (développeurs)

- `src/semantic-service/search/cross-encoder-rerank.utils.ts` — `rerankWithCrossEncoder()`
  - Transformers.js `text-classification` pipeline avec `text_pair: [query, document]`
  - Normalisation min-max des scores + inversion en distance
  - Fallback gracieux : si le modèle n'est pas configuré, l'ordre hybride est conservé
- Variable d'env : `CODE_CRAWLER_RERANKER_MODEL` (ex. `cross-encoder/ms-marco-MiniLM-L-6-v2`)

### Démo

Montrer le fallback dans le code : si le re-ranker échoue ou n'est pas configuré,
la recherche continue avec l'ordre hybride — la robustesse est explicite dans le code.

---

## Slide 10 — Pipeline complet + démo live (5 min)

### Message clé

Toutes les étapes ensemble — du texte en entrée aux fichiers classés en sortie.

### Pipeline de bout en bout

```
POST /api/semantic-search-workspace-files
{ queryText, nbResults, repository?, languages? }
         │
         ▼
embedTextsWithLanguageModel([queryText])  →  vecteur requête  (Float32Array 768-dim)
         │
  ┌──────┴───────┐
  ▼              ▼
KNN           FTS5/BM25
sqlite-vec    (lexical)
5×nbResults   5×nbResults
chunks        chunks
  │              │
  └──── fusion hybride 70% / 30% ────┘
                │
        rerankWithCrossEncoder()    ← optionnel (cross-encoder)
                │
        consolidateByFile()
        → effectiveDistance boost
                │
        Top nbResults fichiers
        (relatedChunkCount, lineRanges, documentPreview)
```

### Pointeurs de code (développeurs)

`src/semantic-service/search/workspace-semantic-query.service.ts` — `runWorkspaceSemanticQuery()`
Le pipeline complet en ~45 lignes séquentielles — excellent point d'entrée pour explorer le code.

### Démo live

1. `yarn start:prod` (ou serveur déjà lancé)
2. `POST /api/prepare-repository-for-semantic-search` si pas encore indexé
3. Recherches représentatives :

   | Requête                            | Ce qu'elle illustre                             |
   |------------------------------------|-------------------------------------------------|
   | `"HTTP retry handling"`            | Puissance sémantique cross-language             |
   | `"file consolidation score boost"` | Retrouve `match-consolidation-by-file.utils.ts` |
   | `"cross encoder reranking"`        | Retrouve `cross-encoder-rerank.utils.ts`        |

4. Sur chaque résultat, commenter les champs :
   - `relatedChunkCount` → combien de chunks ont contribué
   - `effectiveDistance` → distance après boost
   - `documentPreview` → extrait du chunk le plus pertinent avec plages de lignes

---

## Récapitulatif — Pourquoi chaque étape

| Étape                        | Problème résolu                                                    |
|------------------------------|--------------------------------------------------------------------|
| Chunking AST                 | Découpage aux frontières syntaxiques réelles, pas au hasard        |
| Graph hints (Calls/CalledBy) | Contexte de relation entre symboles dans l'embed text              |
| Fetch 5×                     | Assez de matière pour la consolidation sans sur-charger la mémoire |
| Fusion hybride 70/30         | Vecteur = sens · Lexical = noms exacts · ensemble = robustesse     |
| Cross-encoder                | Précision finale sur les top candidats déjà filtrés                |
| Consolidation + boost        | Fichier avec plusieurs signaux pertinents > fichier avec un seul   |

---

## Ressources

- `src/semantic-service/search/workspace-semantic-query.service.ts` — pipeline de recherche complet
- `src/semantic-service/chunking/graph-chunks.ts` — orchestration du chunking
- `docs/DATABASE.md` — schéma SQLite et diagramme ER
- `README.md` — setup, configuration des modèles, variables d'environnement
