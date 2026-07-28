import numpy as np
import json
from scipy.optimize import curve_fit
import json
import sys
from ion import works
import glob

doses = works.param(1)
responses = works.param(2)

if not isinstance ( doses, list ):
    doses = [doses]
if not isinstance ( responses, list ):
    responses = [responses]


# Example dose-response data
# doses = np.array([0.1, 0.5, 1, 5, 10, 20, 50, 100])
# responses = 100 / (1 + (doses / 10)**2)  # Original dose-response curve

def sigmoid(x, top, bottom, IC50, hill_slope):
    return bottom + (top - bottom) / (1 + (x / IC50)**hill_slope)

# Fit the original data to the sigmoid model
popt, _ = curve_fit(sigmoid, doses, responses, bounds=(0, [100, 100, 100, 5]))
top, bottom, IC50, hill_slope = popt

result = {
    "dose-response": {
        "IC50": round(IC50, 2),
        "top": round(top, 2),
        "bottom": round(bottom, 2),
        "hill_slope": round(hill_slope, 2),
        "doses": doses,
        "responses": responses
    },
}

# Convert to JSON format and print
json_output = json.dumps(result, indent=4)

works.progress ( 100 )
works.resolve ( json_output )





