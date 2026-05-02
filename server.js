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
  
  // Score combiné avec pondération 40/30/30
  const combined = 0.4 * cosine + 0.3 * jaccard + 0.3 * ngram;
  
  const highlights = generateHighlights(textA, textB);
  
  res.json({ 
    cosine: Math.round(cosine * 1000) / 1000, 
    jaccard: Math.round(jaccard * 1000) / 1000, 
    ngram: Math.round(ngram * 1000) / 1000, 
    combined: Math.round(combined * 1000) / 1000, 
    highlights 
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
