function () {

    // IS THIS A REQUEST, OR IS IT A FORMULA?
    //
    // One answer, shared by every command field that has to choose. It began inside the
    // project panel and a second field now needs it; a copy would have been the start of the
    // two drifting, and the drift would be invisible -- a field that routes a sentence the
    // other way does nothing at all, which looks exactly like a key that was not pressed.
    //
    // THE TEST IS DELIBERATELY LOPSIDED. A formula is something people have saved, pasted
    // and typed from memory for years, and sending one to a language model instead would be
    // a regression however good the guess. Formula syntax wins outright; only text with no
    // formula punctuation at all and at least three plain words is treated as a sentence.

    const looksLikeASentence = (str) => {
        let t = ('' + (str || '')).trim();
        if (t.length < 8) return false;

        // AN "=" IN FRONT OF A SENTENCE DOES NOT MAKE IT A FORMULA. "=sum the cells above"
        // was handed to the formula engine because of its first character, written into the
        // cell exactly as typed, and the cell went red. The "=" there means "I want a
        // formula", and the words say which one. So the "=" is set aside and what follows
        // is held to the same lopsided test as anything else: one bracket, colon-joined
        // range or second "=" and it is a formula again, as =mean(A1:A12) always was.
        if (/^=/.test(t)) {
            t = t.replace(/^=\s*/, '');
            // Arithmetic is not prose, whatever is on either side of it.
            if (/[+*/^<>]|\d/.test(t)) return false;
        }

        // Brackets, parentheses, pipes, equals and semicolons belong to the formula language
        // and to almost nothing anybody types as a request.
        if (/[\[\]()|=;]/.test(t)) return false;

        // A COLON IS NOT PROOF OF A FORMULA, and treating it as proof was a real bug:
        // "first col: price, cog, pn" is how people write a list, and every sentence of that
        // shape was silently handed to the formula engine. What makes a colon formula-ish is
        // being tight against what it joins, as a range is written: A1:H12. A colon with a
        // space after it, or ending a word before a list, is punctuation.
        if (/\S:\S/.test(t)) return false;

        // Trailing punctuation does not stop a word being a word: in "price, cog and pn" two
        // of the three would otherwise not count, and a short list would fall under the
        // three-word floor and be sent to the formula engine for a second reason.
        const words = t.split(/\s+/)
            .map((w) => w.replace(/^[^A-Za-z]+/, '').replace(/[^A-Za-z'\u2019-]+$/, ''))
            .filter((w) => /^[A-Za-z][A-Za-z'\u2019-]*$/.test(w));
        return words.length >= 3;
    };

    return { looksLikeASentence: looksLikeASentence };
}
