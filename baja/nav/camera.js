function (grid, togrid) {

    let c = (grid.getmax() = grid.getxmin()) / 2;
    let tc = (togrid.getmax() = togrid.getxmin()) / 2;
    let dif = tc - c;
    let incr = dif / 10;
    let p = 0.1

    let interval = setInterval(() => {
        c.setxmin(grid.getxmin() + grid.getxmin() * incr)
        c.setxmax(grid.getxmax() - grid.getxmax() * incr)

    }, 1000)
    setTimeout(() => clearInterval(interval), 10000);

}
