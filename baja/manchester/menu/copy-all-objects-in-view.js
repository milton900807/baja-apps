function (graph) {

    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.setMouseMode('navigate')

    graph.selectOff();

    let getB64 = (img) => {
        var canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        var base64 = canvas.toDataURL("image/png");
        return base64;
    }

    let viewport = graph.getViewport();

    let jb = JSON.stringify(viewport, (key, value) => {
        if (key == "img") {
            let imgv = value;
            let v = getB64(imgv);
            return v
        }
        if (key == "trackRef") {
            if ( value != null ){
                return "->:"+value.track.name + ':map:'+ JSON.stringify ( value.map ) + ':showMismatches:' + value.showMismatches + ':';
            }
            return value;
        }
        else {
            return value;
        }
    })

    const item = new Blob([jb], { type: 'text/plain' });

    const citem = new ClipboardItem({
        'text/plain': item
    });
    navigator.clipboard.write([citem]);

}
