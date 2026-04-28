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

    // Afficher les scores
    document.getElementById('cosineScore').textContent = `${(data.cosine * 100).toFixed(1)}%`;
    document.getElementById('jaccardScore').textContent = `${(data.jaccard * 100).toFixed(1)}%`;
    document.getElementById('ngramScore').textContent = `${(data.ngram * 100).toFixed(1)}%`;
    document.getElementById('combinedScore').textContent = `${(data.combined * 100).toFixed(1)}%`;

    // Afficher les résultats
    resultsDiv.style.display = 'block';
    
    // Afficher les highlights
    highlightText('highlightA', textA, data.highlights.textA);
    highlightText('highlightB', textB, data.highlights.textB);

    // Scroll vers les résultats
    resultsDiv.scrollIntoView({ behavior: 'smooth' });

  } catch (error) {
    console.error('Erreur:', error);
    alert('Une erreur est survenue lors de l\'analyse.');
  } finally {
    btn.textContent = 'Analyser';
    btn.classList.remove('loading');
  }
});

function highlightText(elementId, text, highlights) {
  const container = document.getElementById(elementId);
  
  if (!highlights || highlights.length === 0) {
    container.textContent = text;
    return;
  }

  // Créer une liste des segments à surligner avec leurs positions
  const segments = [];
  
  highlights.forEach(highlight => {
    const searchText = highlight.text;
    const type = highlight.type;
    let pos = 0;
    
    // Recherche insensible à la casse
    const lowerText = text.toLowerCase();
    const lowerSearch = searchText.toLowerCase();
    
    while ((pos = lowerText.indexOf(lowerSearch, pos)) !== -1) {
      segments.push({
        start: pos,
        end: pos + searchText.length,
        type: type,
        original: text.substring(pos, pos + searchText.length)
      });
      pos += 1;
    }
  });
  
  // Trier par position de début
  segments.sort((a, b) => a.start - b.start);
  
  // Fusionner les segments qui se chevauchent
  const merged = [];
  segments.forEach(segment => {
    if (merged.length === 0) {
      merged.push(segment);
    } else {
      const last = merged[merged.length - 1];
      if (segment.start <= last.end) {
        // Chevauchement - étendre si nécessaire
        if (segment.end > last.end) {
          last.end = segment.end;
        }
        // Priorité au type ngram (plus spécifique)
        if (segment.type === 'ngram') {
          last.type = 'ngram';
        }
      } else {
        merged.push(segment);
      }
    }
  });
  
  // Construire le HTML
  let html = '';
  let lastEnd = 0;
  
  merged.forEach(segment => {
    // Ajouter le texte avant ce segment
    if (segment.start > lastEnd) {
      html += escapeHtml(text.substring(lastEnd, segment.start));
    }
    
    // Ajouter le segment surligné
    const segmentText = text.substring(segment.start, segment.end);
    html += `<span class="${segment.type}">${escapeHtml(segmentText)}</span>`;
    
    lastEnd = segment.end;
  });
  
  // Ajouter le reste du texte
  if (lastEnd < text.length) {
    html += escapeHtml(text.substring(lastEnd));
  }
  
  container.innerHTML = html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Exemples prédéfinis pour faciliter les tests
const examples = [
  {
    name: "Exemple simple",
    textA: "Le chat mange la souris dans le jardin. Il fait beau aujourd'hui.",
    textB: "La souris est mangée par le chat. Le temps est agréable aujourd'hui."
  },
  {
    name: "Exemple plagiat",
    textA: "L'intelligence artificielle révolutionne notre façon de travailler. Les algorithmes deviennent de plus en plus sophistiqués.",
    textB: "L'intelligence artificielle révolutionne notre façon de travailler. Les algorithmes deviennent de plus en plus sophistiqués et puissants."
  }
];

// Charger un exemple au chargement de la page (optionnel)
window.addEventListener('DOMContentLoaded', () => {
  // Décommenter pour charger un exemple automatiquement
  // document.getElementById('textA').value = examples[0].textA;
  // document.getElementById('textB').value = examples[0].textB;
});
