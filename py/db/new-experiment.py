from pymongo import MongoClient
from ion import works

client = MongoClient("mongodb://localhost:27017/")  # Update with your MongoDB URI if necessary
db = client["my_database"]  # Replace "my_database" with your database name
experiments_collection = db["experiments"]
def get_next_experiment_id():
    last_experiment = experiments_collection.find_one(sort=[("id", -1)])
    if not last_experiment:
        return 100
    return last_experiment["id"] + 1
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

user = works.param(1)
name = works.param(2)
desc = works.param(3)
path = works.param(4)

if name and len(name) > 0 and path and len(path) > 0 and user and len(user) > 0:
    result = create_experiment(name, desc, path, user)
    print(result)
    works.resolve(result)
