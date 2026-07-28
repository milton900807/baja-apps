import pymc3 as pm
import numpy as np
import json
from ion import works

doses = works.param(1)
responses = works.param(2)

if not isinstance(doses, list):
    doses = [doses]
if not isinstance(responses, list):
    responses = [responses]

works.progress ( 60 )

with pm.Model() as ic50_model:
    
    # Priors for IC50, top, bottom, and Hill coefficient
    ic50 = pm.Uniform("ic50", lower=0, upper=np.max(doses))
    top = pm.Normal("top", mu=np.max(responses), sigma=10)
    bottom = pm.Normal("bottom", mu=np.min(responses), sigma=10)
    hill_slope = pm.Normal("hill_slope", mu=1, sigma=0.5)
    response_pred = bottom + (top - bottom) / (1 + (doses / ic50) ** hill_slope)
    likelihood = pm.Normal("response", mu=response_pred, sigma=1, observed=responses)
with ic50_model:
    trace = pm.sample(2000, tune=1000, cores=2)

# Extract posterior samples
ic50_samples = trace["ic50"]
top_samples = trace["top"]
bottom_samples = trace["bottom"]
hill_slope_samples = trace["hill_slope"]

works.progress ( 70 )

# Calculate posterior means and credible intervals
ic50_mean = np.mean(ic50_samples)
top_mean = np.mean(top_samples)
bottom_mean = np.mean(bottom_samples)
hill_slope_mean = np.mean(hill_slope_samples)

ic50_ci = np.percentile(ic50_samples, [2.5, 97.5])


works.progress ( 80 )

# Print results
print(f"Estimated IC50: {ic50_mean:.2f}")
print(f"95% Credible Interval for IC50: ({ic50_ci[0]:.2f}, {ic50_ci[1]:.2f})")
print(f"Top: {top_mean:.2f}")
print(f"Bottom: {bottom_mean:.2f}")
print(f"Hill Slope: {hill_slope_mean:.2f}")

# Prepare the result
result = {
    "dose-response": {
        "IC50": round(ic50_mean, 2),
        "top": round(top_mean, 2),
        "bottom": round(bottom_mean, 2),
        "hill_slope": round(hill_slope_mean, 2),
        "doses": doses,
        "responses": responses
    },
}

# Convert to JSON format and print
json_output = json.dumps(result, indent=4)
works.progress(100)
works.resolve(json_output)
