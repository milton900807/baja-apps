import pandas as pd
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Embedding, LSTM, Dense, Bidirectional
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from tensorflow.keras.preprocessing.sequence import pad_sequences






sequences = data['sequence'].values
annotations = data['annotation'].values

# Encode annotations
label_encoder = LabelEncoder()
encoded_annotations = label_encoder.fit_transform(annotations)

tokenizer = tf.keras.preprocessing.text.Tokenizer(char_level=True)
tokenizer.fit_on_texts(sequences)
encoded_sequences = tokenizer.texts_to_sequences(sequences)

max_length = max(len(seq) for seq in encoded_sequences)
padded_sequences = pad_sequences(encoded_sequences, maxlen=max_length, padding='post')

X_train, X_test, y_train, y_test = train_test_split(padded_sequences, encoded_annotations, test_size=0.2, random_state=42)

model = Sequential([
    Embedding(input_dim=len(tokenizer.word_index) + 1, output_dim=64, input_length=max_length),
    Bidirectional(LSTM(64, return_sequences=True)),
    Bidirectional(LSTM(64)),
    Dense(64, activation='relu'),
    Dense(len(label_encoder.classes_), activation='softmax')
])

# Compile the model
model.compile(optimizer='adam', loss='sparse_categorical_crossentropy', metrics=['accuracy'])

# Train the model
model.fit(X_train, y_train, epochs=10, validation_data=(X_test, y_test))

# Predict
def predict_annotation(sequence):
    encoded_sequence = tokenizer.texts_to_sequences([sequence])
    padded_sequence = pad_sequences(encoded_sequence, maxlen=max_length, padding='post')
    prediction = model.predict(padded_sequence)
    predicted_annotation = label_encoder.inverse_transform([np.argmax(prediction)])
    return predicted_annotation[0]

# Example usage
test_sequence = "ATGCGTACGTAGCTAG"  # replace with your test sequence
predicted_annotation = predict_annotation(test_sequence)
print(f"Predicted annotation: {predicted_annotation}")
