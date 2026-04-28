# Détection de Plagiat - Démonstration

Un mini-site web pour démontrer trois algorithmes de détection de plagiat.

## Algorithmes Implémentés

1. **TF-IDF + Similarité Cosinus** (40% du score final)
2. **Indice de Jaccard** (30% du score final)
3. **N-gram Overlap** (30% du score final)

## Installation

```bash
npm install
```

## Démarrage

```bash
npm start
```

Le serveur démarre sur `http://localhost:3001`

## Développement

```bash
npm run dev
```

## Utilisation

1. Ouvrez `http://localhost:3001` dans votre navigateur
2. Collez deux textes dans les zones de saisie
3. Cliquez sur "Analyser"
4. Visualisez les scores et les similarités détectées

## Structure du Projet

```
plagiarism-demo/
├── server.js          # Backend Express
├── public/
│   ├── index.html     # Frontend
│   ├── style.css      # Styles
│   └── script.js      # Logique frontend
└── package.json
```

## API

### POST /api/analyze

**Request:**
```json
{
  "textA": "Le chat mange la souris.",
  "textB": "La souris est mangée par le chat."
}
```

**Response:**
```json
{
  "cosine": 0.42,
  "jaccard": 0.33,
  "ngram": 0.25,
  "combined": 0.34,
  "highlights": {
    "textA": [...],
    "textB": [...]
  }
}
```
