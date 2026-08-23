function () {

    return new Promise(async (resolve, reject) => {

        class MerMade48X {

            format(chain) {

                if (!chain) return '';

                let seq = '';
                let units = chain.split('.');

                for (let u of units) {

                    let ps = false;

                    if (u.toLowerCase().endsWith('sp')) {
                        ps = true;
                        u = u.substring(0, u.length - 2);
                    }

                    if (u.toLowerCase().endsWith('p')) {
                        u = u.substring(0, u.length - 1);
                    }

                    let base = this.parseBase(u);
                    let code = this.getMerMadeCode(u, base);

                    if (code.length > 1) {
                        seq += '(' + code + ')';
                    } else {
                        seq += code;
                    }

                    if (ps) seq += '*';
                }

                return seq + ',U,Off';
            }

            parseBase(unit) {
                let i = unit.indexOf('(');
                let j = unit.indexOf(')');
                if (i >= 0 && j > i) {
                    return unit.substring(i + 1, j).toUpperCase();
                }
                return unit.toUpperCase();
            }

            getMerMadeCode(unit, base) {

                unit = unit.toLowerCase();

                if (unit.startsWith('moe(')) {
                    return 'MO' + base.toLowerCase();
                }

                if (unit.startsWith('d(') && base === 'C') {
                    return 'MEC';
                }

                if (base === 'A' || base === 'G' || base === 'T' || base === 'C') {
                    return base;
                }

                return base;
            }

        }

        resolve(new MerMade48X());

    });

}
