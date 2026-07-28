function () {
    class SelectWells {
        pt = null;
        constructor(plate) {
            this.pt = plate;
        }
        mouseDown(xsc, ysc) {

            this.pt.select ( xsc, ysc );
        }
    }

    return (SelectWells)
}
