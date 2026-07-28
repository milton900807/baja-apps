import pymongo
import joblib
import io
from datetime import datetime
import json
from ion import works


user = works.param(1)
model_name = works.param(2)
dbhost = works.param(3)

# MongoDB client setup
client = pymongo.MongoClient("mongodb://localhost:27017/")
db = client['model_db']
collection = db['models']


def load_model_from_mongo(user, model_name):
    model_data = collection.find_one({"user": user, "name": model_name})
    if model_data:
        model_buffer = io.BytesIO(model_data['model'])
        model = joblib.load(model_buffer)
        feature_names = model_data.get('feature_names', [])
        return model, model_data, feature_names
    else:
        return None, None, []

def get_model_statistics(user, model_name):
    model, model_data, feature_names = load_model_from_mongo(user, model_name)

    if model is None or model_data is None:
        return {"error": f"No model found for user '{user}' with name '{model_name}'."}

    # Basic model information
    model_info = {
        "Model Name": model_data['name'],
        "User": model_data['user'],
        "Model Type": model_data['model_type'],
        "Creation Date": model_data['date_created'].strftime('%Y-%m-%d %H:%M:%S'),
        "Description": model_data.get('description', 'No description provided'),
        "Feature Names": feature_names,
        "Number of Features": len(feature_names)
    }
    
    

    
    # Model-specific statistics
    if hasattr(model, 'feature_importances_'):
        feature_importances = model.feature_importances_
        model_info["Feature Importances"] = {
            name: importance for name, importance in sorted(
                zip(feature_names, feature_importances), key=lambda x: x[1], reverse=True
            )
        }
    else:
        model_info["Feature Importances"] = "Not available for this model type."
    
    return model_info

def get_model_statistics_json(user, model_name):
    model_info = get_model_statistics(user, model_name)
    return (model_info)


model_statistics_json = get_model_statistics_json(user, model_name)
document_count = collection.count_documents({"user": user, "name": model_name})

works.resolve( { 'doc-count': document_count, 'stats': model_statistics_json })
