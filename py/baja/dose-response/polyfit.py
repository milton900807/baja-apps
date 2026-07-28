import numpy as np
import matplotlib.pyplot as plt
from numpy.polynomial.polynomial import Polynomial
import numpy as np
import json
from scipy.optimize import curve_fit
import json
import sys
from ion import works

x = works.param(1)
y = works.param(2)

if not isinstance ( x, list ):
    x = [x]
if not isinstance ( y, list ):
    y = [y]


works.msg ( 'bajabio Polyfit' )


def generate_and_plot_polynomial(points):
    """
    Generate a best-fit polynomial from 4 points and plot the result.

    Parameters:
    points (list of tuples): A list of (x, y) points. Requires 4 points.

    Returns:
    Polynomial: A numpy Polynomial object representing the fitted polynomial.
    """
    if len(points) < 4:
        raise ValueError(" 4 or more points are required to generate a best-fit cubic polynomial.")

    # Extract x and y values from points
    x_vals = np.array([p[0] for p in points])
    y_vals = np.array([p[1] for p in points])

    # Fit a cubic polynomial (degree 3)
    coeffs = np.polyfit(x_vals, y_vals, 4)
    poly = Polynomial(coeffs[::-1])  # Reverse for numpy Polynomial format

    # Plot the original points
    plt.scatter(x_vals, y_vals, color='red', label='Original Points')

    # Plot the fitted polynomial curve
    x_fit = np.linspace(min(x_vals) - 1, max(x_vals) + 1, 500)
    y_fit = poly(x_fit)

    plt.plot(x_fit, y_fit, label='Best-Fit Polynomial')
    plt.xlabel('X')
    plt.ylabel('Y')
    plt.title('Polynomial Best Fit')
    plt.legend()
    plt.grid(True)
    plt.show()

    return poly


def generate_points_from_arrays(x, y):
    """
    Generate a list of (x, y) points from two arrays.

    Parameters:
    x (list or array): Array of x values.
    y (list or array): Array of y values.

    Returns:
    list of tuples: List of (x, y) points.
    """
    if len(x) != len(y):
        works.resolve ( {'msg':'4 or more points are required'} )
        raise ValueError("Arrays x and y must have the same length.")
    
    points = list(zip(x, y))
    return points


def polynomial_to_json(polynomial):
    """
    Convert a numpy Polynomial object to a JSON structure.

    Parameters:
    polynomial (Polynomial): A numpy Polynomial object.

    Returns:
    dict: JSON-compatible dictionary representing the polynomial.
    """
    coeffs = polynomial.coef.tolist()
    poly_dict = {
        "coefficients": coeffs,
        "degree": len(coeffs) - 1,
        "expression": " + ".join([f"{c:.2f}x^{i}" if i > 0 else f"{c:.2f}" 
                                  for i, c in enumerate(coeffs)])
    }
    return json.dumps(poly_dict, indent=4)


points = generate_points_from_arrays(x, y)
polynomial = generate_and_plot_polynomial(points)

# Convert polynomial to JSON and print
poly_json = polynomial_to_json(polynomial)
# print("Polynomial as JSON:\n", poly_json)
works.progress ( 100 )
works.resolve ( poly_json )
