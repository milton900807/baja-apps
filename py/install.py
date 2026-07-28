import os
import sys
# os.system('pip install pandas')
# 534  export INSTALL_DIR=.
# 535  python setup.py install --prefix=$INSTALL_DIR
# t = os.environ['PYTHONPATH']
# print ( t )
#os.system('python3 ../trailscript/py/setup.py install --install-dir="../trailscript/py"')
os.system('python3 ../ionscript/py/setup.py install --install-dir="../ionscript/py"')
from ion import works
