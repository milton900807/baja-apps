# app.py
from flask import Flask, request, jsonify
from tensorflow.keras.models import load_model

app = Flask(__name__)

# Load your Keras model
model = load_model('./toxic-score.keras')

@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json(force=True)
    prediction = model.predict([data['smiles']])
    return jsonify(prediction.tolist())

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
