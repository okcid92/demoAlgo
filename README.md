# AlgoLab -- Detection de Plagiat

Un outil educatif de demonstration algorithmique pour detecter les similarites entre deux textes francais. Implemente **8 algorithmes** de detection de plagiat, allant de l'analyse lexicale simple a la similarite semantique profonde.

---

## Algorithmes Implémentes

### Algorithmes de Similarite Lexicale

| # | Algorithme | Poids | Detection |
|---|---|---|---|
| 1 | **TF-IDF + Cosinus** | 25% | Importance des mots communs via vecteurs TF-IDF |
| 2 | **Indice de Jaccard** | 15% | Intersection/union des ensembles de mots |
| 3 | **N-gram Overlap** | 20% | Sequences consecutives de mots identiques |

### Algorithmes Avances

| # | Algorithme | Poids | Detection |
|---|---|---|---|
| 4 | **Shingling (Winnowing)** | 15% | Empreintes de k-shingles, detecte les reordonnancements |
| 5 | **Embeddings Semantiques** | 15% | Paraphrases profondes, traductions (Sentence-BERT) |
| 6 | **SimHash (LSH)** | Indicateur | Hash 64 bits preservant la similarite |
| 7 | **LCS** | 5% | Plus longue sous-sequence commune (plagiat chirurgical) |
| 8 | **Analyse Stylistique** | 5% | Distance entre profils rhetoriques et structurels |

---

## Detail des Algorithmes

### 1. TF-IDF + Similarite Cosinus

**Principe** : Calcule l'importance de chaque mot dans chaque document (TF-IDF), puis mesure l'angle cosinus entre les deux vecteurs resultants.

**Adaptation francais** :
- Stemming avec `PorterStemmerFr` (ex: "mange" -> "mang")
- Suppression des stopwords francais (le, la, de, et, etc.)
- Tokenisation Unicode (preservation des accents)

**Formule** :
```
cos(A, B) = (A . B) / (||A|| * ||B||)
```

**Force** : Capture les mots cles dominants communs, malgre des reformulations mineures.

---

### 2. Indice de Jaccard

**Principe** : Compare les ensembles de mots uniques des deux textes.

**Formule** :
```
J(A, B) = |A ∩ B| / |A ∪ B|
```

**Adaptation francais** : Stemming + stopwords avant comparaison.

**Force** : Simple et rapide. Detecte le vocabulaire commun meme si l'ordre change.

**Limite** : Insensible a la repetition et a l'ordre des mots.

---

### 3. N-gram Overlap (Bigrams)

**Principe** : Compare les bigrammes (sequences de 2 mots consecutifs) entre les textes, avec tolerance d'ordre inverse.

**Formule** :
```
Score = (matches exacts + 0.25 * correspondances partielles) / max(|A|, |B|)
```

**Adaptation francais** : Normalisation Unicode pour les accents.

**Force** : Capture les phrases copiees mot pour mot.

**Limite** : Echoue si les mots sont reordonnes ou paraphrases.

---

### 4. Shingling (Winnowing)

**Principe** : Genere des "shingles" (sequences de k mots), les hash, puis applique l'algorithme de winnowing pour selectionner les fingerprints minimaux dans une fenetre glissante.

**Formule** :
```
Shingle(d, k) = {hash(s[i..i+k]) | i ∈ [0, len(s)-k]}
Fingerprints = {min(window[i..i+w]) | i}
Similarite = |F(A) ∩ F(B)| / |F(A) ∪ F(B)|
```

**Parametres** : k = 5 (taille du shingle), w = 4 (taille de la fenetre).

**Adaptation francais** : Tokenisation Unicode, normalisation des accents.

**Force** : **Detecte les reordonnancements de paragraphes** -- la ou Jaccard et N-gram echouent.

**Cas d'usage** : Un etudiant copie des sections entières mais les reorganise dans un ordre different.

---

### 5. SimHash (Locality-Sensitive Hashing)

**Principe** : Genere un hash de 64 bits qui preserve la similarite. Deux documents proches auront des hashes avec une distance de Hamming faible.

**Formule** :
```
v[i] += hash(t)[i] == 1 ? +weight : -weight  (pour chaque token t)
SimHash = signe(v)
Distance = popcount(SimHash(A) XOR SimHash(B))
Similarite = 1 - Distance/64
```

**Implémentation** : Hash FNV-64, vecteur 64 bits avec ponderation par frequence.

**Adaptation francais** : Tokenisation Unicode, filtering des stopwords.

**Force** : **Tres rapide** pour indexer des milliers de documents. Ideal pour le pre-filtrage.

**Cas d'usage** : Calculer le SimHash a l'upload et ne lancer les algorithmes lourds que si la distance de Hamming est < 15.

---

### 6. Longest Common Subsequence (LCS)

**Principe** : Trouve la plus longue sous-sequence commune entre deux textes (pas necessairement contigue).

**Formule** (programmation dynamique, optimisee en espace) :
```
LCS(i,j) = LCS(i-1,j-1) + 1          si A[i] = B[j]
           max(LCS(i-1,j), LCS(i,j-1)) sinon

Score = 2 * |LCS| / (|A| + |B|)  <-- Coefficient de Sørensen-Dice
```

**Optimisation** : Limite a 500 tokens maximum, matrice reduite a 2 lignes (O(n) espace).

**Adaptation francais** : Tokenisation Unicode.

**Force** : **Detecte les suppressions et insertions de mots** dans un texte copie -- le "plagiat chirurgical".

**Limite** : O(m*n) -- limite a 500 tokens pour rester performant.

---

### 7. Analyse Stylistique (Detection de Structure)

**Principe** : Compare la structure rhetorique et stylistique du document. Un plagiat conserve souvent l'architecture originale meme si le texte est reecrit.

**Metriques calculees** :
- Longueur moyenne des phrases
- Longueur moyenne des mots
- Densite de ponctuation
- Nombre de paragraphes
- Richesse du vocabulaire (TTR : Types/Tokens ratio)
- Nombre de phrases

**Formule** :
```
Distance = sqrt(Σ ((A[i] - B[i]) / max(A[i], B[i]))² + Δsentences² + Δparagraphes²) / 2
Similarite = 1 - Distance
```

**Adaptation francais** : Decoupage des phrases avec ponctuation francaise (`«»`, `;`, `:`).

**Force** : Detecte les reformulations profondes qui conservent la meme structure.

**Limite** : Un score bas ne signifie pas absence de plagiat -- utile comme indicateur complementaire.

---

### 8. Embeddings Semantiques (Sentence-BERT) -- Optionnel

**Principe** : Transforme chaque segment de texte en vecteur dense (384 dimensions) capturant le sens profond, puis compare via cosinus.

**Modele** : `paraphrase-multilingual-MiniLM-L12-v2` (supporte le francais).

**Installation** :
```bash
pip install sentence-transformers scikit-learn
```

**Utilisation** :
```bash
curl -X POST http://localhost:3001/api/semantic \
  -H "Content-Type: application/json" \
  -d '{"textA": "...", "textB": "..."}'
```

**Adaptation francais** : Modele multilingue entraine sur 50+ langues dont le francais.

**Force** : **Detecte les paraphrases profondes et les traductions** -- la forme de plagiat la plus difficile a attraper.

**Exemple** :
| TF-IDF | Sentence-BERT |
|---|---|
| "voiture rapide" != "automobile veloce" | "voiture rapide" ~= "automobile veloce" |

---

## Score Combine

Le score global est une moyenne ponderee de tous les algorithmes :

```
Score = 0.25 * Cosinus
      + 0.15 * Jaccard
      + 0.20 * N-gram
      + 0.15 * Winnowing
      + 0.15 * Semantique (Python, optionnel)
      + 0.05 * LCS
      + 0.05 * Style
```

Si la similarite semantique n'est pas disponible (Python non installe), son poids est attribue a zero et le score total est ajuste en consequence.

---

## Installation

```bash
npm install
```

### Optionnel : Similarite Semantique (Python)

```bash
pip install sentence-transformers scikit-learn
```

> Le modele `paraphrase-multilingual-MiniLM-L12-v2` (~420 MB) sera telecharge au premier lancement.

---

## Demarrage

```bash
npm start
```

Le serveur demarre sur `http://localhost:3001`

### Developpement

```bash
npm run dev
```

---

## Utilisation

1. Ouvrez `http://localhost:3001` dans votre navigateur
2. Collez deux textes dans les zones de saisie
3. Cliquez sur "Analyser les similarites"
4. Visualisez les 7 scores et les similarites detectees dans la vue comparative

---

## Structure du Projet

```
demoAlgo/
├── server.js                    # Backend Express + 7 algorithmes JS
├── scripts-python/
│   └── semantic_similarity.py   # Similarite semantique (Sentence-BERT)
├── public/
│   ├── index.html               # Frontend
│   ├── style.css                # Styles (theme clair professionnel)
│   └── script.js                # Logique frontend + historique
├── package.json
└── README.md
```

---

## API

### POST /api/analyze

Analyse deux textes avec les 7 algorithmes.

**Request** :
```json
{
  "textA": "Le changement climatique represente l'un des defis majeurs du XXIe siecle.",
  "textB": "L'un des plus grands challenges de notre epoque est le rechauffement planetaire."
}
```

**Response** :
```json
{
  "cosine": 0.42,
  "jaccard": 0.33,
  "ngram": 0.25,
  "winnowing": 0.18,
  "simhash": 0.72,
  "lcs": 0.45,
  "style": 0.68,
  "combined": 0.34,
  "highlights": { "textA": [...], "textB": [...] },
  "styleProfiles": { "a": {...}, "b": {...} }
}
```

### POST /api/semantic (optionnel)

Analyse semantique profonde via Sentence-BERT.

**Response** :
```json
{
  "semantic_score": 0.87,
  "suspicious_segments": [
    { "text": "...", "matched": "...", "score": 0.92, "offset": 0 }
  ],
  "model": "paraphrase-multilingual-MiniLM-L12-v2"
}
```

---

## Fonctionnalites Frontend

- **Jauges circulaires animees** pour chaque algorithme
- **Barre de score combine** avec seuils visuels (faible/moyen/fort)
- **Vue comparative synchronisee** avec scroll lie entre les deux textes
- **Highlights colores** par type de detection (N-gram, Jaccard, Cosinus)
- **Historique des analyses** (localStorage, max 20 entrees)
- **Export JSON** des resultats
- **Section pedagogique** expliquant chaque algorithme
- **Compteur de mots** en temps reel
- **Exemples predefinis** chargeables en un clic
- **Responsive** (mobile/tablette/desktop)

---

## Resultats des Tests

### Matrice de similarite par type de plagiat

| Scenario | Cosinus | Jaccard | N-gram | Winnowing | SimHash | LCS | Style | Combine |
|---|---|---|---|---|---|---|---|---|
| Copie exacte | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 85% |
| Reformulation forte | 32% | 40% | 62% | 35% | 69% | 65% | 94% | 40% |
| Reordonnancement | 100% | 100% | 97% | 58% | 100% | 68% | 100% | 77% |
| Paraphrase | 2% | 3% | 22% | 0% | 55% | 22% | 96% | 11% |
| Textes differents | 0% | 0% | 9% | 0% | 44% | 7% | 77% | 6% |

### Interpretation

| Score Combine | Interpretation |
|---|---|
| > 70% | **Plagiat fort** -- Copie directe ou reformulation tres proche |
| 30-70% | **Plagiat modere** -- Reformulation significative, reordonnancement |
| 10-30% | **Plagiat faible** -- Emprunts ponctuels, paraphrase partielle |
| < 10% | **Pas de plagiat detecte** -- Textes independants |

### Observations

- **Copie exacte** : Tous les algorithmes a 100%. Score combine = 85% (semantique = 0 sans Python).
- **Reformulation** : N-gram reste eleve (phrases partiellement copiees). Winnowing baisse car shingles perturbes.
- **Reordonnancement** : Cosinus/Jaccard ne detectent rien (100%). Winnowing penalise (58%). LCS aussi (68%).
- **Paraphrase** : Algorithmes lexicaux echouent (2-22%). SimHash et Style captent la similarite structurelle.
- **Textes differents** : Scores faibles. SimHash ~44% attendu pour textes aleatoires de meme longueur.

---

## Corrections et Bug Fixes

Voir [CORRECTIONS.md](CORRECTIONS.md) pour l'historique des corrections appliquees.
