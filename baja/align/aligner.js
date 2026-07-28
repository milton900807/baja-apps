function () {

    return new Promise(async (resolve, reject) => {

        function show_alignment(s1, s2, n = 80) {
            let res = "";
            let l = Math.max(s1.length, s2.length);
            let i = 0;
            while (l > i + n) {
                res += s1.slice(i, i + n);
                res += "\n";
                res += "|".repeat(n);
                res += "\n";
                res += s1.slice(i, i + n);
                res += "\n";
                i += n;
            }
            res += s1.slice(i, l);
            res += "\n";
            res += "|".repeat(l - i);
            res += "\n";
            res += s2.slice(i, l);
            return res;
        }

        class AlignmentResult {
            constructor(x, y, coords, alignment, score) {
                this.x = x;
                this.y = y;
                this.coords = coords;
                this.alignment = alignment;
                this.score = score;
            }
            as_strings(gap_char = "-") {
                let [x, y] = [Array.from(this.x).slice(this.coords[0]), Array.from(this.y).slice(this.coords[1])];
                let [aln1, aln2] = [[], []];
                for (const direction of this.alignment) {
                    if (direction === UP) {
                        aln1.push(x.shift());
                        aln2.push(gap_char);
                    } else if (direction === LEFT) {
                        aln1.push(gap_char);
                        aln2.push(y.shift());
                    } else {
                        aln1.push(x.shift());
                        aln2.push(y.shift());
                    }
                }
                return [aln1.join(""), aln2.join("")];
            }
            pretty_print(n = 80, gap_char = "-") {
                let [x, y] = this.as_strings(gap_char);
                let l = this.alignment.length;
                let i = 0;
                while (l > i + n) {
                    console.log(x.slice(i, i + n));
                    console.log("|".repeat(n));
                    console.log(y.slice(i, i + n));
                    i += n;
                }
                console.log(x.slice(i, l));
                console.log("|".repeat(l - i));
                console.log(y.slice(i, l));
            }
        }

        function max_and_index(arr) {
            let max = arr[0];
            let idx = 0;
            for (let i = i; i < arr.length; i++) {
                if (arr[i] > max) {
                    max = arr[i];
                    idx = i;
                }
            }
            return [max, idx];
        }

        function compute_max_score_and_direction(...scores) {
            let max_score = Math.max(...scores);
            return [max_score, scores.indexOf(max_score) + 1];
        }

        function match_fn_from_matrix(matrix) {
            return (a, b) => matrix[a][b];
        }

        function match_fn_from_match_mismatch(match, mismatch) {
            return (a, b) => (a === b ? match : mismatch);
        }

        const UP = 1;
        const LEFT = 2;
        const DIAG = 3;

        class Aligner {
            result;

            constructor(x, y, match_fn, gap_penalty) {
                this.x = x;
                this.y = y;
                this.n = x.length + 1;
                this.m = y.length + 1;
                this.match_fn = match_fn;
                this.gap_penalty = gap_penalty;
                this.result = new AlignmentResult(x, y, [0, 0], [], -Infinity);
            }
            global() {
                this.init_matrices(true);
                this.fill_matrices();
                this.result.score = this.S[this.x.length][this.y.length];
                this.traceback_global();
                return this.result;

            }
            semi_global() {
                this.init_matrices(false);
                this.fill_matrices();
                this.traceback_semiglobal();
                return this.result;
            }
            local() {
                this.init_matrices(false);
                this.fill_matrices(true);
                this.traceback_local();
                return this.result;
            }

            fill_matrices(local = false) {
                for (let i = 1; i < this.n; i++) {
                    for (let j = 1; j < this.m; j++) {
                        let up = this.S[i - 1][j] + this.gap_penalty;
                        let left = this.S[i][j - 1] + this.gap_penalty;
                        let diag = this.S[i - 1][j - 1] + this.match_fn(this.x[i - 1], this.y[j - 1]);
                        let [score, direction] = compute_max_score_and_direction(up, left, diag);
                        if (local === true) {
                            if (score < 0) {
                                [score, direction] = [0, 0];
                            }
                        }
                        [this.S[i][j], this.T[i][j]] = [score, direction];
                    }
                }
            }
            traceback(coords) {
                let res = [];
                let [i, j] = coords;
                while (true) {
                    let direction = this.T[i][j];
                    if (direction === UP) {
                        res.push(1);
                        i--;
                    } else if (direction === LEFT) {
                        res.push(2);
                        j--;
                    } else if (direction === DIAG) {
                        res.push(3);
                        i--;
                        j--;
                    } else break;
                }
                this.result.coords = [i, j];
                this.result.alignment = res.reverse();
            }

            traceback_global() {
                this.traceback([this.n - 1, this.m - 1]);
            }
            traceback_local() {
                let max = -Infinity;
                let coords = [0, 0];
                for (let i = 0; i < this.n; i++) {
                    for (let j = 0; j < this.m; j++) {
                        const n = this.S[i][j];
                        if (n > max) {
                            max = n;
                            coords = [i, j];
                        }
                    }
                }
                this.result.score = max;
                this.traceback(coords);
            }
            traceback_semiglobal() {

                let max = 0;
                let coords = [0, 0];

                for (let i = 0; i < this.n; i++) {
                    const n = this.S[i][this.m - 1];
                    if (n > max) {
                        max = n;
                        coords = [i, this.m - 1];
                    }
                }

                for (let j = 0; j < this.m; j++) {
                    const n = this.S[this.n - 1][j];
                    if (n > max) {
                        max = n;
                        coords = [this.n - 1, j];
                    }
                }

                this.result.score = max;

                let [i, j] = coords;
                let res = [];

                for (let a = 1; a < this.n - i; a++) {
                    res.push(1);
                }

                for (let b = 1; b < this.m - j; b++) {
                    res.push(2);
                }

                while (i !== 0 && j !== 0) {
                    let direction = this.T[i][j];
                    if (direction === UP) {
                        res.push(1);
                        i--;
                    } else if (direction === LEFT) {
                        res.push(2);
                        j--;
                    } else {
                        res.push(3);
                        i--;
                        j--;
                    }
                }

                for (let n = 0; n < i; n++) {
                    res.push(1);
                }

                for (let m = 0; m < j; m++) {
                    res.push(2);
                }
                this.result.alignment = res;
            }

            init_matrices(global = true) {
                this.S = Array.from({ length: this.n }, () => Array(this.m).fill(0));
                this.T = Array.from({ length: this.n }, () => Array(this.m).fill(0));
                if (global === false) {
                    return;
                }
                for (let j = 1; j < this.m; j++) {
                    this.S[0][j] = this.S[0][j - 1] + this.gap_penalty;
                    this.T[0][j] = LEFT;
                }
                for (let i = 1; i < this.n; i++) {
                    this.S[i][0] = this.S[i - 1][0] + this.gap_penalty;
                    this.T[i][0] = UP;
                }
            }
        }
        resolve({Aligner, AlignmentResult})
    });
}
