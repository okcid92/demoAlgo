document.getElementById('analyzeBtn').addEventListener('click', async () => {
  const textA = document.getElementById('textA').value.trim();
  const textB = document.getElementById('textB').value.trim();
  const resultsDiv = document.getElementById('results');

  if (!textA || !textB) {
    alert('Veuillez coller deux textes pour analyser.');
    return;
  }

  const btn = document.getElementById('analyzeBtn');
  btn.textContent = 'Analyse en cours...';
  btn.classList.add('loading');

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ textA, textB })
    });
    
    if (!response.ok) {
      throw new Error('Erreur serveur');
    }
    
    const data = await response.json();

    // Afficher les scores en pourcentage avec animation
    animateScore('cosineScore', data.cosine);
    animateScore('jaccardScore', data.jaccard);
    animateScore('ngramScore', data.ngram);
    animateScore('combinedScore', data.combined);

    updateProgress('cosineProgress', data.cosine);
    updateProgress('jaccardProgress', data.jaccard);
    updateProgress('ngramProgress', data.ngram);
    updateProgress('combinedProgress', data.combined);

    // Afficher les résultats
    resultsDiv.style.display = 'block';
    
    // Afficher les highlights avec offsets
    highlightText('highlightA', textA, data.highlights.textA);
    highlightText('highlightB', textB, data.highlights.textB);

    // Scroll vers les résultats
    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (error) {
    console.error('Erreur:', error);
    alert('Une erreur est survenue lors de l\'analyse.');
  } finally {
    btn.textContent = 'Analyser';
    btn.classList.remove('loading');
  }
});

/**
 * Applique les highlights au texte en utilisant les offsets
 * @param {string} elementId - ID de l'élément HTML
 * @param {string} text - Texte original
 * @param {Array} highlights - Liste des highlights avec offset et type
 */
function highlightText(elementId, text, highlights) {
  const container = document.getElementById(elementId);
  
  if (!highlights || highlights.length === 0) {
    container.textContent = text;
    return;
  }

  const mergedHighlights = mergeHighlights(highlights);
  const sortedHighlights = [...mergedHighlights].sort((a, b) => a.offset - b.offset);

  let html = '';
  let lastIndex = 0;

  sortedHighlights.forEach(highlight => {
    if (highlight.offset > lastIndex) {
      html += escapeHtml(text.substring(lastIndex, highlight.offset));
    }

    html += `<span class="highlight ${highlight.type}" title="${highlight.type}">${escapeHtml(highlight.text)}</span>`;
    lastIndex = highlight.offset + highlight.text.length;
  });

  if (lastIndex < text.length) {
    html += escapeHtml(text.substring(lastIndex));
  }

  container.innerHTML = html;
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

  return selected;
}

/**
 * Échappe les caractères HTML pour éviter les injections XSS
 * @param {string} text - Texte à échapper
 * @returns {string} Texte échappé
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function animateScore(elementId, value) {
  const element = document.getElementById(elementId);
  const target = Math.max(0, Math.min(1, value)) * 100;
  const duration = 800;
  const startTime = performance.now();

  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const current = target * progress;
    element.textContent = `${current.toFixed(1)}%`;
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function updateProgress(elementId, value) {
  const element = document.getElementById(elementId);
  const percent = Math.max(0, Math.min(1, value)) * 100;
  element.style.width = `${percent.toFixed(1)}%`;
}

// Exemples prédéfinis pour faciliter les tests
const examples = [
  {
    name: "Exemple simple",
    textA: "Le chat mange la souris dans le jardin. Il fait beau aujourd'hui.",
    textB: "La souris est mangée par le chat. Le temps est agréable aujourd'hui."
  },
  {
    name: "Plagiat évident",
    textA: "L'intelligence artificielle révolutionne notre façon de travailler. Les algorithmes deviennent de plus en plus sophistiqués.",
    textB: "L'intelligence artificielle révolutionne notre façon de travailler. Les algorithmes deviennent de plus en plus sophistiqués et puissants."
  },
  {
    name: "Texte académique",
    textA: "Le chat mange la souris. C'est un exemple simple pour montrer comment les algorithmes détectent les similarités.",
    textB: "La souris est mangée par le chat. Voici un exemple basique pour illustrer la détection de plagiat."
  }
];

// Bouton pour charger un exemple (optionnel)
window.addEventListener('DOMContentLoaded', () => {
  // Vous pouvez ajouter un bouton pour charger des exemples si nécessaire
  // Pour l'instant, les utilisateurs peuvent copier-coller manuellement
});
