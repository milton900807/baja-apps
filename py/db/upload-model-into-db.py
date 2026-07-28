import base64
import joblib
import io
import json
import argparse
import pandas as pd
from ion import works
import os
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, learning_curve
from sklearn.metrics import accuracy_score, classification_report
from ion import works
import joblib
import pymongo
from bson import Binary
from datetime import datetime
import io
import re
import json

# Get the value of an environment variable
userfolder = os.getenv('LJLUSERS')

if userfolder.startswith(':'):
    userfolder = userfolder[1:]


print ( userfolder )


file = works.param(1)
encodeduser = works.param(2)
database = works.param(3)

if database is None: 
    database = 'ljldb'

path_structure = os.path.join(userfolder, encodeduser, '.models', file)
print ( path_structure )

# MongoDB client setup
client = pymongo.MongoClient(f"mongodb://{database}:27017/")
db = client['model_db']
collection_models = db['models']


def load_model_from_json(json_file):
    with open(json_file, 'r') as file:
        model_json = json.load(file)
    model_base64 = model_json['model_data']
    user = model_json['user']
    feature_names = model_json.get('feature_names', [])
    model_binary = base64.b64decode(model_base64)
    model_buffer = io.BytesIO(model_binary)
    model = joblib.load(model_buffer)
    return user, model, feature_names


def save_model_to_mongo(model, user, model_name, feature_names, description="---", path="no path", version=1):
    model_buffer = io.BytesIO()
    joblib.dump(model, model_buffer)
    model_buffer.seek(0)
    model_bin = Binary(model_buffer.read())

    model_size_bytes = model_buffer.tell()
    model_size_kb = model_size_bytes / 1024
    model_size_mb = model_size_kb / 1024
    print(f"Size of the model binary: {model_size_bytes} bytes ({model_size_kb:.2f} KB, {model_size_mb:.2f} MB)")

    model_document = {
        "name": model_name,
        "description": description,
        "id": version,
        "path": path,
        "user": user,
        "model_type": type(model).__name__,
        "date_created": datetime.utcnow(),
        "model": model_bin,
        "feature_names": feature_names,
        "data_type": "polygons"
    }

    try:
        result = collection_models.replace_one(
            {"user": user, "name": model_name},
            model_document,
            upsert=True
        )
        print(f"Model '{model_name}' for user '{user}' saved to MongoDB. Matched count: {result.matched_count}, Modified count: {result.modified_count}")
    except pymongo.errors.WriteError as e:
        print(f"Failed to save model_document due to validation error: {e.details}")
    except Exception as e:
        print(f"An unexpected error occurred: {str(e)}")


user, lm, fn = load_model_from_json (path_structure)
save_model_to_mongo ( lm, user, 'models', fn )

works.resolve ( {'msg':'New model loaded'})