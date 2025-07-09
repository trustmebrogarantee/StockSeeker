import torch
import torch.nn as nn
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import pickle
import json
import asyncio
import websockets

# Define the model class (must match the training architecture)
class Classifier(nn.Module):
    def __init__(self, input_dim, num_classes):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_dim, 16),
            nn.ReLU(),
            nn.Linear(16, 8),
            nn.ReLU(),
            nn.Linear(8, num_classes)
        )
        
    def forward(self, x):
        return self.network(x)

# 1. Load saved model parameters
with open("modules/ml/model_data.pkl", "rb") as f:
    model_data = pickle.load(f)

means = np.array(model_data["means"])
stds = np.array(model_data["stds"])
state_dict = model_data["state_dict"]

# Initialize model and load state_dict
input_dim = len(means)  # Number of features
num_classes = state_dict['network.4.bias'].shape[0]  # Number of classes from final layer's bias
model = Classifier(input_dim=input_dim, num_classes=num_classes)
model.load_state_dict(state_dict)
model.eval()  # Set to evaluation mode

# 2. Load data for prediction and visualization
url = "C:\\Users\\olegs\\Programming\\StockExperiment\\modules\\ml\\deals.csv"
with open("C:\\Users\\olegs\\Programming\\StockExperiment\\modules\\ml\\headers.json", 'r') as file:
    columns = json.load(file)

df = pd.read_csv(url, names=columns)


df = df.dropna()
df = df[~df.iloc[:, :-1].replace([float('inf'), -float('inf')], pd.NA).isna().any(axis=1)]

# Encode classes
df["class"] = df["class"].astype("category").cat.codes

# 3. Standardize features using loaded means and stds
X = df.iloc[:, :-1].values
X_scaled = (X - means) / stds  # Standardize
X_scaled = torch.FloatTensor(X_scaled)  # Convert to PyTorch tensor

# True classes
y_test_classes = df["class"].values

# 4. Prediction for dataset
def predict(X, model):
    with torch.no_grad():
        outputs = model(X)
        probabilities = torch.softmax(outputs, dim=1)  # Convert logits to probabilities
        _, predicted = torch.max(outputs, 1)
    return predicted.cpu().numpy(), probabilities.cpu().numpy()

# New prediction function for JSON input
def predict_from_json(array_input, model):
    """
    Predicts class and probabilities from a JSON array of features (excluding class).
    JSON array must match the order of columns[:-1].
    """
    # Parse JSON and convert to numpy array
    features = np.array(array_input, dtype=float)
    
    # Validate feature count
    expected_features = len(columns) - 1  # Excluding class
    if features.shape != (expected_features,):
        raise ValueError(f"Expected {expected_features} features, received {features.shape[0]}")
    
    # Standardize
    features_scaled = (features - means) / stds
    features_scaled = torch.FloatTensor(features_scaled).unsqueeze(0)  # Add batch dimension
    
    # Predict
    with torch.no_grad():
        outputs = model(features_scaled)
        probabilities = torch.softmax(outputs, dim=1)  # Convert logits to probabilities
        predicted_class = torch.argmax(outputs, dim=1).item()
    
    return predicted_class, probabilities.squeeze(0).cpu().numpy().tolist()

# 6. WebSocket Server (updated handler)
async def prediction_handler(websocket):
    """
    Handles WebSocket messages, accepts JSON array, returns predicted class and probabilities.
    """
    try:
        async for message in websocket:
            try:
                # Perform prediction
                data = json.loads(message)
                predicted_class, probabilities = predict_from_json(data['sample'], model)
                print(data['id'], predicted_class, probabilities)
                # Send response
                response = json.dumps({
                    "id": data['id'],
                    "predicted_class": int(predicted_class),
                    "probabilities": probabilities
                })
                await websocket.send(response)
            except (json.JSONDecodeError, ValueError):
                raise ValueError("Invalid JSON or incorrect data format")
            except ValueError as e:
                # Validation errors
                response = json.dumps({"error": str(e)})
                await websocket.send(response)
            except Exception as e:
                # Other errors
                response = json.dumps({"error": "Internal server error"})
                await websocket.send(response)
    except websockets.exceptions.ConnectionClosed:
        print("Client disconnected")

# Start WebSocket server
async def main():
    PORT = 9070
    server = await websockets.serve(prediction_handler, "localhost", PORT)
    print(f"WebSocket server started on ws://localhost:{PORT}")
    await server.wait_closed()

if __name__ == "__main__":
    # Start WebSocket server
    asyncio.run(main())