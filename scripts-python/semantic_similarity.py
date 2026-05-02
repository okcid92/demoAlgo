"""
Similarite semantique avec Sentence-BERT (multilingue)
Detecte les paraphrases profondes et les traductions
Modele: paraphrase-multilingual-MiniLM-L12-v2 (supporte le francais)

Usage:
    echo '{"textA": "...", "textB": "..."}' | python3 semantic_similarity.py
"""

import sys
import json
import numpy as np

try:
    from sentence_transformers import SentenceTransformer
    from sklearn.metrics.pairwise import cosine_similarity
except ImportError:
    print(json.dumps({"error": "Dependencies non installees. Run: pip install sentence-transformers scikit-learn"}))
    sys.exit(1)

# Chargement du modele multilingue (telecharge au premier lancement ~420MB)
MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
model = None

def get_model():
    global model
    if model is None:
        model = SentenceTransformer(MODEL_NAME)
    return model


def split_sentences(text):
    """Decoupe un texte en phrases (supporte la ponctuation francaise)."""
    import re
    sentences = re.split(r'[.!?;:]+', text)
    return [s.strip() for s in sentences if s.strip()]


def semantic_similarity(text_a, text_b):
    """Similarite semantique profonde entre deux textes."""
    mdl = get_model()
    embeddings = mdl.encode([text_a, text_b])
    score = cosine_similarity([embeddings[0]], [embeddings[1]])[0][0]
    return float(score)


def segment_similarity(doc, reference, segment_size=3):
    """Detecte les passages suspects segment par segment."""
    doc_sentences = split_sentences(doc)
    ref_sentences = split_sentences(reference)

    suspicious = []
    for i in range(0, len(doc_sentences) - segment_size + 1):
        segment = " ".join(doc_sentences[i:i + segment_size])
        best_score = 0
        best_match = ""
        for j in range(0, len(ref_sentences) - segment_size + 1):
            ref_segment = " ".join(ref_sentences[j:j + segment_size])
            score = semantic_similarity(segment, ref_segment)
            if score > best_score:
                best_score = score
                best_match = ref_segment
        if best_score > 0.85:
            suspicious.append({
                "text": segment,
                "matched": best_match,
                "score": round(best_score, 3),
                "offset": i
            })

    return suspicious


def main():
    try:
        input_data = json.loads(sys.stdin.read())
        text_a = input_data.get("textA", "")
        text_b = input_data.get("textB", "")

        if not text_a or not text_b:
            print(json.dumps({"error": "Les deux textes sont requis"}))
            sys.exit(1)

        global_score = semantic_similarity(text_a, text_b)
        segments = segment_similarity(text_a, text_b)

        result = {
            "semantic_score": round(global_score, 3),
            "suspicious_segments": segments,
            "model": MODEL_NAME
        }

        print(json.dumps(result, ensure_ascii=False))

    except json.JSONDecodeError:
        print(json.dumps({"error": "Entree JSON invalide"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
