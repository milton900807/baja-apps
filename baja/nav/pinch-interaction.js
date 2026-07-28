function () {

    return new Promise(async (resolve, reject) => {

        let prev;

        let pinchListener = (evt, graph) => {

            if (!prev || !evt) {
                prev = evt

            } else if ( prev!=null && evt!=null )  {
                graph.rescale ();
                let xiw = graph.Xwc(evt.xi);
                let xfw = graph.Xwc(evt.xf);
                let diffii = (xfw - xiw);
                let xip = graph.Xwc(prev.xi);
                let xfp = graph.Xwc(prev.xf);
                let diffpp = (xfp - xip);
                let p = (diffpp - diffii);
                if (prev.xf - prev.xi < 0) {
                    p = p * (-1)
                }
                let yiw = graph.Ywc(evt.yi);
                let yfw = graph.Ywc(evt.yf);
                let current_dif_y = (yfw - yiw);
                let yip = graph.Ywc(prev.yi);
                let yfp = graph.Ywc(prev.yf);
                let prev_dif_y = yfp - yip;
                let yv = (current_dif_y - prev_dif_y) * (-2);
                let xfactor = p;
                let distanceY = yv;
                if (prev.yi - prev.yf < 0) {
                    distanceY *= (-1)
                }
                graph.setymin(graph.getymin() - distanceY);
                graph.getymax(graph.getymax() + distanceY);
                graph.setxmin(graph.getxmin() - xfactor)
                graph.setxmax(graph.getxmax() + xfactor)
                graph.rescale ();

                prev = evt;
            }
        }

        resolve(pinchListener)
    })

}
