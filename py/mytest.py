from ion import works
import sys

print ( sys.argv )
a = works.param(1)
b = works.param(2)

works.msg ( 'test message' )


works.msg ( ' done running large batch job ')



works.progress ( 100 )

print ( " key ", ' ' )
works.resolve ( {a:b})