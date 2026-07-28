import json
import sys
from ion import works
import glob

print ( sys.argv )

pattern = works.param(1)
_pattern = works.param(2)

fhs = glob.glob('/tmp/*%s' % (pattern))

print(fhs)


works.progress ( 100 )
works.resolve ( {'test':pattern, 'values': json.dumps(fhs) } )




