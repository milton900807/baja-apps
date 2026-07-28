import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from Bio import SeqIO
from ion import works









# Step 1: Data Preprocessing
def load_sequences(file_path):
    sequences = []
    for record in SeqIO.parse(file_path, "fasta"):
        if 10 <= len(record.seq) <= 500:
            sequences.append({'name': record.id, 'seq': str(record.seq)})
    return sequences

# Step 2: Feature Extraction
def sequence_to_kmers(sequences, k=6):
    vectorizer = CountVectorizer(analyzer='char', ngram_range=(k, k))
    X = vectorizer.fit_transform([seq['seq'] for seq in sequences])
    return X

# Step 3: Clustering
def cluster_sequences(X, n_clusters=5):
    kmeans = KMeans(n_clusters=n_clusters, random_state=42)
    y_kmeans = kmeans.fit_predict(X)
    return y_kmeans, kmeans

# Step 4: PCA and Report Generation
def generate_pca_report(X, sequences):
    pca = PCA(n_components=2)
    pca_result = pca.fit_transform(X.toarray())
    
    scatter_plot_data = {
        "title": "PCA of DNA Sequences",
        "xlabel": "Principal Component 1",
        "ylabel": "Principal Component 2",
        "points": []
    }

    for i, seq in enumerate(sequences):
        scatter_plot_data["points"].append({
            "name": seq['name'],
            "x": float(pca_result[i, 0]),
            "y": float(pca_result[i, 1])
        })

    return scatter_plot_data

sequences = works.param(1)
X = sequence_to_kmers(sequences)
n_clusters=5
y_kmeans, kmeans = cluster_sequences(X, n_clusters)
report = generate_pca_report(X, sequences)
works.resolve(report)
