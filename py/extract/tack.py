import uuid

class Track:
    def __init__(self):
        self.name = 'untitled'
        self.geneID = None
        self.xi = None
        self.xf = None
        self.strand = None
        self.color = 'rgb(153,159,198)'
        self.y = 1
        self.annotations = []
        self.oligos = []
        self.snpindels = []
        self.showPlots = True
        self.plots = []
        self.sequence = None
        self.markstart = None
        self.markend = None
        self.tgraph = None
        self.showName = False
        self.targetPhase = None
        self.targetVariant = None
        self.hideTrackCoords = True
        self.showResizeBar = True
        self.trackRef = None
        self.showTrackRefMap = False
        self.structures = []
        self.highlight_features = {}
        self.track_layers = []
        self.chr = None
        self.species = None
        self.showSnpIndels = True
        self.showLayers = True
        self.showOfftargets = True
        self.showOligoMap = False
        self.orf = None
        self.orfhash = None
        self.id = uuid.uuid4()
        self.transcriptID = None
        self.highlightIndex = None
