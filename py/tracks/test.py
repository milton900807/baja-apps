from ion import works

import matplotlib as mpl
mpl.use('agg')
from matplotlib.testing.compare import compare_images
from tempfile import NamedTemporaryFile
import os.path
import pygenometracks.plotTracks
from pygenometracks.utilities import InputError

region = works.param(1)

print ( ' region ', region )
ini_file = "/tmp/encore-eclip-concat.ini"
outfile = NamedTemporaryFile(suffix='.svg', delete=False) 
args = f"--tracks {ini_file} --region {region} "\
           "--trackLabelFraction 0.2  --height 10 --width 128 "\
           f"--outFileName {outfile.name}".split()


print (' args: ', args )
pygenometracks.tracksClass.DEFAULT_MARGINS = {'left': -0.0170, 'right': 1.2550, 'bottom':0, 'top': 1.0}
pygenometracks.plotTracks.main(args)

works.resolve ( {'file':outfile.name} )

