import pymongo
import sys

def get_user_confirmation():
    """
    Prompt the user to confirm the deletion and reset of the MongoDB schema.
    Returns True if the user confirms, otherwise False.
    """
    confirmation = input("Are you sure you want to delete and reset the MongoDB schema? This action is irreversible. (yes/no): ").strip().lower()
    if confirmation in ['yes', 'y']:
        return True
    else:
        return False

def reset_mongo_schema():
    """
    Deletes and resets the MongoDB schema after user confirmation.
    """
    # MongoDB setup
    client = pymongo.MongoClient("mongodb://localhost:27017/")
    db = client['model_db']
    collection_name = 'models'

    # Check if the user confirms the action
    if not get_user_confirmation():
        print("Operation canceled by the user.")
        sys.exit(0)

    # Drop the collection if it exists
    if collection_name in db.list_collection_names():
        db.drop_collection(collection_name)
        print(f"Collection '{collection_name}' has been deleted.")

    # Define the schema (validator) for the collection
    model_schema = {
        "bsonType": "object",
        "required": ["name", "description", "id", "path", "user", "model"],    
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
            }
        }
    }

    # Define the collection options with the schema validator
    collection_options = {
        "validator": {
            "$jsonSchema": model_schema
        }
    }

    # Create the collection with the defined schema
    try:
        db.create_collection(collection_name, **collection_options)
        print(f"Collection '{collection_name}' has been created with schema validation.")
    except pymongo.errors.CollectionInvalid:
        print(f"Collection '{collection_name}' already exists.")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    reset_mongo_schema()

