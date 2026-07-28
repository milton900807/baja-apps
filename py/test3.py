from ion import works
import sys


print ( sys.argv )

voc = works.param (1)
loc = works.param (2)
ndays = works.param(3)
works.update ( {
    'hello':'world'
})



print ( ' -  - - - - - - - - - - -- ---  -- - ---')
print ( voc )
for i in voc: 
    print ('\t\t', i )
print ( loc  )
print ( ndays )
print ( ' -  - - - - - - - - - - -- ---  -- - ---')

works.resolve ( { 'voc': voc, 'loc': loc})