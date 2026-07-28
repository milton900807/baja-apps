from ion import works
import sys


data = ""

with open('/data/cddid.tbl', 'r') as file:
    data = file.read().rstrip()

works.resolve ( {"data":data})