from pymongo import MongoClient

# Connect to MongoDB
client = MongoClient("mongodb://localhost:27017/")  # Update with your MongoDB URI if necessary
db = client["my_database"]  # Replace "my_database" with your database name
experiments_collection = db["experiments"]

# Define the experiment schema
experiment_schema = {
    "bsonType": "object",
    "required": ["name", "description", "id", "path", "user"],
    "properties": {
        "name": {
            "bsonType": "string",
            "description": "Name of the experiment"
        },
        "description": {
            "bsonType": "string",
            "description": "Description of the experiment"
        },
        "id": {
            "bsonType": "int",
            "description": "ID of the experiment"
        },
        "path": {
            "bsonType": "string",
            "description": "Path to the experiment data"
        },
        "user": {
            "bsonType": "string",
            "description": "User associated with the experiment"
        }
    }
}

# Function to create the experiment schema
def create_experiment_schema():
    # Check if the collection exists and drop it if it does
    if "experiments" in db.list_collection_names():
        db.experiments.drop()
        print("The 'experiments' collection already existed and was dropped.")
    
    # Create the collection with the schema validation
    db.create_collection("experiments", validator={
        "$jsonSchema": experiment_schema
    })
    print("Experiment schema created successfully.")

# Method to get the next unique experiment ID
def get_next_experiment_id():
    last_experiment = experiments_collection.find_one(sort=[("id", -1)])
    if not last_experiment:
        return 100
    return last_experiment["id"] + 1

# Method to create a new experiment
def create_experiment(name, description, path, user):
    if not name or not description or not path or not user:
        return {"error": "Name, description, path, and user are required."}

    try:
        experiment_id = get_next_experiment_id()
        
        new_experiment = {
            "name": name,
            "description": description,
            "id": experiment_id,
            "path": path,
            "user": user
        }

        experiments_collection.insert_one(new_experiment)
        return {"id": experiment_id, "message": "Experiment created successfully."}
    except Exception as error:
        print("Error creating experiment:", error)
        return {"error": "An error occurred while creating the experiment."}

# Example usage
if __name__ == "__main__":
    create_experiment_schema()  # Create (or recreate) the experiment schema
    
    # Example data
    name = "Experiment 1"
    description = "This is a test experiment"
    path = "/path/to/experiment"
    user = "user123"  # Example user identifier

    result = create_experiment(name, description, path, user)
    print(result)
