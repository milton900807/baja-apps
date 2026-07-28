import pymongo
import sys


def get_user_confirmation():
    """
    Prompt the user to confirm the deletion and reset of the MongoDB schema.
    Returns True if the user confirms, otherwise False.
    """
    confirmation = input(
        "Are you sure you want to delete and reset the milestones MongoDB schema? "
        "This action is irreversible. (yes/no): "
    ).strip().lower()
    return confirmation in ["yes", "y"]


def reset_milestone_schema():
    """
    Deletes and resets the milestones MongoDB schema after user confirmation.
    """

    # Check if the user confirms the action
    if not get_user_confirmation():
        print("Operation canceled by the user.")
        sys.exit(0)

    # MongoDB setup
    client = pymongo.MongoClient("mongodb://localhost:3000/")
    db = client["milestone_db"]          
    collection_name = "milestone_queries"

    # Drop the collection if it exists
    if collection_name in db.list_collection_names():
        db.drop_collection(collection_name)
        print(f"Collection '{collection_name}' has been deleted.")

    # JSON Schema for milestone documents
    milestone_schema = {
        "bsonType": "object",
        "required": ["queryString", "date", "window", "milestones"],
        "properties": {
            "queryString": {
                "bsonType": "string",
                "description": "Original query text for which milestones were generated",
            },
            "date": {
                "bsonType": "date",
                "description": "When this query was executed/saved",
            },
            "window": {
                "bsonType": "object",
                "required": ["start", "end"],
                "properties": {
                    "start": {
                        "bsonType": "date",
                        "description": "Start of the visible window (timeline)",
                    },
                    "end": {
                        "bsonType": "date",
                        "description": "End of the visible window (timeline)",
                    },
                },
            },
            "milestones": {
                "bsonType": "array",
                "description": "Array of milestone objects for this query",
                "items": {
                    "bsonType": "object",
                    "required": ["x", "y", "type", "name", "date"],
                    "properties": {
                        "x": {
                            "bsonType": ["double", "int"],
                            "description": "X position (timeline coordinate in pixels or hours)",
                        },
                        "y": {
                            "bsonType": ["double", "int"],
                            "description": "Y position (normalized 0–1 or pixel coordinate)",
                        },
                        "type": {
                            "bsonType": "string",
                            "description": "Type of item (usually 'milestone')",
                        },
                        "name": {
                            "bsonType": "string",
                            "description": "Milestone label",
                        },
                        "color": {
                            "bsonType": ["string", "null"],
                            "description": "Color hex code for rendering",
                        },
                        "date": {
                            "bsonType": "date",
                            "description": "Date/time of the milestone event",
                        },
                        "url": {
                            "bsonType": ["string", "null"],
                            "description": "Optional URL with more info",
                        },
                        "scope": {
                            "bsonType": ["object", "null"],
                            "description": "Visibility scope (px-per-time constraints)",
                            "properties": {
                                "minPxPerMonth": {
                                    "bsonType": ["double", "int", "null"],
                                },
                                "maxPxPerMonth": {
                                    "bsonType": ["double", "int", "null"],
                                },
                                "minPxPerDay": {
                                    "bsonType": ["double", "int", "null"],
                                },
                                "maxPxPerDay": {
                                    "bsonType": ["double", "int", "null"],
                                },
                                "minPxPerHour": {
                                    "bsonType": ["double", "int", "null"],
                                },
                                "maxPxPerHour": {
                                    "bsonType": ["double", "int", "null"],
                                },
                            },
                        },
                    },
                },
            },
        },
    }

    # Define the collection options with the schema validator
    collection_options = {
        "validator": {
            "$jsonSchema": milestone_schema
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
    reset_milestone_schema()
