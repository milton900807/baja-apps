function () {

    exec('flexigraph/oligo.js').then(Oligo => {

        let alignment_file = `
                Start	Stop	Alt	Ref
            61726871	61726871	T	G
            61727791	61727791	A	G
            61729063	61729063	T	C
            61730183	61730183	T	C
            61730234	61730234	C	T
            61730553	61730553	C	T
            61731325	61731324	AA	-
            61731463	61731463	-	A
            61731534	61731534	T	G

    `
        alignment_file = alignment_file.trim()
        alignment_file = alignment_file.replaceAll('\r', ' ')
        let sp = alignment_file.split(/\r?\n/)
        let res = {}
        let start_index = 0;
        let end_index = 1;
        let alt_index = 2;
        let ref_index = 3;

        let first_line = sp[0]
        let trv = first_line.split(/\s+/)
        let index = 0;
        for (let t of trv) {
            if (t.toUpperCase().startsWith('START')) {
                start_index = index;
            } else if (t.toUpperCase().startsWith('STOP')) {
                end_index = index;
            } else if (t.toUpperCase().startsWith('ALT')) {
                alt_index = index;
            } else if (t.toUpperCase().startsWith('REF')) {
                ref_index = index;
            }
            index++;
        }

        let o = []
        for (let line of sp) {
            line = line.trim()
            let trv = line.split(/\s+/g)
            let start = trv[start_index]
            let end = trv[end_index]
            let ref = trv[ref_index]
            let alt = trv[alt_index]

            if (ref.toUpperCase() === 'REF') {

            } else {
                log(start + ' ' + end + ' ' + ref + ' ' + alt)
                let oligo = new Oligo('allele', '' + ref + '/' + alt, start, end, 0.1);
                o.push(oligo)
            }

        }
        showWidget ( {
            wid:'json',
            data:JSON.stringify ( o )
        })
    })
}
