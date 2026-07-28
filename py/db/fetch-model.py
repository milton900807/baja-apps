
import numpy as np
import pandas as pd
import joblib
import pymongo
import io
import json
import re
from bson.binary import Binary
from ion import works
import base64
import joblib
import io
import json
import gzip

user = works.param(1)
database = works.param(2)


if database is None:
    database = 'localhost'
database = database.rstrip('/')
client = pymongo.MongoClient(f"mongodb://{database}:27017/")
db = client['model_db']
collection_models = db['models']
model_set_name = 'models'


def load_model_from_mongo(user, model_set_name):
    model_data = collection_models.find_one({"user": user, "name": model_set_name})
    if model_data:
        model_buffer = io.BytesIO(model_data['model'])
        model = joblib.load(model_buffer)
        feature_names = model_data.get('feature_names', [])
        return model, feature_names
    else:
        return None, []


def save_model_as_json(user, model_set_name, output_file):
    # Load the model from MongoDB
    model, feature_names = load_model_from_mongo(user, model_set_name)

    if model is None:
        print(f"Model '{model_set_name}' for user '{user}' not found.")
        return

    # Serialize the model to a binary format
    model_buffer = io.BytesIO()
    joblib.dump(model, model_buffer)
    model_binary = model_buffer.getvalue()

    # Encode the binary model data to Base64
    model_base64 = base64.b64encode(model_binary).decode('utf-8')

    # Create a JSON-serializable object
    model_json = {
        "model_name": model_set_name,
        "user": user,
        "feature_names": feature_names,
        "model_data": model_base64
    }

    # Save the JSON object to a file
    with open(output_file, 'w') as json_file:
        json.dump(model_json, json_file, indent=4)
    print(f"Model saved to '{output_file}'")



 
def get_model_json(user):
    model, feature_names = load_model_from_mongo(user, model_set_name)
    if model is None:
        print(f"Model '{model_set_name}' for user '{user}' not found.")
        return
    model_buffer = io.BytesIO()
    joblib.dump(model, model_buffer)
    model_binary = model_buffer.getvalue()
    compressed_model = gzip.compress(model_binary)

    # Encode the compressed model data to Base64
    model_base64 = base64.b64encode(compressed_model).decode('utf-8')
    model_json = {
        "model_name": model_set_name,
        "user": user,
        "feature_names": feature_names,
        "model_data": model_base64
    }
    return model_json


url = 'hello'
model_json = get_model_json ( user )
url = works.save_temp(model_json) 
works.resolve ( {'url':url })