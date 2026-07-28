from pymongo import MongoClient



connection_string = "mongodb://localhost:27017/"
client = MongoClient(connection_string)
db = client['model_db']
collection = db['models']
# Access the database and collection
collection.delete_many({})
client.close()


