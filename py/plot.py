
from ion import works
import matplotlib.pyplot as plt
import os 
import sys


# print ( str(sys.argv) )
xs = sys.argv[1]
ys = sys.argv[2]
x = []
y = []

for xa in xs.split (','):
    x.append ( float (xa))
for ya in ys.split (','):
    y.append ( float (ya))

# print ( x )
# print  ( y )

plt.plot(x, y)
plt.xlabel('Months')
plt.ylabel('Pi data Xchi')
filepath = works.tempfile ('.png')
plt.savefig(filepath)   

works.resolve ({'plot':filepath})

