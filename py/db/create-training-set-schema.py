import pymongo

from ion import works

# Parameters from works
database = works.param(1)  # Polygon data
if database is None:
    database = 'localhost'

if database.startswith('/'):
    database = database[1:]

client = pymongo.MongoClient(f"mongodb://{database}:27017/")

db = client['model_db']

# Define the model schema
model_schema = {
    "bsonType": "object",
    "required": ["name", "description", "id", "path", "user", "model", "data_type", "date_created"],
    "properties": {
        "name": {
            "bsonType": "string",
            "description": "Name of the model"
        },
        "description": {
            "bsonType": "string",
            "description": "Description of the model"
        },
        "id": {
            "bsonType": "int",
            "description": "ID of the model"
        },
        "path": {
            "bsonType": "string",
            "description": "Path to the experiment data"
        },
        "user": {
            "bsonType": "string",
            "description": "User associated with the experiment"
        },
        "model": {
            "bsonType": "binData",
            "description": "The saved model"
        },
        "data_type": {
            "bsonType": "string",
            "description": "Type of data being stored (e.g., 'training_data')"
        },
        "date_created": {
            "bsonType": "date",
            "description": "Date when the model was created or updated"
        }
    }
}

# Define the dataset schema
dataset_schema = {
    "bsonType": "object",
    "required": ["user", "model_name", "data_type", "data", "date_created", "dataset_id"],
    "properties": {
        "user": {
            "bsonType": "string",
            "description": "User associated with the dataset"
        },
        "model_name": {
            "bsonType": "string",
            "description": "Name of the model"
        },
        "data_type": {
            "bsonType": "string",
            "description": "Type of data being stored (e.g., 'training_data')"
        },
        "data": {
            "bsonType": "binData",
            "description": "The binary data of the dataset"
        },
        "date_created": {
            "bsonType": "date",
            "description": "Date when the dataset was created or updated"
        },
        "dataset_id": {
            "bsonType": "string",
            "description": "Unique identifier for each dataset"
        }
    }
}

# Define the collection options with validation
model_collection_options = {
    "validator": {
        "$jsonSchema": model_schema
    }
}

dataset_collection_options = {
    "validator": {
        "$jsonSchema": dataset_schema
    }
}

# Collection names
model_collection_name = "models"
dataset_collection_name = "datasets"

# Function to handle collection creation or recreation
def create_or_replace_collection(collection_name, collection_options):
    if collection_name in db.list_collection_names():
        print(f"Collection '{collection_name}' already exists.")
        
        # Drop the existing collection
        db.drop_collection(collection_name)
        print(f"Collection '{collection_name}' dropped.")
        
        # Recreate the collection with the new schema
        db.create_collection(collection_name, **collection_options)
        print(f"Collection '{collection_name}' recreated with new schema validation.")
    else:
        # Create the collection with the defined schema
        db.create_collection(collection_name, **collection_options)
        print(f"Collection '{collection_name}' created with schema validation.")

# Create or replace the 'models' collection
create_or_replace_collection(model_collection_name, model_collection_options)

# Create or replace the 'datasets' collection
create_or_replace_collection(dataset_collection_name, dataset_collection_options)
