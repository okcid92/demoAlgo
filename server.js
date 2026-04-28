const express = require('express');
const natural = require('natural');
const stopword = require('stopword');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// TF-IDF + Cosine Similarity
function calculateCosineSimilarity(textA, textB) {
  const tokenizer = new natural.WordTokenizer();
  const stemmer = natural.PorterStemmer;
  const texts = [textA, textB].map(text =>
    stopword.removeStopwords(tokenizer.tokenize(text.toLowerCase())).map(stemmer.stem)
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

// Jaccard Similarity avec stemming et stopwords
function calculateJaccardSimilarity(textA, textB) {
  const tokenizer = new natural.WordTokenizer();
  const stemmer = natural.PorterStemmer;
  
  const setA = new Set(
    stopword.removeStopwords(tokenizer.tokenize(textA.toLowerCase())).map(stemmer.stem)
  );
  const setB = new Set(
    stopword.removeStopwords(tokenizer.tokenize(textB.toLowerCase())).map(stemmer.stem)
  );
  
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// N-gram Overlap (trigrammes)
function calculateNgramSimilarity(textA, textB, n = 3) {
  const getNgrams = (text) => {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    return words.flatMap((_, i) =>
      i <= words.length - n ? [words.slice(i, i + n).join(' ')] : []
    );
  };
  
  const ngramsA = getNgrams(textA);
  const ngramsB = getNgrams(textB);
  
  if (ngramsA.length === 0 || ngramsB.length === 0) return 0;
  
  const common = ngramsA.filter(ngram => ngramsB.includes(ngram));
  return common.length / Math.max(ngramsA.length, ngramsB.length);
}

// Générer les highlights avec détection des segments similaires
function generateHighlights(textA, textB) {
  const tokenizer = new natural.WordTokenizer();
  const wordsA = tokenizer.tokenize(textA.toLowerCase()) || [];
  const wordsB = tokenizer.tokenize(textB.toLowerCase()) || [];
  
  const highlightsA = [];
  const highlightsB = [];
  
  // Détecter les n-grammes communs (longueur 2 à 4)
  for (let n = 4; n >= 2; n--) {
    for (let i = 0; i <= wordsA.length - n; i++) {
      const ngramA = wordsA.slice(i, i + n).join(' ');
      for (let j = 0; j <= wordsB.length - n; j++) {
        const ngramB = wordsB.slice(j, j + n).join(' ');
        if (ngramA === ngramB) {
          // Trouver la position dans le texte original
          const originalTextA = textA.substring(
            textA.toLowerCase().indexOf(ngramA),
            textA.toLowerCase().indexOf(ngramA) + ngramA.length
          );
          const originalTextB = textB.substring(
            textB.toLowerCase().indexOf(ngramB),
            textB.toLowerCase().indexOf(ngramB) + ngramB.length
          );
          
          if (originalTextA && !highlightsA.some(h => h.text.includes(originalTextA))) {
            highlightsA.push({ text: originalTextA, score: 0.6 + (n * 0.1), type: 'ngram' });
          }
          if (originalTextB && !highlightsB.some(h => h.text.includes(originalTextB))) {
            highlightsB.push({ text: originalTextB, score: 0.6 + (n * 0.1), type: 'ngram' });
          }
        }
      }
    }
  }
  
  // Ajouter les highlights basés sur les mots communs (Jaccard)
  const stopwords = stopword.en;
  const contentWordsA = wordsA.filter(w => !stopwords.includes(w) && w.length > 3);
  const contentWordsB = new Set(wordsB.filter(w => !stopwords.includes(w) && w.length > 3));
  
  contentWordsA.forEach(word => {
    if (contentWordsB.has(word)) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      let match;
      while ((match = regex.exec(textA)) !== null) {
        const context = textA.substring(Math.max(0, match.index - 10), match.index + word.length + 10);
        if (!highlightsA.some(h => h.text.includes(match[0]))) {
          highlightsA.push({ text: match[0], score: 0.5, type: 'jaccard' });
        }
      }
      while ((match = regex.exec(textB)) !== null) {
        if (!highlightsB.some(h => h.text.includes(match[0]))) {
          highlightsB.push({ text: match[0], score: 0.5, type: 'jaccard' });
        }
      }
    }
  });
  
  // Trier par score décroissant
  highlightsA.sort((a, b) => b.score - a.score);
  highlightsB.sort((a, b) => b.score - a.score);
  
  // Limiter le nombre de highlights
  return {
    textA: highlightsA.slice(0, 10),
    textB: highlightsB.slice(0, 10)
  };
}

// Endpoint d'analyse
app.post('/api/analyze', (req, res) => {
  const { textA, textB } = req.body;
  
  if (!textA || !textB) {
    return res.status(400).json({ error: 'Les deux textes sont requis' });
  }
  
  const cosine = calculateCosineSimilarity(textA, textB);
  const jaccard = calculateJaccardSimilarity(textA, textB);
  const ngram = calculateNgramSimilarity(textA, textB);
  const combined = 0.4 * cosine + 0.3 * jaccard + 0.3 * ngram;
  
  const highlights = generateHighlights(textA, textB);
  
  res.json({ 
    cosine: Math.round(cosine * 100) / 100, 
    jaccard: Math.round(jaccard * 100) / 100, 
    ngram: Math.round(ngram * 100) / 100, 
    combined: Math.round(combined * 100) / 100, 
    highlights 
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
