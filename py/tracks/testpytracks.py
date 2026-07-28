import json
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error
import pymongo
from bson.objectid import ObjectId
import numpy as np
import pandas as pd
from ion import works
from collections import Counter



# training_set_id = works.param ( 1 )
# features_list = works.param ( 2 )
# annotations_list = works.param ( 3 )


# MongoDB connection URI
uri = "mongodb://localhost:27017/"
client = pymongo.MongoClient(uri)
db = client["oligos"]
training_set_collection = db["trainingsets"]
track_collection = db["tracks"]
def get_training_set(training_set_id):
    try:
        training_set = training_set_collection.find_one({"_id": ObjectId(training_set_id)})
        if training_set:
            return training_set
        else:
            print("TrainingSet not found")
            return None
    except Exception as e:
        print(f"Error fetching TrainingSet: {e}")
        return None

# Function to get Track objects by IDs
def get_tracks_by_ids(track_ids):
    try:
        tracks = track_collection.find({"_id": {"$in": track_ids}})
        return list(tracks)
    except Exception as e:
        print(f"Error fetching Tracks: {e}")
        return []



# Function to get a Track object by ID
def get_track_by_id(track_id):
    try:
        track = track_collection.find_one({"_id": (track_id)})
        return track
    except Exception as e:
        print(f"Error fetching Track with ID {track_id}: {e}")
        return None




def one_hot_encode_kmer(kmer):
    """
    One-hot encode a k-mer.

    Parameters:
    kmer (str): The k-mer to be encoded.

    Returns:
    np.array: A one-hot encoded representation of the k-mer.
    """
    # Define the mapping of nucleotides to binary vectors
    mapping = {
        'A': [1, 0, 0, 0],
        'C': [0, 1, 0, 0],
        'G': [0, 0, 1, 0],
        'T': [0, 0, 0, 1]
    }
    
    # Initialize an empty list to hold the encoded k-mer
    one_hot_encoded_kmer = []
    
    # Convert each nucleotide in the k-mer to its binary vector
    for nucleotide in kmer:
        if nucleotide in mapping:
            one_hot_encoded_kmer.extend(mapping[nucleotide])
        else:
            raise ValueError(f"Invalid nucleotide: {nucleotide}")
    
    # Convert the list of binary vectors to a NumPy array
    return np.array(one_hot_encoded_kmer)

def get_kmers(sequence, k):
    """Extract k-mers from a given sequence."""
    return [sequence[i:i+k] for i in range(len(sequence) - k + 1)]

def one_hot_encode_kmers(kmers, k):
    """One-hot encode a list of k-mers."""
    bases = 'ACGT'
    encoding = {base: np.eye(4)[i] for i, base in enumerate(bases)}
    encoded_kmers = []
    
    for kmer in kmers:
        encoded_kmer = np.array([encoding[base] for base in kmer])
        encoded_kmers.append(encoded_kmer.flatten())
    
    return np.array(encoded_kmers)


def extract_features(data_layer, annotation_layer):
    data_features = []
    annotation_features = []
    
    for data in data_layer:
        for polygon in data['polygon']:
            data_features.append([polygon['x'], polygon['y']])
    
    for annotation in annotation_layer:
        for interval in annotation['interval']:
            annotation_features.append([interval[0], interval[1]])
    # return (data_features), (annotation_features)
    return np.array(data_features), np.array(annotation_features)


# training_set_data_layers = [
#     {'name': 'data1', 'polygon': [(1, 0.5), (2, 0.6), (3, 0.4)]},
#     {'name': 'data2', 'polygon': [(2, 0.7), (3, 0.8), (4, 0.6)]}
# ]

# training_set_annotation_layers = [
#     {'name': 'annot1', 'interval': [(1, 3), (2, 4), (3, 5)]},
#     {'name': 'annot2', 'interval': [(2, 5), (3, 6), (4, 7)]}
# ]

def extract_data(track, annotation_types):
    training_set_data_layers = []
    training_set_annotation_layers = {atype: [] for atype in annotation_types}
    track_layers = track.get('track_layers', [])
    annotations = track.get('annotations', [])
    # sequence = dna_to_kmer_feature_vector(track.sequence);
    sequence = track.get('sequence', '')

    dlayers = set()
    for layer in track_layers:
        polygons = layer.get('polygonpts', [])
        layer_name = layer.get('name', '')
        training_set_data_layers.append({'name': layer.get('name', ''), 'polygon': polygons})
        if layer_name:
            dlayers.add(layer_name)


    # Extract k-mers and one-hot encode from the track's sequence
    if sequence:
        kmers = get_kmers(sequence, k)
        one_hot_kmers = one_hot_encode_kmers(kmers, k)
        training_set_data_layers.append({'name': 'sequence_kmers', 'one_hot_kmers': one_hot_kmers})

        
    for an in annotations:
        if 'type' in an and an['type'] in annotation_types:
            annotation_type = an['type']
            xi = an.get('xi', None)
            xf = an.get('xf', None)
    
            
            if xi is not None and xf is not None:
                if annotation_type:
                    dlayers.add(annotation_type)
                training_set_annotation_layers[annotation_type].append((xi, xf))
    annotation_layers = [{'name': atype, 'interval': intervals} for atype, intervals in training_set_annotation_layers.items() if intervals]
    distinct_layer_names = list(dlayers)

    return training_set_data_layers, annotation_layers, distinct_layer_names


def extract_polygon_points(track):
    polygon_data = []
    track_layers = track.get('track_layers', [])
    for layer in track_layers:
        polygons = layer.get('polygonpts', [])
        for polygon in polygons:
            polygon_data.append(polygon)
    return polygon_data


def main():
    training_set_id = works.param ( 1 )
    features_list = ['Exon']

    training_set = get_training_set(training_set_id)
    if not training_set:
        return
    track_ids = training_set.get("ids", [])


    if not track_ids:
        print("No track IDs found in the TrainingSet")
        return
    data_features_ = []
    anno_features_ = []
    layers = []
    for tid in track_ids:
        track = get_track_by_id ( tid )
        if track:
            training_set_data_layers, annotation_layers, dlayers = extract_data ( track, features_list)
            
            data_features, annotation_features = extract_features ( training_set_data_layers, annotation_layers )
            data_features_.extend ( data_features )
            anno_features_.extend ( annotation_features )
            layers.extend ( dlayers )

    features = pd.DataFrame(np.array(data_features_), columns=['x', 'y'])
    annotations = pd.DataFrame(np.array(anno_features_), columns=['xi', 'xf'])
    annotations.dropna(inplace=True)
    features = features.loc[annotations.index]  # Ensure features correspond to non-NaN annotations
    dataset = pd.concat([features, annotations], axis=1)
    X = dataset[['x', 'y']]
    y = dataset[['xi', 'xf']]
    

    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = LinearRegression()
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    # works.resolve ( f"Prediction: {y_pred:.2f}, MSE:${mse}" )
    mse = mean_squared_error(y_test, y_pred)
    works.resolve ( {"Prediction": str(y_pred), "MSE": mse, "Training set features":  str( layers  ) } )

    # print(f'Mean Squared Error: {mse}')
    # print('Predictions:')
    # print(y_pred)
    
    


# Example usage
if __name__ == "__main__":
    # Replace '<training_set_id>' with the actual TrainingSet ObjectId as a string
    training_set_id = "66898b890babb8eb8dd015bd"

    
    main()
