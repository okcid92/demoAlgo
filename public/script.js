const STORAGE_KEY = 'algolab_history';
const MAX_HISTORY = 20;

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

let currentExampleIndex = { A: 0, B: 0 };
let lastResult = null;
let lastTexts = { textA: '', textB: '' };

document.addEventListener('DOMContentLoaded', () => {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const textA = document.getElementById('textA');
  const textB = document.getElementById('textB');
  const exportBtn = document.getElementById('exportBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  analyzeBtn.addEventListener('click', handleAnalyze);
  textA.addEventListener('input', () => updateWordCount('A'));
  textB.addEventListener('input', () => updateWordCount('B'));

  document.querySelectorAll('.btn-example').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget.dataset.target;
      loadExample(target);
    });
  });

  exportBtn.addEventListener('click', handleExport);
  clearHistoryBtn.addEventListener('click', handleClearHistory);

  syncScrollPanes();
  renderHistory();
});

async function handleAnalyze() {
  const textA = document.getElementById('textA').value.trim();
  const textB = document.getElementById('textB').value.trim();
  const resultsDiv = document.getElementById('results');
  const btn = document.getElementById('analyzeBtn');
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');

  if (!textA || !textB) {
    alert('Veuillez coller deux textes pour analyser.');
    return;
  }

  btn.classList.add('loading');
  btnText.textContent = 'Analyse en cours...';
  btnLoader.hidden = false;

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

    lastResult = data;
    lastTexts = { textA, textB };

    resultsDiv.hidden = false;

    animateGauge('gaugeCosine', 'cosineScore', data.cosine);
    animateGauge('gaugeJaccard', 'jaccardScore', data.jaccard);
    animateGauge('gaugeNgram', 'ngramScore', data.ngram);
    animateCombinedScore(data.combined);

    highlightText('highlightA', textA, data.highlights.textA);
    highlightText('highlightB', textB, data.highlights.textB);

    saveToHistory(textA, textB, data);
    renderHistory();

    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (error) {
    console.error('Erreur:', error);
    alert('Une erreur est survenue lors de l\'analyse.');
  } finally {
    btn.classList.remove('loading');
    btnText.textContent = 'Analyser les similarités';
    btnLoader.hidden = true;
  }
}

function animateGauge(gaugeId, scoreId, value) {
  const gauge = document.getElementById(gaugeId);
  const scoreEl = document.getElementById(scoreId);
  const fill = gauge.querySelector('.gauge-fill');
  const circumference = 2 * Math.PI * 42;
  const percent = Math.max(0, Math.min(1, value)) * 100;
  const offset = circumference - (percent / 100) * circumference;

  setTimeout(() => {
    fill.style.strokeDashoffset = offset;
  }, 100);

  animateNumber(scoreEl, 0, percent, 1000, '%');
}

function animateNumber(el, from, to, duration, suffix = '') {
  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const current = from + (to - from) * progress;
    el.textContent = current.toFixed(1) + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function animateCombinedScore(value) {
  const el = document.getElementById('combinedScore');
  const fill = document.getElementById('combinedFill');
  const percent = Math.max(0, Math.min(1, value)) * 100;

  fill.style.width = percent + '%';
  fill.className = 'combined-fill';
  if (percent < 33) fill.classList.add('low');
  else if (percent < 66) fill.classList.add('medium');
  else fill.classList.add('high');

  animateNumber(el, 0, percent, 1000, '%');
}

function highlightText(elementId, text, highlights) {
  const container = document.getElementById(elementId);

  if (!highlights || highlights.length === 0) {
    container.textContent = text;
    return;
  }

  const merged = mergeHighlights(highlights);
  const sorted = [...merged].sort((a, b) => a.offset - b.offset);

  let html = '';
  let lastIndex = 0;

  sorted.forEach(hl => {
    if (hl.offset > lastIndex) {
      html += escapeHtml(text.substring(lastIndex, hl.offset));
    }
    html += `<span class="highlight ${hl.type}" title="${hl.type}">${escapeHtml(hl.text)}</span>`;
    lastIndex = hl.offset + hl.text.length;
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateWordCount(target) {
  const el = document.getElementById(target === 'A' ? 'textA' : 'textB');
  const countEl = document.getElementById(target === 'A' ? 'wordCountA' : 'wordCountB');
  const words = el.value.trim() ? el.value.trim().split(/\s+/).length : 0;
  countEl.textContent = words + ' mot' + (words > 1 ? 's' : '');
}

function loadExample(target) {
  const idx = target === 'A' ? 'A' : 'B';
  const example = examples[currentExampleIndex[idx]];
  const input = document.getElementById(target === 'A' ? 'textA' : 'textB');
  input.value = example.textA || example.textB;
  currentExampleIndex[idx] = (currentExampleIndex[idx] + 1) % examples.length;
  updateWordCount(target);
}

function syncScrollPanes() {
  const paneA = document.getElementById('paneA');
  const paneB = document.getElementById('paneB');
  if (!paneA || !paneB) return;

  let syncing = false;

  paneA.addEventListener('scroll', () => {
    if (!syncing) {
      syncing = true;
      paneB.scrollTop = paneA.scrollTop;
      requestAnimationFrame(() => { syncing = false; });
    }
  });

  paneB.addEventListener('scroll', () => {
    if (!syncing) {
      syncing = true;
      paneA.scrollTop = paneB.scrollTop;
      requestAnimationFrame(() => { syncing = false; });
    }
  });
}

function saveToHistory(textA, textB, result) {
  let history = getHistory();
  const entry = {
    id: Date.now(),
    date: new Date().toISOString(),
    textAPreview: textA.substring(0, 60) + (textA.length > 60 ? '...' : ''),
    textBPreview: textB.substring(0, 60) + (textB.length > 60 ? '...' : ''),
    textA,
    textB,
    scores: {
      cosine: result.cosine,
      jaccard: result.jaccard,
      ngram: result.ngram,
      combined: result.combined
    }
  };

  history.unshift(entry);
  if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function renderHistory() {
  const history = getHistory();
  const section = document.getElementById('history-section');
  const list = document.getElementById('historyList');
  const count = document.getElementById('historyCount');

  if (history.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  count.textContent = history.length + ' analyses';

  list.innerHTML = history.map(entry => {
    const date = new Date(entry.date);
    const formatted = date.toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    const combined = entry.scores.combined * 100;
    let scoreClass = 'low';
    if (combined >= 66) scoreClass = 'high';
    else if (combined >= 33) scoreClass = 'medium';

    return `
      <div class="history-item" data-id="${entry.id}">
        <span class="history-date">${formatted}</span>
        <span class="history-preview">${escapeHtml(entry.textAPreview)}</span>
        <span class="history-score ${scoreClass}">${combined.toFixed(1)}%</span>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const entry = history.find(h => h.id === parseInt(item.dataset.id));
      if (entry) {
        document.getElementById('textA').value = entry.textA;
        document.getElementById('textB').value = entry.textB;
        updateWordCount('A');
        updateWordCount('B');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

function handleClearHistory() {
  if (confirm('Supprimer tout l\'historique ?')) {
    localStorage.removeItem(STORAGE_KEY);
    renderHistory();
  }
}

function handleExport() {
  if (!lastResult) return;

  const exportData = {
    date: new Date().toISOString(),
    textes: {
      texteA: lastTexts.textA,
      texteB: lastTexts.textB
    },
    scores: {
      tfidfCosinus: lastResult.cosine,
      indiceJaccard: lastResult.jaccard,
      ngramOverlap: lastResult.ngram,
      scoreCombine: lastResult.combined
    }
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `algolab-resultat-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
