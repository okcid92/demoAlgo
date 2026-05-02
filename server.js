const express = require('express');
const natural = require('natural');
const stopword = require('stopword');

const app = express();
app.use(express.json());
app.use(express.static('public'));

function tokenize(text) {
  return text.match(/\p{L}+/gu) || [];
}

// TF-IDF + Cosine Similarity (français)
function calculateCosineSimilarity(textA, textB) {
  const stemmer = natural.PorterStemmerFr;
  const texts = [textA, textB].map(text =>
    stopword.removeStopwords(tokenize(text.toLowerCase()), stopword.fra).map(w => stemmer.stem(w))
  );

  const tfidf = new natural.TfIdf();
  texts.forEach(text => tfidf.addDocument(text));
  
  // Récupérer tous les termes uniques
  const allTerms = new Set();
  tfidf.documents.forEach(doc => {
    Object.keys(doc).forEach(term => allTerms.add(term));
  });
  const termsList = Array.from(allTerms);

  // Construire les vecteurs pour chaque document
  const vectors = texts.map((text, docIndex) => {
    return termsList.map(term => {
      let tfidfValue = 0;
      tfidf.tfidfs(term, (i, measure) => {
        if (i === docIndex) tfidfValue = measure;
      });
      return tfidfValue;
    });
  });

  const dotProduct = vectors[0].reduce((sum, val, i) => sum + val * (vectors[1][i] || 0), 0);
  const magnitudeA = Math.sqrt(vectors[0].reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(vectors[1].reduce((sum, val) => sum + val * val, 0));

  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (magnitudeA * magnitudeB);
}

// Jaccard Similarity avec stemming et stopwords (français)
function calculateJaccardSimilarity(textA, textB) {
  const stemmer = natural.PorterStemmerFr;
  
  const setA = new Set(
    stopword.removeStopwords(tokenize(textA.toLowerCase()), stopword.fra).map(w => stemmer.stem(w))
  );
  const setB = new Set(
    stopword.removeStopwords(tokenize(textB.toLowerCase()), stopword.fra).map(w => stemmer.stem(w))
  );
  
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function normalize(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const COMMON_STOPWORDS = [
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'est', 'sont',
  'ou', 'mais', 'donc', 'or', 'ni', 'car', 'que', 'qui', 'dans', 'sur',
  'par', 'pour', 'avec', 'sans', 'sous', 'entre', 'vers', 'chez', 'ce',
  'cette', 'ces', 'son', 'sa', 'ses', 'notre', 'votre', 'leur', 'ils',
  'elles', 'il', 'elle', 'nous', 'vous', 'je', 'tu', 'ont', 'a', 'au',
  'aux', 'en', 'se', 'ne', 'pas', 'plus', 'moins', 'tres', 'bien', 'aussi',
  'tout', 'tous', 'toute', 'toutes', 'fait', 'faire', 'etre', 'avoir',
  'comme', 'si', 'y', 'on', 'ma', 'ta', 'sa', 'mon', 'ton', 'mes', 'tes',
  'c', 'd', 'j', 'l', 'qu', 'n', 's', 't', 'voici', 'voila', 'depuis'
];

// N-gram Overlap (bigrammes avec tolérance d'ordre et comparaison partielle)
function calculateNgramSimilarity(textA, textB, n = 2) {
  const getOrderedNgrams = (text) => {
    const words = normalize(text).split(/\s+/).filter(w => w.length > 0);
    const ngrams = [];
    for (let i = 0; i <= words.length - n; i++) {
      const gram = words.slice(i, i + n);
      ngrams.push({ gram: gram.join(' '), words: gram });
    }
    return ngrams;
  };

  const getAllNgramForms = (ngrams) => {
    const forms = [];
    ngrams.forEach(item => {
      forms.push(item.gram);
      forms.push([...item.words].reverse().join(' '));
    });
    return forms;
  };

  const ngramsA = getOrderedNgrams(textA);
  const ngramsB = getOrderedNgrams(textB);

  if (ngramsA.length === 0 || ngramsB.length === 0) return 0;

  const ngramsBSet = new Set(getAllNgramForms(ngramsB));
  const wordPresenceB = new Set(ngramsB.flatMap(ng => ng.words));

  let score = 0;
  const uniqueGramsA = new Set();
  ngramsA.forEach(ng => {
    if (uniqueGramsA.has(ng.gram)) return;
    uniqueGramsA.add(ng.gram);
    if (ngramsBSet.has(ng.gram) || ngramsBSet.has([...ng.words].reverse().join(' '))) {
      score += 1;
      return;
    }
    const partial = ng.words.some(word => wordPresenceB.has(word));
    if (partial) score += 0.25;
  });

  if (uniqueGramsA.size === 0) return 0;
  const uniqueGramsB = new Set(ngramsB.map(ng => ng.gram));
  const denominator = Math.max(uniqueGramsA.size, uniqueGramsB.size);
  return score / denominator;
}

// Trouver toutes les occurrences d'un mot avec offset
function findWordOffsets(text, word) {
  const offsets = [];
  const lowerText = text.toLowerCase();
  const lowerWord = word.toLowerCase();
  let start = 0;
  while (true) {
    const index = lowerText.indexOf(lowerWord, start);
    if (index === -1) break;
    const end = index + lowerWord.length;
    const before = index > 0 ? lowerText[index - 1] : ' ';
    const after = end < lowerText.length ? lowerText[end] : ' ';
    const isWordChar = (c) => /[a-z0-9_\u00c0-\u024f]/i.test(c);
    if (!isWordChar(before) && !isWordChar(after)) {
      offsets.push({
        offset: index,
        text: text.substring(index, end)
      });
    }
    start = index + 1;
  }
  return offsets;
}

function findPhraseOffsets(text, phrase) {
  const offsets = [];
  const lowerText = text.toLowerCase();
  const lowerPhrase = phrase.toLowerCase();
  let start = 0;
  while (true) {
    const index = lowerText.indexOf(lowerPhrase, start);
    if (index === -1) break;
    const end = index + lowerPhrase.length;
    const before = index > 0 ? lowerText[index - 1] : ' ';
    const after = end < lowerText.length ? lowerText[end] : ' ';
    const isWordChar = (c) => /[a-z0-9_\u00c0-\u024f]/i.test(c);
    if (!isWordChar(before) && !isWordChar(after)) {
      offsets.push({
        offset: index,
        text: text.substring(index, end)
      });
    }
    start = index + 1;
  }
  return offsets;
}

function mergeHighlights(highlights) {
  const priority = { cosine: 3, ngram: 2, jaccard: 1 };
  const sorted = [...highlights].sort((a, b) => {
    const pDiff = (priority[b.type] || 0) - (priority[a.type] || 0);
    if (pDiff !== 0) return pDiff;
    const lenDiff = b.text.length - a.text.length;
    if (lenDiff !== 0) return lenDiff;
    return a.offset - b.offset;
  });

  const selected = [];
  const overlaps = (a, b) => {
    const aEnd = a.offset + a.text.length;
    const bEnd = b.offset + b.text.length;
    return a.offset < bEnd && b.offset < aEnd;
  };

  sorted.forEach(item => {
    const hasOverlap = selected.some(existing => overlaps(existing, item));
    if (!hasOverlap) selected.push(item);
  });

  return selected.sort((a, b) => a.offset - b.offset);
}

// Générer les highlights avec offsets précis
function generateHighlights(textA, textB) {
  const highlightsA = [];
  const highlightsB = [];
  
  // 1. Détecter les n-grammes communs (bigrammes + trigrammes, ordre tolérant)
  for (let n = 3; n >= 2; n--) {
    const getOrderedNgrams = (text) => {
      const words = normalize(text).split(/\s+/).filter(w => w.length > 0);
      const ngrams = [];
      for (let i = 0; i <= words.length - n; i++) {
        const gram = words.slice(i, i + n);
        ngrams.push({ gram: gram.join(' '), words: gram });
      }
      return ngrams;
    };

    const getAllNgramForms = (ngrams) => {
      const forms = [];
      ngrams.forEach(item => {
        forms.push(item.gram);
        forms.push([...item.words].reverse().join(' '));
      });
      return forms;
    };

    const ngramsA = getOrderedNgrams(textA);
    const ngramsB = getOrderedNgrams(textB);
    const ngramsBSet = new Set(getAllNgramForms(ngramsB));

    ngramsA.forEach(itemA => {
      const reversed = [...itemA.words].reverse().join(' ');
      if (!ngramsBSet.has(itemA.gram) && !ngramsBSet.has(reversed)) return;

      const offsetsA = findPhraseOffsets(textA, itemA.gram);
      offsetsA.forEach(item => {
        highlightsA.push({ text: item.text, type: 'ngram', offset: item.offset });
      });

      const formsB = [itemA.gram, reversed];
      formsB.forEach(form => {
        const offsetsB = findPhraseOffsets(textB, form);
        offsetsB.forEach(item => {
          highlightsB.push({ text: item.text, type: 'ngram', offset: item.offset });
        });
      });
    });
  }

  // 2. Détecter les mots communs (TF-IDF/Cosine) pour les highlights en bleu
  const commonWords = getTopTfidfTerms(textA, textB, 6);

  commonWords.forEach(word => {
    const offsetsA = findWordOffsets(textA, word);
    offsetsA.forEach(item => {
      highlightsA.push({ text: item.text, type: 'cosine', offset: item.offset });
    });

    const offsetsB = findWordOffsets(textB, word);
    offsetsB.forEach(item => {
      highlightsB.push({ text: item.text, type: 'cosine', offset: item.offset });
    });
  });

  // 3. Détecter les mots communs (Jaccard)
  const wordsA = tokenize(textA.toLowerCase()) || [];
  const wordsB = tokenize(textB.toLowerCase()) || [];

  const contentWordsA = wordsA.filter(w => !COMMON_STOPWORDS.includes(w) && w.length > 3);
  const contentWordsB = new Set(wordsB.filter(w => !COMMON_STOPWORDS.includes(w) && w.length > 3));

  const processedWords = new Set();
  contentWordsA.forEach(word => {
    if (!contentWordsB.has(word) || processedWords.has(word)) return;
    processedWords.add(word);
    
    const offsetsA = findWordOffsets(textA, word);
    offsetsA.forEach(item => {
      highlightsA.push({ text: item.text, type: 'jaccard', offset: item.offset });
    });

    const offsetsB = findWordOffsets(textB, word);
    offsetsB.forEach(item => {
      highlightsB.push({ text: item.text, type: 'jaccard', offset: item.offset });
    });
  });

  return {
    textA: mergeHighlights(highlightsA),
    textB: mergeHighlights(highlightsB)
  };
}

function getCommonWords(textA, textB) {
  const wordsA = new Set(normalize(textA).split(/\s+/).filter(w => w.length > 0));
  const wordsB = new Set(normalize(textB).split(/\s+/).filter(w => w.length > 0));
  return [...wordsA].filter(word => wordsB.has(word));
}

function getTopTfidfTerms(textA, textB, limit = 6) {
  const tokensA = tokenize(normalize(textA)).filter(w => w.length > 3 && !COMMON_STOPWORDS.includes(w));
  const tokensB = tokenize(normalize(textB)).filter(w => w.length > 3 && !COMMON_STOPWORDS.includes(w));

  const tfidf = new natural.TfIdf();
  tfidf.addDocument(tokensA.join(' '));
  tfidf.addDocument(tokensB.join(' '));

  const termsA = tfidf.listTerms(0);
  const termsB = tfidf.listTerms(1);

  const mapA = new Map(termsA.map(item => [item.term, item.tfidf]));
  const mapB = new Map(termsB.map(item => [item.term, item.tfidf]));

  const common = [];
  mapA.forEach((scoreA, term) => {
    if (!mapB.has(term)) return;
    const scoreB = mapB.get(term);
    common.push({ term, score: (scoreA + scoreB) / 2 });
  });

  return common
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.term);
}

// =============================================================================
// Shingling (Winnowing) -- Detection de copies avec reordonnancement
// Genere des empreintes (fingerprints) via des hash de k-shingles
// Compare les ensembles d'empreintes par Jaccard
// =============================================================================

function hashShingle(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function generateShingles(text, k = 5) {
  const words = normalize(text).split(/\s+/).filter(w => w.length > 0);
  const shingles = [];
  for (let i = 0; i <= words.length - k; i++) {
    const shingle = words.slice(i, i + k).join(' ');
    shingles.push(shingle);
  }
  return shingles;
}

function winnowing(text, k = 5, windowSize = 4) {
  const shingles = generateShingles(text, k);
  const hashes = shingles.map(s => hashShingle(s));
  const fingerprints = new Set();

  for (let i = 0; i <= hashes.length - windowSize; i++) {
    const window = hashes.slice(i, i + windowSize);
    const min = Math.min(...window);
    fingerprints.add(min);
  }

  return fingerprints;
}

function winnowingSimilarity(textA, textB) {
  const fpA = winnowing(textA);
  const fpB = winnowing(textB);

  if (fpA.size === 0 || fpB.size === 0) return 0;

  const intersection = new Set([...fpA].filter(h => fpB.has(h)));
  const union = new Set([...fpA, ...fpB]);

  return intersection.size / union.size;
}

// =============================================================================
// SimHash (Locality-Sensitive Hashing)
// Genere un hash 64 bits qui preserve la similarite
// Deux documents proches ont des hashes proches (Hamming faible)
// =============================================================================

function hashFNV64(str) {
  let hash = 14695981039346656037n;
  for (let i = 0; i < str.length; i++) {
    hash = BigInt.asUintN(64, hash ^ BigInt(str.charCodeAt(i)));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash;
}

function simHash(text, bits = 64) {
  const tokens = tokenize(text.toLowerCase()).filter(w => w.length > 2 && !COMMON_STOPWORDS.includes(w));
  const vector = new Array(bits).fill(0);

  for (const token of tokens) {
    const h = hashFNV64(token);
    const weight = 1;

    for (let i = 0; i < bits; i++) {
      vector[i] += (h >> BigInt(i)) & 1n ? weight : -weight;
    }
  }

  let result = 0n;
  for (let i = 0; i < bits; i++) {
    if (vector[i] > 0) result |= (1n << BigInt(i));
  }

  return result;
}

function hammingDistance(a, b) {
  let diff = a ^ b;
  let count = 0;
  while (diff > 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}

function simHashSimilarity(textA, textB) {
  const hA = simHash(textA);
  const hB = simHash(textB);
  const distance = hammingDistance(hA, hB);
  return 1 - distance / 64;
}

// =============================================================================
// Longest Common Subsequence (LCS)
// Trouve la plus longue sous-sequence commune (pas forcement contigue)
// Detecte les suppressions/insertions de mots ("plagiat chirurgical")
// =============================================================================

function lcs(tokensA, tokensB) {
  const maxTokens = 500;
  const a = tokensA.length > maxTokens ? tokensA.slice(0, maxTokens) : tokensA;
  const b = tokensB.length > maxTokens ? tokensB.slice(0, maxTokens) : tokensB;

  const m = a.length;
  const n = b.length;

  const prev = new Array(n + 1).fill(0);
  const curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    for (let j = 0; j <= n; j++) {
      prev[j] = curr[j];
    }
  }

  return prev[n];
}

function lcsSimilarity(textA, textB) {
  const tokA = tokenize(textA.toLowerCase()).filter(w => w.length > 2);
  const tokB = tokenize(textB.toLowerCase()).filter(w => w.length > 2);

  if (tokA.length === 0 || tokB.length === 0) return 0;

  const lcsLen = lcs(tokA, tokB);
  return (2 * lcsLen) / (tokA.length + tokB.length);
}

// =============================================================================
// Analyse Stylistique (Detection de Structure)
// Compare la structure rhetorique et stylistique du document
// Un plagiat conserve souvent l'architecture originale
// =============================================================================

function splitSentences(text) {
  return text.split(/[.!?;:]+/).map(s => s.trim()).filter(s => s.length > 0);
}

function buildStyleProfile(text) {
  const sentences = splitSentences(text);
  const words = tokenize(text.toLowerCase());
  const uniqueWords = new Set(words);
  const punctuation = (text.match(/[.,;:!?«»()\-]/g) || []).length;
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

  const sentenceLengths = sentences.map(s => tokenize(s).length).filter(l => l > 0);
  const avgSentenceLength = sentenceLengths.length > 0
    ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
    : 0;

  const wordLengths = words.map(w => w.length).filter(l => l > 0);
  const avgWordLength = wordLengths.length > 0
    ? wordLengths.reduce((a, b) => a + b, 0) / wordLengths.length
    : 0;

  return {
    avgSentenceLength,
    avgWordLength,
    punctuationDensity: text.length > 0 ? punctuation / text.length : 0,
    paragraphCount: paragraphs.length,
    vocabularyRichness: words.length > 0 ? uniqueWords.size / words.length : 0,
    sentenceCount: sentences.length,
    wordCount: words.length
  };
}

function styleDistance(profileA, profileB) {
  const metrics = ['avgSentenceLength', 'avgWordLength', 'punctuationDensity', 'vocabularyRichness'];
  const diffs = metrics.map(m => {
    const maxVal = Math.max(profileA[m], profileB[m], 0.001);
    return Math.pow((profileA[m] - profileB[m]) / maxVal, 2);
  });
  const euclidean = Math.sqrt(diffs.reduce((a, b) => a + b, 0));

  const maxCount = Math.max(profileA.sentenceCount, profileB.sentenceCount, 1);
  const countDiff = Math.abs(profileA.sentenceCount - profileB.sentenceCount) / maxCount;
  const maxPara = Math.max(profileA.paragraphCount, profileB.paragraphCount, 1);
  const paraDiff = Math.abs(profileA.paragraphCount - profileB.paragraphCount) / maxPara;

  return Math.sqrt(euclidean * euclidean + countDiff * countDiff + paraDiff * paraDiff) / 2;
}

function styleSimilarity(textA, textB) {
  const pA = buildStyleProfile(textA);
  const pB = buildStyleProfile(textB);
  const dist = styleDistance(pA, pB);
  return Math.max(0, 1 - dist);
}

// =============================================================================
// Endpoint d'analyse
// =============================================================================

const { exec } = require('child_process');
const path = require('path');

// Endpoint d'analyse
app.post('/api/analyze', (req, res) => {
  const { textA, textB } = req.body;
  
  if (!textA || !textB) {
    return res.status(400).json({ error: 'Les deux textes sont requis' });
  }
  
  // Calculer les scores et les normaliser entre 0 et 1
  const cosine = Math.min(1, Math.max(0, calculateCosineSimilarity(textA, textB)));
  const jaccard = Math.min(1, Math.max(0, calculateJaccardSimilarity(textA, textB)));
  const ngram = Math.min(1, Math.max(0, calculateNgramSimilarity(textA, textB)));
  const winnowing = Math.min(1, Math.max(0, winnowingSimilarity(textA, textB)));
  const simhash = Math.min(1, Math.max(0, simHashSimilarity(textA, textB)));
  const lcs = Math.min(1, Math.max(0, lcsSimilarity(textA, textB)));
  const style = Math.min(1, Math.max(0, styleSimilarity(textA, textB)));
  const semantic = req.body.semantic !== undefined ? Math.min(1, Math.max(0, req.body.semantic)) : 0;

  // Score combine avec ponderation 25/15/20/15/15/5/5
  const combined =
    0.25 * cosine +
    0.15 * jaccard +
    0.20 * ngram +
    0.15 * winnowing +
    0.15 * semantic +
    0.05 * lcs +
    0.05 * style;

  // Affichage console des resultats pour analyse
  const separator = '─'.repeat(60);
  console.log('\n' + separator);
  console.log('ANALYSE DE PLAGIAT');
  console.log(separator);
  console.log(`Texte A : "${textA.substring(0, 80)}${textA.length > 80 ? '...' : ''}"`);
  console.log(`Texte B : "${textB.substring(0, 80)}${textB.length > 80 ? '...' : ''}"`);
  console.log('─'.repeat(60));
  console.log('SCORES PAR ALGORITHME');
  console.log('─'.repeat(60));
  
  const scores = [
    { name: 'TF-IDF + Cosinus', value: cosine, weight: 25 },
    { name: 'Indice de Jaccard', value: jaccard, weight: 15 },
    { name: 'N-gram Overlap', value: ngram, weight: 20 },
    { name: 'Shingling (Winnowing)', value: winnowing, weight: 15 },
    { name: 'SimHash (LSH)', value: simhash, weight: 0 },
    { name: 'LCS', value: lcs, weight: 5 },
    { name: 'Analyse Stylistique', value: style, weight: 5 }
  ];
  
  scores.forEach(s => {
    const bar = '█'.repeat(Math.round(s.value * 20)) + '░'.repeat(Math.round((1 - s.value) * 20));
    const weightStr = s.weight > 0 ? `[${s.weight}%]` : '[-]  ';
    console.log(`  ${s.name.padEnd(25)} ${weightStr} ${bar} ${(s.value * 100).toFixed(1)}%`);
  });
  
  console.log('─'.repeat(60));
  const combinedBar = '█'.repeat(Math.round(combined * 20)) + '░'.repeat(Math.round((1 - combined) * 20));
  const interpretation = combined > 0.7 ? 'PLAGIAT FORT' : combined > 0.3 ? 'PLAGIAT MODERE' : combined > 0.1 ? 'PLAGIAT FAIBLE' : 'PAS DE PLAGIAT';
  console.log(`  SCORE COMBINE                 ${combinedBar} ${(combined * 100).toFixed(1)}%`);
  console.log(`  => ${interpretation}`);
  console.log(separator);
  console.log();
  
  const highlights = generateHighlights(textA, textB);
  const styleProfileA = buildStyleProfile(textA);
  const styleProfileB = buildStyleProfile(textB);
  
  res.json({ 
    cosine: Math.round(cosine * 1000) / 1000, 
    jaccard: Math.round(jaccard * 1000) / 1000, 
    ngram: Math.round(ngram * 1000) / 1000,
    winnowing: Math.round(winnowing * 1000) / 1000,
    simhash: Math.round(simhash * 1000) / 1000,
    lcs: Math.round(lcs * 1000) / 1000,
    style: Math.round(style * 1000) / 1000, 
    combined: Math.round(combined * 1000) / 1000, 
    highlights,
    styleProfiles: { a: styleProfileA, b: styleProfileB }
  });
});

// Endpoint pour la similarite semantique via Python (optionnel)
app.post('/api/semantic', (req, res) => {
  const { textA, textB } = req.body;
  
  if (!textA || !textB) {
    return res.status(400).json({ error: 'Les deux textes sont requis' });
  }

  const scriptPath = path.join(__dirname, 'scripts-python', 'semantic_similarity.py');
  const pythonCommand = `python3 "${scriptPath}"`;

  const proc = exec(pythonCommand, { timeout: 30000 }, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: 'Python non disponible ou script introuvable', detail: error.message });
    }
    try {
      const result = JSON.parse(stdout.trim());
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Erreur de parsing du resultat Python', raw: stdout });
    }
  });

  proc.stdin.write(JSON.stringify({ textA, textB }));
  proc.stdin.end();
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
