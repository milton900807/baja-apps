let track_start = 25227379;
for (let t = track_start; t < track_start + 1000; t += 3) {
    let chemistry_template = `([?]moe.p.){5}([?]d.p.){10}([?]moe.p.){4}([?]moe){1}`
    CreateCompound(chemistry_template, track[0], t)
}

let track_start = 69682990;
let i = 0.10
for (let t = track_start; t < track_start + 1000; t += 3) {
    let chemistry_template = `([?]moe.p.){5}([?]d.p.){10}([?]moe.p.){4}([?]moe){1}`
    CreateCompound(chemistry_template, track[0], t, i+=0.01)
}

let track_start = 69682990;
let i = 0.10
for (let t = track_start; t < track_start + 78; t += 3) {
    let chemistry_template = `([?]moe.p.){5}([?]d.p.){10}([?]moe.p.){4}([?]moe){1}`
    CreateCompound(chemistry_template, track[0], t, i += 0.05)
}

add('ENST00000311936')

let annotations = track[0].getAnnotationsInRange ( graph.getRange ().start, graph.getRange ().end )
getOligosInRange
log ( annotations.length )

let chemistry_template = `([?]moe.p.){5}([?]d.p.){10}([?]moe.p.){4}([?]moe){1}`
let st = graph.getRange().start
let en = graph.getRange().end
logs(st + ' , ' + en + ' dif ' + ((en - st) / 15))
let y = 0.1;
for (let i = st; i < (en); i += 15) {
    y += 0.04;
    if (y > 0.7) {
        y = 0.1;
    }
}
track[0].addTrackPlot()

let chemistry_template = screen.selected_chemistry
let st = graph.getRange().start
let en = graph.getRange().end
logs(st + ' , ' + en + ' dif ' + ((en - st) / 15))
let y = 0.1;
for (let i = st; i < (en); i += 15) {
    y += 0.04;
    if (y > 0.7) {
        y = 0.1;
    }
    Biopolymer.createCompound(chemistry_template, track[0], i, y += 0.04)
}
track[0].addTrackPlot()

let annotations = track[0].getAnnotationsInRange(graph.getRange().start, graph.getRange().end)
for (let a of annotations) {
    logs(a.name)
}
let oligos = track[0].getOligosInRange(graph.getRange().start, graph.getRange().end)
for (let a of oligos) {
    logs(a.name)
}
