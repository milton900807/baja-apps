import os
import json 
import uuid
import sys


image_server_uri = os.getenv('FIG_HOST')

def getURL ( filename ):
    if filename.startswith ( '/'):
        filename = filename[1:]
    i = image_server_uri + '/' + filename
    return i
    
def resolve ( resolve_object ):
    print ('IONWORKS:RESOLUTION:\t'+json.dumps(resolve_object) )

def show ( resolve_object ):
    print ('IONWORKS:SHOWWIDGET:\t'+json.dumps(resolve_object) )

def msg ( msg ): 
    print ('IONWORKS:MSG:\t'+msg)

def progress ( value ):
    print ('IONWORKS:PROGRESS:\t' + str(value))


def findType ( obj ):
    if obj.isnumeric():
        if '.' in obj:
            return float(obj)
        else:
            return int(obj)
    else:
        return str(obj)

def getArray ( string_array ):
    ta = []
    spt = string_array.split ( ',')
    if len(spt) > 1:
        for s in spt:
            ta.append ( findType (s.strip()) )
        return ta
    elif isinstance (spt, list):
        ta.append ( spt )
    else:
        if spt.startswith ('[' ):
            spt = spt[1:]
        if spt.endswith (']'):
            spt = spt[0:-1]
        ta.append (findType ( spt ))


def arg ( index ):
    print( ' sys argv ', sys.argv )
    temp = sys.argv[index]
    if temp is not None: 
        if isinstance (temp, list):
            return temp
        elif ',' in temp:
            array_arg = getArray ( temp )
            return array_arg
        elif temp.startswith ( '['):
            temp =temp[1:-1]
            array_arg = getArray ( temp )
            return array_arg
        else:
            return findType ( temp )
    else:
        return ''




def exit( ):
    print ('IONWORKS:EXIT:')


def tempfile ( extention ):
    if extention.startswith ('.'):
        unique_filename = str(uuid.uuid4()) + str(extention)
    else:
        unique_filename = str(uuid.uuid4()) + '.' + str(extention)
    return '/workspaces/public/' + unique_filename


def tempdir (  ):
    unique_filename = str(uuid.uuid4())
    os.makedirs ( '/workspaces/public/' + unique_filename )
    return '/workspaces/public/' + unique_filename
