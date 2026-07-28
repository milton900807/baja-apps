function () {

    class Highlighter {
        getTrackHighlighters() {
            return {
                'annotations.Exon': (graph, xs, xf, y) => {

                    graph.drawLine(xs, y, xf, y, 'blue', 100, 'butt')

                    graph.drawVerticalLine(xs, y, 1.13, 'black', 3)
                    graph.drawVerticalLine(xf, y, 1.13, 'black', 3)
                    graph.drawVerticalLine(xs, y, 1.13, 'yellow', 1)
                    graph.drawVerticalLine(xf, y, 1.13, 'yellow', 1)

                },
                'annotations.Intron': (graph, xs, xf, y) => {
                    graph.drawLine(xs, y, xf, y, 'blue', 100, 'butt')
                    graph.drawVerticalLine(xs, y, 1.13, 'black', 3)
                    graph.drawVerticalLine(xf, y, 1.13, 'black', 3)
                    graph.drawVerticalLine(xs, y, 1.13, 'yellow', 1)
                    graph.drawVerticalLine(xf, y, 1.13, 'yellow', 1)
                },

                'annotations.mutation-annotation': (graph, xs, xf, y) => {

                    graph.drawLine(xs, y, xf, y, 'blue', 100, 'butt')

                    graph.drawVerticalLine(xs, y, 1.13, 'magenta', 3)
                    graph.drawVerticalLine(xf, y, 1.13, 'black', 3)

                }, 'annotations.rna-binding': (graph, xs, xf, y) => {

                    graph.drawLine(xs, y, xf, y, 'orange', 6, 'round')

                    graph.drawVerticalLine(xs, y, 1.13, 'lightGray', 1)
                    graph.drawVerticalLine(xf, y, 1.13, 'lightGray', 1)

                },'annotations.snp': (graph, xs, xf, y) => {

                    graph.drawLine(xs, y, xf, y, 'green', 60, 'butt')

                    graph.drawVerticalLine(xs, y, 1.13, 'lightGray', 1)
                    graph.drawVerticalLine(xf, y, 1.13, 'lightGray', 1)

                },
            }
        }

    }

    return Highlighter

}
