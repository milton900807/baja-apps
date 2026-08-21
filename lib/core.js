const host = window["env"]["apiUrl"];
environment = {
    ionworks_publish_bucket: "ionworks",
    save_file_to_s3: host + "/files/s3putdata",
    s3get: host + "/files/s3getjson?bucket={bucket}&path={path}",
    get_helm_rule: host + "/get-script",
    load_script_for_category: host + "/get-package",
    save_script: host + "/save-script",
    delete_script: host + "/lionrest/delete",
    s3load_js: host + "/files/s3download",
    s3savejs: host + "/files/s3upload",
    commit_code: host + "/commit",
    stash_code: host + "/stash-file",
    revert_code: host + "/revert-file"
};

function uniqueInt() {
    const timestamp = Date.now().toString(36);
    const randomComponent = Math.random().toString(36).substring(2, 8);
    const uniqueID = timestamp + randomComponent;
    return uniqueID;
}

function jsonToNameValue(data, indent = 0) {
    const pad = "  ".repeat(indent);
    const lines = [];

    function formatValue(key, value, level) {
        const currentPad = "  ".repeat(level);

        if (Array.isArray(value)) {
            if (value.length === 0) {
                lines.push(`${currentPad}${key}:`);
                lines.push(`${currentPad}  (empty)`);
                return;
            }

            lines.push(`${currentPad}${key}:`);
            value.forEach((item, index) => {
                if (typeof item === "object" && item !== null) {
                    lines.push(`${currentPad}  - item ${index + 1}:`);
                    Object.entries(item).forEach(([k, v]) => {
                        formatValue(k, v, level + 2);
                    });
                } else {
                    lines.push(`${currentPad}  - ${item}`);
                }
            });
            return;
        }

        if (typeof value === "object" && value !== null) {
            lines.push(`${currentPad}${key}:`);
            for (const [k, v] of Object.entries(value)) {
                formatValue(k, v, level + 1);
            }
            return;
        }

        lines.push(`${currentPad}${key}: ${value}`);
    }

    if (Array.isArray(data)) {
        data.forEach((item, index) => {
            lines.push(`${pad}item ${index + 1}:`);
            for (const [key, value] of Object.entries(item)) {
                formatValue(key, value, indent + 1);
            }
        });
    } else if (typeof data === "object" && data !== null) {
        for (const [key, value] of Object.entries(data)) {
            formatValue(key, value, indent);
        }
    } else {
        return String(data);
    }

    return lines.join("\n");
}

function dateToString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
const LIB = function (path, name) {
    return new Promise(async (resolve, reject) => {
        let fun = await GETFUNCTION(path, name);
        fun = LOADLIBS(fun.toString());
        consol.log('lion-engine')
        resolve(fun(lion_engine, LIB, log));
    })
}
function polymerSyntaxToHelm(input, polymerName = "RNA1", opts = {}) {
    const source = String(input ?? "").trim();
    if (!source) {
        throw new Error("Input is empty.");
    }

    // Library-specific residue rendering.
    // These should match the exact HELM style you want to emit.
    const residueMap = {
        r: (base) => `r(${base})`,
        ribo: (base) => `r(${base})`,
        d: (base) => `d(${base})`,
        deoxy: (base) => `d(${base})`,
        moe: (base) => `[moe](${base})`,
        ome: (base) => `[mR](${base})`,
        mr: (base) => `[mR](${base})`,
        lna: (base) => `[lna](${base})`,
        ...(opts.residueMap || {}),
    };

    const linkerMap = {
        p: "p",
        sp: "[sp]",
        ps: "[sp]",
        ...(opts.linkerMap || {}),
    };

    const normalizeBase = (base) => {
        const b = String(base).trim().toUpperCase();
        if (!/^[ACGTU]$/.test(b)) {
            throw new Error(`Unsupported base: ${base}`);
        }
        return b;
    };

    const renderResidue = (sugar, base) => {
        const key = String(sugar).trim().toLowerCase();
        const renderer = residueMap[key];
        if (!renderer) {
            throw new Error(`Unsupported sugar/residue type: ${sugar}`);
        }

        const baseNorm = normalizeBase(base);

        if (typeof renderer === "function") {
            return renderer(baseNorm);
        }

        if (typeof renderer === "string") {
            return `${renderer}(${baseNorm})`;
        }

        throw new Error(`Invalid residue renderer for sugar: ${sugar}`);
    };

    const normalizeLinker = (linker) => {
        if (!linker) return "";
        const key = String(linker).trim().toLowerCase();
        const mapped = linkerMap[key];
        if (!mapped) {
            throw new Error(`Unsupported linker monomer: ${linker}`);
        }
        return mapped;
    };

    // 1) Already full HELM with $$$$
    const fullHelmPattern = /^[A-Za-z][A-Za-z0-9_]*\{.*\}\${4}(?:V2\.0)?$/s;
    if (fullHelmPattern.test(source)) {
        if (/V2\.0$/.test(source)) {
            return source;
        }
        return `${source}V2.0`;
    }

    // 2) HELM-like without $$$$
    const bareHelmPattern = /^[A-Za-z][A-Za-z0-9_]*\{.*\}$/s;
    if (bareHelmPattern.test(source)) {
        return `${source}$$$$V2.0`;
    }

    // 3) Repeat syntax: [monomer]{count}
    // Example: [moe(A)]{3}
    // Note this is raw monomer repetition and does not reinterpret chemistry.
    const repeatPattern = /\[([^[\]]+)\]\{(\d+)\}/g;
    const repeatedMonomers = [];
    let repeatMatch;

    while ((repeatMatch = repeatPattern.exec(source)) !== null) {
        const rawMonomer = repeatMatch[1].trim();
        const count = Number(repeatMatch[2]);

        for (let i = 0; i < count; i++) {
            repeatedMonomers.push(`[${rawMonomer}]`);
        }
    }

    if (repeatedMonomers.length > 0) {
        return `${polymerName}{${repeatedMonomers.join(".")}}$$$$V2.0`;
    }

    // 4) Dotted oligo syntax:
    //    moe(A)sp.moe(C)p.d(T)sp...
    //
    // Converts to:
    //    [moe](A)[sp].[moe](C)p.d(T)[sp]...
    //
    // Token form:
    //    <sugar>(<base>)<optional_linker>
    //
    // Examples:
    //    moe(A)sp
    //    d(T)
    //    d(G)ps
    //    r(U)p
    const parts = source.split(".").map((s) => s.trim()).filter(Boolean);

    if (parts.length > 0) {
        const helmTokens = parts.map((part) => {
            const m = /^([A-Za-z0-9_]+)\(([A-Za-z])\)([A-Za-z0-9_]*)?$/.exec(part);
            if (!m) {
                throw new Error(`Unrecognized oligo token: ${part}`);
            }

            const [, sugarRaw, baseRaw, linkerRaw = ""] = m;
            const residueHelm = renderResidue(sugarRaw, baseRaw);
            const linkerHelm = normalizeLinker(linkerRaw);

            return `${residueHelm}${linkerHelm}`;
        });

        return `${polymerName}{${helmTokens.join(".")}}$$$$V2.0`;
    }

    throw new Error(
        "Input is not recognized as HELM, [monomer]{count}, or dotted oligo syntax."
    );
}
async function verifyUserPath(path, app, position) {
    var resolvedPath = path;
    if (!position) {
        position = 'all'
    }
    if (!window.env || window.env.auth !== 'b2c') {
        return {
            allowed: true,
            path: resolvedPath
        };
    }
    var payload = {
        email: getUser(),
        app: app,
        position: position
    };

    var host = window.env.apiUrl;
    var rs;

    try {
        rs = await POSTJSON(payload, host + '/verify-user');
    } catch (e) {
        console.error('verifyUserPath: error calling /verify-user', e);
        return {
            allowed: false,
            path: resolvedPath,
            reason: 'Unable to verify license status (network or server error).',
            error: e
        };
    }

    var licenseStatus = rs && rs.licenseStatus;
    var coreStatus = rs && rs.coreStatus;
    var reason = rs && rs.reason;

    if (licenseStatus !== 'granted') {
        console.warn('verifyUserPath: access denied', {
            licenseStatus: licenseStatus,
            coreStatus: coreStatus,
            reason: reason
        });

        return {
            allowed: false,
            path: resolvedPath,
            coreStatus: coreStatus,
            licenseStatus: licenseStatus,
            reason: reason || 'You do not have a valid license for this application or position.',
            raw: rs
        };
    }

    if (rs && rs.tempFiles && Array.isArray(rs.tempFiles)) {
        var currentState = rs.tempFiles.find(function (file) {
            return typeof file === 'string' && file.endsWith('bajabio');
        });

        if (currentState) {
            resolvedPath = getPathAfterTemp(currentState);
        }
    }

    return {
        allowed: true,
        path: resolvedPath,
        coreStatus: coreStatus,
        licenseStatus: licenseStatus,
        reason: reason,
        raw: rs
    };
}

let pasteObjectMode = false;
function getMonthName(index) {
    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    if (index < 0 || index > 11) {
        throw new Error("Index must be between 0 and 11");
    }

    return months[index];
}

function sanitizeName(name) {
    if (!name) {
        return '';
    }

    name = name.trim();

    name = name.replace(/\s+/g, '');

    name = name.replace(/[^a-zA-Z0-9_]/g, '_');

    return name;
}

const saveO = function (path, name, type, rule, input, callback) {
    return lion_engine.save(path, name, type, rule, input, callback);
}

const findDuplicates = (arr) => {
    const duplicates = {};
    const result = [];
    arr.forEach((item) => {
        if (duplicates[item]) {
            if (duplicates[item] === 1) {
                result.push(item);
            }
            duplicates[item]++;
        } else {
            duplicates[item] = 1;
        }
    });

    return result;
}

const LOADLIB = function (path) {
    return new Promise(async (resolve, reject) => {
        let r = await GETFUNCTION(path);
        r = r.toString();
        let st = r.indexOf('{');
        let ed = r.lastIndexOf('}');
        let temp = r.substring(st + 1, ed);
        temp = temp.trim();
        if (!temp.startsWith('export')) {
            temp = 'export ' + temp;
        }
        console.log(' function : ' + temp)
        let prefixMethods = 'const LOADLIB = ' + LOADLIB.toString();
        prefixMethods += '\nvar GETFUNCTION = ' + GETFUNCTION.toString();
        var b64moduleData = "data:text/javascript;base64," + btoa(prefixMethods + '\n' + temp);
        const module = await import(b64moduleData);
        resolve(module);
    })
}

const require = async (lib) => {
    if (lib === 'ocr')
        return await lion_engine.require(lib)
    else
        return await lion_engine.require('Chart')
}

const isModal = () => {
    return lion_engine.isModal();
}

const isMobile = () => {

    if (navigator.userAgent.match(/Android/i)
        || navigator.userAgent.match(/webOS/i)
        || navigator.userAgent.match(/iPhone/i)
        || navigator.userAgent.match(/iPad/i)
        || navigator.userAgent.match(/iPod/i)
        || navigator.userAgent.match(/BlackBerry/i)
        || navigator.userAgent.match(/Windows Phone/i)) {
        return true;
    } else {
        return false;
    }

}

const signup = () => {
    lion_engine.signUp();
}
const login = () => {
    lion_engine.login();
}
const logout = () => {
    lion_engine.logout();
}

const publicUser900807 = () => {
    lion_engine.public900807()
}

const LOADLIBS = function (functionObj) {
    let script = functionObj.toString();
    let a = script.indexOf('{')
    let b = script.lastIndexOf('}')
    let nscript = script.substring(a + 1, b);
    return new Function('lion_engine', 'LIB', 'log', nscript);
}

const GETFUNCTION = function (path, name) {
    return lion_engine.GETFUNCTION(path, name);
}

const CREATEFUNCTION = function createFunction(src) {
    return lion_engine.createIonfunctionFromSrc(src);
}

const func = function (path) {
    let index = path.indexOf('/');
    if (index > 0) {
        let cat = path.substring(0, index);
        let key = path.substring(index + 1);
        return lion_engine.GETFUNCTION(cat.trim(), key.trim());
    } else {
        log(' Failed to find the function for path : ' + path);
    }
}

const PUTJSON = function (jsonobject, url) {
    return lion_engine.PUTJSON(jsonobject, url);
}

const GETJSON = function (url, header) {
    return lion_engine.GETJSON(url, header);
}

const voiceToText = (listen) => {
    return lion_engine.voiceToText(listen);
}
async function uploadLargeFile(file, user, type, chunkSize = 5 * 1024 * 1024) {
    const totalChunks = Math.ceil(file.size / chunkSize);
    const fileId = `${file.name}-${Date.now()}`;
    let uploadedChunks = 0;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append("file", chunk, file.name);
        formData.append("user", user);
        formData.append("type", type);
        formData.append("chunkIndex", chunkIndex);
        formData.append("totalChunks", totalChunks);
        formData.append("fileId", fileId);

        try {
            const response = await fetch("/upload", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                console.error(`Error uploading chunk ${chunkIndex}`);
                return false;
            }

            uploadedChunks++;
            console.log(`Uploaded chunk ${chunkIndex + 1}/${totalChunks}`);
        } catch (error) {
            console.error("Upload failed:", error);
            return false;
        }
    }

    console.log("Upload complete!");
    return true;
}

const GETXT = function (url) {
    return new Promise((resolve, reject) => {
        var xhr = new XMLHttpRequest();
        xhr.ontimeout = function () { alert(" Timed out"); }
        xhr.open("GET", url, true);
        xhr.responseType = 'text/plain; charset=UTF-8';
        xhr.onload = function () {
            var status = xhr.status;
            if (status == 200) {
                resolve(xhr.response);
            } else {
                console.log(" rejecting !" + status);
                reject(status);
            }
        };
        xhr.send();
    })
}

const GETFILE = function (url) {
    return new Promise((resolve, reject) => {
        var xhr = new XMLHttpRequest();
        xhr.ontimeout = function () { alert("Genome Timed out"); }
        xhr.open("GET", url, true);
        xhr.responseType = 'blob';
        xhr.onload = function () {
            var status = xhr.status;
            if (status == 200) {
                resolve(xhr.response);
            } else {
                console.log(" rejecting !" + status);
                reject(status);
            }
        };
        xhr.send();
    })
}
const getJSON = GETJSON;
function pause(milliseconds) {
    var dt = new Date();
    while ((new Date()) - dt <= milliseconds) { }
}

let status = class status {
    static check(val) {
        return lion_engine.getStatus(val);
    }
    static waitFor(val, value, timeout_in_seconds) {
        if (!timeout_in_seconds) {
            timeout_in_seconds = 120;
        }
        return lion_engine.waitFor(val, value, timeout_in_seconds);
    }
}

function docx(experiment_id, title, summary, author) {
    return lion_engine.generate_document(experiment_id, title, summary, author)
}

function writeExperiment(experiment_id, experObj) {
    return lion_engine.generateDocument(experiment_id, experObj)
}

let request = obj => {
    return new Promise((resolve, reject) => {

        let path = obj.path;
        if (path.startsWith('/')) {
            path = path.substring(1);
        }
        let ind = path.indexOf('/');
        let bucket = path.substring(0, ind);
        path = path.substring(ind + 1);
        let url = obj.url;
        url = url.replace("{bucket}", bucket);
        url = url.replace("{path}", path);

        console.log(' url ' + url);

        let xhr = new XMLHttpRequest();
        xhr.open(obj.method || "GET", url);
        if (obj.headers) {
            Object.keys(obj.headers).forEach(key => {
                xhr.setRequestHeader(key, obj.headers[key]);
            });
        }
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
            } else {
                reject(xhr.statusText);
            }
        };
        xhr.onerror = () => reject(xhr.statusText);
        xhr.send(obj.body);
    });
};

function toRows(data) {
    let rows = data.split("\n");
    return rows;
}
function processCommands(commands) {
    const result = [];
    let currentPrefix = null;

    for (let i = 0; i < commands.length; i++) {
        const line = commands[i];
        const match = line.match(/^(\w+)\./);

        if (match) {
            const prefix = match[1];

            if (prefix !== currentPrefix) {

                currentPrefix = prefix;
                result.push(`${prefix}:`);
            }

            result.push(line.replace(`${prefix}.`, ''));
        } else {

            result.push(line);
        }
    }

    return result;
}
function processCommandsWithPrefix(commands, prefix) {
    const result = [];
    let hasInsertedPrefixLine = false;

    for (let i = 0; i < commands.length; i++) {
        const line = commands[i];

        if (line.startsWith(`${prefix}.`)) {
            if (!hasInsertedPrefixLine) {

                result.push(`${prefix}:`);
                hasInsertedPrefixLine = true;
            }

            result.push(line.replace(`${prefix}.`, ''));
        }
    }

    return result;
}

const nautilus__ = [
    "nautilus", "shell", "ocean", "marine", "spiral", "cephalopod", "chambered",
    "mollusk", "aquatic", "tentacles", "depths", "sea", "coral", "reef", "kelp",
    "current", "squid", "octopus", "crustacean", "ammonite", "bioluminescent",
    "abyss", "gills", "fins", "submarine", "triton", "anemone", "cuttlefish",
    "hydrothermal", "vent", "plankton", "seabed", "underwater", "algae", "whirlpool",
    "ecosystem", "kraken", "seafloor", "cirripede", "gastropod", "barnacle", "aquarium",
    "brine", "clams", "pearls", "island", "lagoon", "atoll", "archipelago", "trench",
    "whale", "dolphin", "shark", "anglerfish", "eel", "urchin", "starfish", "jellyfish",
    "seahorse", "crab", "lobster", "hydra", "mantis", "nudibranch", "polyps", "coralline",
    "sediment", "currents", "waves", "tides", "mariner", "voyage", "helm", "keel",
    "anchors", "harbor", "buoy", "scuba", "diver", "shipwreck", "pirate", "treasure",
    "expedition", "nautical", "seafarer", "navigation", "sonar", "explorer", "pressure",
    "depth", "bathysphere", "abyssopelagic", "mesopelagic", "hadal", "biome",
    "sedimentation", "pelagic", "echinoderm", "cnidarian", "nekton", "benthic",
    "seaweed", "orca", "plume", "barnacles", "seamount", "dorsal", "midnight",
    "abyssal", "hydrosphere", "nautiloid", "estuary", "marsh", "saltwater", "brackish",
    "parrotfish", "crinoid", "blenny", "moray", "sponge", "tuna", "snapper", "wrasse",
    "halibut", "cormorant", "puffin", "kelpforest", "mangrove", "oyster", "seafoam",
    "bluewhale", "narwhal", "clownfish", "angler", "seagull", "seaotter", "blowhole",
    "sealion", "finback", "hammerhead", "gulper", "ship", "kelpbed", "coralreef",
    "seaarch", "goby", "wahoo", "stingray", "cavern", "turtle", "mudskipper", "waterspout",
    "flounder", "cod", "wavecrest", "typhoon", "whitetip", "fathom", "deepsea", "remora",
    "salmon", "kelppark", "porpoise", "abyssalplain", "diatom", "jagged", "mackerel",
    "nauticalmile", "surf", "overhang", "reefedge", "tidalpool", "seaurchin", "krill",
    "laminar", "mudflat", "urchinspire", "nocturnal", "sting", "neptune", "oarfish"
];
function generateNautName(wordSet, wordCount = 2) {
    if (!wordSet) {
        wordSet = nautilus__;
    }
    if (!Array.isArray(wordSet) || wordSet.length === 0) {
        throw new Error("Word set must be a non-empty array.");
    }

    const uniqueWords = new Set();
    while (uniqueWords.size < wordCount) {
        const randomIndex = Math.floor(Math.random() * wordSet.length);
        uniqueWords.add(wordSet[randomIndex]);
    }

    return Array.from(uniqueWords).join('');
}

function isObjectNotVisible(ctx, xscreen_min_, xscreen_max, yscreen_min_, yscreen_max) {

    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    if (xscreen_min_ < 0 && xscreen_max > canvasWidth) {
        return false;
    }
    if (xscreen_max < 0 && xscreen_min_ > canvasWidth) {
        return false;
    }

    if (yscreen_min_ < 0 && yscreen_max > canvasHeight) {
        return false;
    }

    const isOutsideHorizontal = (xscreen_max < -1000 && xscreen_min_ < -1000) || (xscreen_min_ > canvasWidth + 1000 && xscreen_max > canvasWidth + 1000);
    const isOutsideVertical = (yscreen_max < -1000 && yscreen_min_ < -1000) || (yscreen_min_ > canvasHeight + 1000 && yscreen_max > canvasHeight + 1000);
    return isOutsideHorizontal || isOutsideVertical;
}
function uniqueString(baseString, stringArray) {
    let uniqueString = baseString;
    let counter = 1;

    while (stringArray.includes(uniqueString)) {
        uniqueString = `${baseString}${counter}`;
        counter++;
    }

    return uniqueString;
}

let LJScript = class LJScript {
    static add(scope, comp) {
        lion_engine.addEventCommand(scope, comp)
    }
    static getEvents() {
        return processCommands(lion_engine.getEventCommands());
    }

    static getEventsByScope(scope) {
        let cmds = lion_engine.getEventCommands();
        return processCommandsWithPrefix(cmds, scope)
    }

    static reset() {
        lion_engine.resetEventCommands();
    }
};

let CurrentLayout = class CurrentLayout {

    static setComponent(label, compObj) {
        lion_engine.setComponent(label, compObj);
    }
    static addComponent(label, compObj) {
        lion_engine.addComponent(label, compObj);
    }
    static clearComponent(label) {
        lion_engine.clearComponent(label);
    }
    static getComponent(label, index) {
        return lion_engine.getComponent(label, index);
    }
    static stash(name, comp) {
        lion_engine.setStashed(name, comp)
    }
    static getStashed(name) {
        let comp = lion_engine.getStashed(name)
        return comp;
    }

    static reset(name) {

        mouse_down = false;
        let comp = lion_engine.getStashed(name)
        if (!comp) {
            console.log(" Error : failed to get the stashed comonent")
            return;
        }
        CurrentLayout.setComponent(name, comp)
        setTimeout(() => {

        }, 100)
    }

};

function dropAndOpenFile(title) {
    return lion_engine.getDropFile(title, "open");
}

function dropFile(title) {
    return lion_engine.getDropFile(title, "not_open");
}

function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    })
}

function showFile(file) {

}
function clear() {
    lion_engine.clearLog();
}
function clearWeak() {
    lion_engine.clearWeak();
}
function removeComponent(index) {
    lion_engine.removeComponent(index);
}

function getComponentCount() {
    return lion_engine.getComponentCount();
}

function cacheOff() {
    lion_engine.cacheOff();
}
function cacheOn() {
    lion_engine.cacheON();
}

function clearLog() {
    lion_engine.clearLog();
}
function clearCache() {
    lion_engine.resetLog();
}

function log(line) {
    lion_engine.log(line);
}

function logBlock(id, title) {
    if (title == null || title.length <= 0) {
        title = '';
    }
    let js = {
        "wid": 'logblock',
        "id": id,
        "title": title
    }
    return lion_engine.showWidget(js);
}

function plotly(title, data) {
    if (title == null || title.length <= 0) {
        title = '';

        let js = {
            "wid": 'plot',
            "title": title,
            "data": data
        }
        return lion_engine.showWidget(js);
    }
}

function downloadCSV(content, filename) {
    let blob = new Blob([content], { type: 'text/csv' });
    let link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadCSVButton(title, data) {
    if (title == null || title.length <= 0) {
        title = '';
    }
    let js = {
        "wid": 'download-csv',
        "title": title,
        "data": data
    }
    return lion_engine.showWidget(js);
}

let getPathAfterTemp = (fullPath) => {
    const tempMarker = '.temp/';
    const index = fullPath.indexOf(tempMarker);

    if (index === -1) {
        return null;
    }
    return fullPath.substring(index + tempMarker.length);
}

function getCookie(name) {

    const encodedName = encodeURIComponent(name) + "=";
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');

    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];

        while (c.charAt(0) === ' ') {
            c = c.substring(1);
        }

        if (c.indexOf(encodedName) === 0) {
            const value = c.substring(encodedName.length, c.length);

            return JSON.parse(value);
        }
    }

    return null;
}

const sharedObjectListeners = {};
const datayaklistener = (data) => {
    for (let sl of Object.keys(sharedObjectListeners)) {
        sharedObjectListeners[sl](data)
    }
}

function setCookie(name, jsonConfig, daysToExpire) {
    const expiryDate = new Date();
    expiryDate.setTime(expiryDate.getTime() + (daysToExpire * 24 * 60 * 60 * 1000));
    const expires = "expires=" + expiryDate.toUTCString();
    const jsonConfigString = JSON.stringify(jsonConfig);
    const encodedJsonConfigString = encodeURIComponent(jsonConfigString);
    document.cookie = name + "=" + encodedJsonConfigString + ";" + expires + ";path=/";
}

function updateProgress(line) {
    lion_engine.updateProgress(line);
}

function results(guid) {
    return lion_engine.getResults(guid);
}

function toString(fileob) {
    let lines = fileob.lines;
    t = '';
    for (let l of lines) {
        t += l + '\n';
    }
    return t;
}

let IonEngine = class IonEngine {
    static run(path, rule_name, input) {
        return lion_engine.run(path, rule_name, input);
    }
    static getRule(path, rule_name) {
        return lion_engine.getRule(path, rule_name);
    }
}

async function sleep(msec) {
    return new Promise(resolve => setTimeout(resolve, msec));
}

function convertToTSV(jsonData) {
    const separator = '\t';
    const keys = Object.keys(jsonData[0]);

    const header = keys.join(separator) + '\n';
    const rows = jsonData.map(item => {
        return keys.map(key => item[key]).join(separator);
    }).join('\n');

    return rows;
}
function downloadAsTsv(object, file_name, separator) {
    let csvobject = convertToTSV(object);
    const blob = new Blob([csvobject], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = file_name;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
function convertToCSV(jsonData) {
    const separator = ',';
    const keys = Object.keys(jsonData[0]);

    const header = keys.join(separator) + '\n';
    const rows = jsonData.map(item => {
        return keys.map(key => item[key]).join(separator);
    }).join('\n');

    return header + rows;
}
function downloadAsCsv(object, file_name, separator) {
    let csvobject = convertToCSV(object);
    const blob = new Blob([csvobject], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = file_name;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
function downloadAsText(text, file_name) {
    var blob = new Blob([text], { type: 'text/plain' });

    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file_name;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

}

function showInputTextArea(title) {
    return lion_engine.showInputTextArea(title);
}
function showMenu(obj) {
    return lion_engine.showMenu(obj);
}
function clearMenu() {
    return lion_engine.clearMenu();
}
function showFooter(obj) {
    return lion_engine.showFooter(obj);
}
function showNavbar(obj) {
    return lion_engine.showNavbar(obj);
}
function showWidget(obj) {
    return lion_engine.showWidget(obj);
}
function showHTML(html) {
    return new Promise((resolve, reject) => {
        let zoom_to = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
                cards: [
                    [
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: `${html}`
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                hideAllModal();
                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]]
            }
        }
        showModal(zoom_to)
        resolve();
    })
}

function showList(list) {
    return new Promise((resolve, reject) => {

        let object_list = []
        let lkeys = Object.keys(list);
        for (let l of lkeys) {
            object_list.push({
                name: l,
                IonFunction: createIonFunction(list[l])
            })
        }
        let zoom_to = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
                cards: [
                    [
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'data-links',
                                data: object_list
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                hideAllModal();
                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]]
            }
        }
        showModal(zoom_to)
        resolve();
    })
}

function LOADPDF(url, path, user, key) {
    return lion_engine.LOADPDF(url, path, user, key)
}


promptVisible = false


function prompt(txt, inputs, default_values, width, height) {
    return new Promise((resolve, reject) => {
        let panel;
        const __nameHook = createIonFunction((hook) => {
            panel = hook;
        });

        let zoom_to = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                cards: [[
                    {
                        title: '',
                        width: '100%',
                        component: {
                            wid: 'html',
                            data: `${txt}`
                        }
                    }
                    ], [
                    {
                        title: ' ',
                        body: '',
                        width: '90%',
                        component: {
                            wid: 'input-param-items',
                            refCallback: __nameHook,
                            data: {
                                input_labels: inputs,
                                default_values: default_values
                            }
                        }
                    }
                    ], [
                    {
                        width: '100%',
                        component: {
                            wid: 'mt-button',
                            data: {
                                buttons: [
                                    {
                                        label: 'OK',
                                        ionFunction: createIonFunction(() => {
                                            let results = {};
                                            for (let inp of inputs) {
                                                if (inp === 'Name') {
                                                    let raw = panel.get(inp);
                                                    let clean = raw
                                                        .replace(/-/g, '_')
                                                        .replace(/\s+/g, '')
                                                        .replace(/[^a-zA-Z0-9_]/g, '');
                                                    results[inp] = clean;
                                                } else {
                                                    let raw = panel.get(inp);
                                                    if (typeof raw === 'string')
                                                        results[inp] = raw.trim();
                                                    else
                                                        results[inp] = raw
                                                }
                                            }
                                            promptVisible = false;
                                            resolve(results);
                                            hideAllModal();
                                        })
                                    },
                                    {
                                        label: 'Cancel',
                                        ionFunction: createIonFunction(() => {
                                            resolve()
                                            promptVisible = false;
                                            hideAllModal();
                                        })
                                    }
                                ]
                            }
                        }
                    }
                ]]
            }
        };

        if (!width) width = 500;
        if (!height) height = 800;

        showModal(zoom_to, width, height);
    });
}

function infoPrompt(txt, width, height) {
    hideAllModal();
    if (!width) {
        width = 400;
    }
    if (!height) {
        height = 160;
    }
    return new Promise((resolve, reject) => {
        let panel;
        const __nameHook = createIonFunction((hook) => {
            panel = hook;
        })
        let zoom_to = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                cards: [
                    [
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: `${txt}`
                            }
                        },
                        {
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                hideAllModal();
                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]]
            }
        }

        const maxWidth = window.innerWidth * 0.95;
        const maxHeight = window.innerHeight * 0.95;

        const modalWidth = Math.min(width, maxWidth);
        const modalHeight = Math.min(height, maxHeight);

        showModal(zoom_to, modalWidth, modalHeight);
        resolve();
    })

}

function inforPrompt(txt, width, height) {
    infoPrompt(txt, width, height)
}

function are_you_sure(listenerfunction) {
    let zoom_to = {
        wid: 'card',
        componentRef: 'bottomPanel',
        data: {
            height: '800px',
            cards: [
                [
                    {
                        'title': ' ', 'body': ``
                        ,
                        'width': '90%',
                        'component':
                        {
                            wid: 'html',
                            data: '<font color=red> Are you sure you want to remove all compounds? </font>'
                        }
                    },
                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Yes', ionFunction: createIonFunction(() => {
                                            listenerfunction(true)
                                            hideAllModal();
                                        })
                                    },
                                    {
                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                            listenerfunction(false)
                                            hideAllModal();
                                        })
                                    }
                                ]
                            }
                        }
                    }
                ]]
        }
    }
    showModal(zoom_to)
}

function json(jsonobj) {

    showModal({
        wid: 'json',
        data: JSON.stringify(jsonobj)
    })
}

function flattenJson(jsonObj, parentKey = '', sep = '.') {
    let items = {};
    for (const [k, v] of Object.entries(jsonObj)) {
        const newKey = parentKey ? `${parentKey}${sep}${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            Object.assign(items, flattenJson(v, newKey, sep));
        } else if (Array.isArray(v)) {
            v.forEach((item, i) => {
                Object.assign(items, flattenJson({ [`${newKey}[${i}]`]: item }, '', sep));
            });
        } else {
            items[newKey] = v;
        }
    }
    return items;
}

function unflattenJson(flatDict, sep = '.') {
    let nestedJson = {};
    for (const [k, v] of Object.entries(flatDict)) {
        const keys = k.split(sep);
        let d = nestedJson;
        keys.forEach((key, i) => {
            if (key.includes('[')) {
                const [baseKey, index] = key.slice(0, -1).split('[');
                d = d[baseKey] = d[baseKey] || [];
                while (d.length <= parseInt(index)) {
                    d.push({});
                }
                d = d[parseInt(index)];
            } else {
                if (i === keys.length - 1) {
                    d[key] = v;
                } else {
                    d = d[key] = d[key] || {};
                }
            }
        });
    }
    return nestedJson;
}
function formatForEditing(flatJson) {
    return Object.entries(flatJson)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
}

function formatFloats(jsonObj, decimals = 4) {
    const flatJson = flattenJson(jsonObj);
    for (const [key, value] of Object.entries(flatJson)) {
        if (typeof value === 'number' && !Number.isInteger(value)) {
            flatJson[key] = parseFloat(value.toFixed(decimals));
        }
    }
    return unflattenJson(flatJson);
}

function parseEditedFormat(editedText, sep = '.') {
    const flatJson = {};
    const lines = editedText.split('\n');
    for (const line of lines) {
        const [key, ...value] = line.split('=');
        flatJson[key] = value.join(' ');

        if (!isNaN(flatJson[key])) {
            flatJson[key] = parseFloat(flatJson[key]);
        } else {
            flatJson[key] = '' + flatJson[key];
        }
    }
    return unflattenJson(flatJson, sep);
}

function splitByDigitsAndAlpha(inputString) {
    inputString = inputString.trim();

    const regex = /(\d+)/gi;

    const result = inputString.split(regex);

    const filteredResult = result.filter(item => item !== "");

    let r = []
    for (let f of filteredResult) {
        if (f.startsWith('0')) {
            f = f.substring(1);
        }
        if (!isNumericString(f))
            f = +f;
        r.push(f)
    }
    return r;
}
function getHexColor(color) {
    if (!color || typeof color !== 'object') {
        throw new Error("Color must be an object with r, g, and b properties.");
    }

    const { r, g, b } = color;

    if (r == null || g == null || b == null || isNaN(r) || isNaN(g) || isNaN(b)) {
        throw new Error("Invalid color object. Must contain numeric r, g, and b properties.");
    }

    const toHex = (c) => {
        const hex = Math.max(0, Math.min(255, c)).toString(16);
        return hex.length == 1 ? "0" + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getContrastColor(inputColor, context) {

    function toRGB(color) {

        context.fillStyle = color;
        const rgb = context.fillStyle;

        if (/^#[0-9A-F]{6}$/i.test(rgb)) {
            const bigint = parseInt(rgb.slice(1), 16);
            return {
                r: (bigint >> 16) & 255,
                g: (bigint >> 8) & 255,
                b: bigint & 255
            };
        } else if (rgb.startsWith("rgb")) {
            const match = rgb.match(/\d+/g);
            return { r: parseInt(match[0]), g: parseInt(match[1]), b: parseInt(match[2]) };
        } else {
            throw new Error("Invalid color format");
        }
    }

    try {
        const { r, g, b } = toRGB(inputColor);

        const luminance = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);

        return luminance > 0.5 ? '#000000' : '#FFFFFF';
    } catch (error) {
        console.error("Error processing color:", error);
        return '#000000';
    }
}

let mouse_down = false;

function showModal(obj, width, height) {
    mouse_down = false;
    if (!width) {
        if (obj.width)
            width = obj.width;
        else
            width = 500;
    }
    if (!height) {
        if (obj.height)
            height = obj.height;
        else
            height = 500;
    }
    return lion_engine.showModal(obj, width, height);
}

function hideAllModal() {
    mouse_down = false;
    promptVisible = false;
    lion_engine.hideAllModal();
    clearMouseListeners();
}
function clearMouseListeners() {
    mouse_down = false;
}

function extractObjectFromSentence(str) {
    return lion_engine.extractObjectFromSentence(str)
}

function showMedChemEditor(title, helmstring) {
    let js = {
        "wid": "medchem",
        "input": helmstring,
        "title": title
    };
    return lion_engine.showWidget(js);
}

function showInputItem(title) {
    return lion_engine.showInputItem(title);
}
function showInputParamItem(title, input_labels) {
    return lion_engine.showInputParamItem(title, input_labels);
}
function showInputTextItems(titlelist) {
    setInterval(function () {
    }, 1000);
}
function showOKPanel(msg) {

    return lion_engine.showOKPanel(msg);
}
function isNumericString(input) {
    return typeof input === 'string' && !Number.isNaN(input)
}
function showHint(msg) {
    let h = {
        'wid': 'hint',
        'data': msg
    }
    lion_engine.showWidget(h);
}

function setUIObject(varobject, label, vartype) {
    lion_engine.setUIObject(varobject, label, vartype);
}

function rerun() {
    lion_engine.rerun();
}

function JSONToFunction(json) {
    return JSON.parse(json, function (key, value) {
        if (typeof value === "string" &&
            value.startsWith("/Function(") &&
            value.endsWith(")/")) {
            value = value.substring(10, value.length - 2);
            return eval("(" + value + ")");
        }
        return value;
    });
}

function createIonFunction(f) {

    return lion_engine.createIonFunction(f, null);
}
function getIonFunction(ref) {
    return lion_engine.getIonFunction(ref);
}
function createIon(f) {
    return lion_engine.createIonFunction(f, null);
}
function getIon(ref) {
    return lion_engine.getIonFunction(ref);
}

function functionToJSON(f) {
    return json = JSON.stringify(f, function (key, value) {
        if (typeof value === "function") {
            return "/Function(" + value.toString() + ")/";
        }
        return value;
    });
}

function showTextAreaEditor(title, default_input) {
    if (default_input == null || default_input.length <= 0)
        default_input = '';
    let js = {
        "wid": "input-textarea-editor",
        "input": default_input,
        "title": title
    }
    return lion_engine.showWidget(js);
}
function showTextField(title, default_input) {
    if (default_input == null || default_input.length <= 0)
        default_input = '';
    let js = {
        "wid": "input-textfield",
        "input": default_input,
        "title": title
    }
    return lion_engine.showWidget(js);
}

function POSTJSON(jsonobj, site) {
    return lion_engine.POSTJSON(jsonobj, site);
}

function POSTFile(file, properties, url) {
    return lion_engine.POSTFile(file, properties, url)
}

function exec_tab(path, params) {
    return lion_engine.exec_tab(path, params);
}

function getUser() {
    let t = lion_engine.getUser();
    if (t != null && t.trim().length < 0) {
        return null;
    }
    return t;
}

function CONSTANTS(path) {
    let it = path.indexOf('/');
    let category = path.substring(0, it);
    let key = path.substring(it + 1);
    let js = {
        "spath": category,
        "rule_name": key
    };
    let url = environment.get_helm_rule;

    var xhr = new XMLHttpRequest();

    xhr.open('POST', url, false);
    xhr.setRequestHeader("Content-type", "application/json");

    xhr.onload = function () {
        var status = xhr.status;
        if (status == 200) {
            data = xhr.response;
        } else {

            return " failed to load " + status;
        }
    }
    xhr.send(JSON.stringify(js));
    let helm_rule_object = JSON.parse(data);
    console.log(" helm rules : " + JSON.stringify(helm_rule_object));
    console.log(" helm fules value : " + helm_rule_object['rule_value']);

    if (helm_rule_object['rule_value'].startsWith('{')) {
        return JSON.parse('' + helm_rule_object['rule_value'] + '');
    }
    return JSON.parse('{' + helm_rule_object['rule_value'] + '}');
}

function rgbToRgba(rgb, alpha) {
    return rgb.replace("rgb", "rgba").replace(")", `, ${alpha})`);
}

function getLog(type) {
    return lion_engine.getLog(type)
}

function readUserTempFile(filename) {
    return lion_engine.readUserTempFile(filename)
}
function rmUserTempFile(filename) {
    return lion_engine.rmUserTempFile(filename)
}

function read(path, ...args) {
    path = path.replace(/(?<!:)\/*\/+/g, '/');

    return new Promise(async (resolve, reject) => {
        let value = await lion_engine.getScript(path);
        if (value != null) {
            resolve(value['rule_value'])
        } else {
            resolve("path not found : " + path);
        }
    })

}
function load(path, ...args) {
    path = path.replace(/(?<!:)\/*\/+/g, '/');
    return lion_engine.getScript(path);
}

function execObj(obj, ...args) {
    return lion_engine.execObject(obj, ...args);
}

function exec(path, ...args) {
    path = path.replace(/(?<!:)\/*\/+/g, '/');
    return lion_engine.exec(path, ...args);
}

async function testSleep() {
    console.log("Waiting for 1 second...");
    await sleep(1000);
    console.log("Waiting done.");
}

let Grid = class Grid {
    static append(column, value) {
        lion_engine.updateUI('grid', column, value);
    }
}

const delimiter = ',';
function parseCSV(text, f) {
    var o;
    let rowset = parseRows(text, function (row, i) {
        if (o) return o(row, i - 1);
        o = new Function("d", "return {" + row.map(function (name, i) {
            console.log(" value " + name + ' ' + i);
            return JSON.stringify(name) + ": d[" + i + "]";
        }).join(",") + "}");
    });
    return rowset;
}

function exportCSV(data) {

    var csv = data.map(row => row.join(',')).join('\n');

    var blob = new Blob([csv], { type: 'text/csv' });

    var a = document.createElement('a');

    a.href = URL.createObjectURL(blob);
    a.download = 'data.csv';

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);
}

parseRows = function (text, f) {
    var delimiterCode = delimiter.charCodeAt(0);
    var EOL = {}, EOF = {}, rows = [], N = text.length, I = 0, n = 0, t, eol;
    function token() {
        if (I >= N) return EOF;
        if (eol) return eol = false, EOL;
        var j = I;
        if (text.charCodeAt(j) === 34) {
            var i = j;
            while (i++ < N) {
                if (text.charCodeAt(i) === 34) {
                    if (text.charCodeAt(i + 1) !== 34) break;
                    ++i;
                }
            }
            I = i + 2;
            var c = text.charCodeAt(i + 1);
            if (c === 13) {
                eol = true;
                if (text.charCodeAt(i + 2) === 10) ++I;
            } else if (c === 10) {
                eol = true;
            }
            return text.slice(j + 1, i).replace(/""/g, '"');
        }
        while (I < N) {
            var c = text.charCodeAt(I++), k = 1;
            if (c === 10) eol = true; else if (c === 13) {
                eol = true;
                if (text.charCodeAt(I) === 10) ++I, ++k;
            } else if (c !== delimiterCode) continue;
            return text.slice(j, I - k);
        }
        return text.slice(j);
    }
    while ((t = token()) !== EOF) {
        var a = [];
        while (t !== EOL && t !== EOF) {
            a.push(t);
            t = token();
        }
        if (f && (a = f(a, n++)) == null) continue;
        rows.push(a);
    }
    return (rows);
};

formatCSV = function (rows) {
    if (Array.isArray(rows[0])) return formatRows(rows);
    var fieldSet = new d3Set(), fields = [];
    rows.forEach(function (row) {
        for (var field in row) {
            console.log(" field " + field);
            if (!fieldSet.has(field)) {
                fields.push(fieldSet.add(field));
            }
        }
    });
    return [fields.map(formatValue).join(delimiter)].concat(rows.map(function (row) {
        return fields.map(function (field) {
            return formatValue(row[field]);
        }).join(delimiter);
    })).join("\n");
};

formatRows = function (rows) {
    return rows.map(formatRow).join("\n");
};
function formatRow(row) {
    return row.map(formatValue).join(delimiter);
}
var reFormat = new RegExp('["' + delimiter + "\n]");
function formatValue(text) {
    return reFormat.test(text) ? '"' + text.replace(/\"/g, '""') + '"' : text;
}

set = function (array) {
    var set = new d3Set();
    if (array) for (var i = 0, n = array.length; i < n; ++i) set.add(array[i]);
    return set;
};
var d3_map_proto = "__proto__", d3_map_zero = "\x00";

let d3Set = class d3Set {

    constructor() {
        this._ = Object.create(null);
    }

    get(key) {
        return this._[d3_map_escape(key)];
    }
    set(key, value) {
        return this._[d3_map_escape(key)] = value;
    }

    add(key) {
        this._[key] = true;
        return key;
    }
    remove(key) {
        return (key = d3_map_escape(key)) in this._ && delete this._[key];
    }
    keys(key) {
        var keys = [];
        for (var key in this._) keys.push(d3_map_unescape(key));
        return keys;
    }
    has(key) {
        return d3_map_escape(key) in this._;
    }
    values() {
        var keys = [];
        for (var key in this._) keys.push(d3_map_unescape(key));
        return keys;
    }
    empty() {
        for (var key in this._) return false;
        return true;
    }

    d3_map_escape(key) {
        return (key += "") === d3_map_proto || key[0] === d3_map_zero ? d3_map_zero + key : key;
    }
    d3_map_unescape(key) {
        return (key += "")[0] === d3_map_zero ? key.slice(1) : key;
    }

}

function sequenceToHELM(seq) {
    seq = seq.trim();
    let chars = seq.split('');
    let helm = "";
    for (let c of chars) {
        helm += "d(" + c + ")p";
        helm += ".";
    }
    if (helm.endsWith(".")) {
        helm = helm.substring(0, helm.length - 1);
    }

    if (helm.endsWith("p")) {
        helm = helm.substring(0, helm.length - 1);
    }
    if (helm != null && helm.length > 0) {
        helm = "RNA1{" + helm + "}$$$$";
    }
    return helm;
}

function exportFile(text, filename) {
    let b = new Blob([text], {
        type: 'text/plain'
    })
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    const clickHandler = () => {
        setTimeout(() => {
            URL.revokeObjectURL(url);
            this.removeEventListener('click', clickHandler);
        }, 150);
    };
    a.addEventListener('click', clickHandler, false);
    a.click();
}

function formatDate(date) {
    var hours = date.getHours();
    var minutes = date.getMinutes();
    var ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    var strTime = hours + ':' + minutes + ' ' + ampm;

    return date.getMonth() + 1 + "/" + date.getDate() + "/" + date.getFullYear() + " " + strTime;
}

function setAppTitle(title) {
    document.title = title;
}

let EngineMonitor = class EngineMonitor {
    listenerFunction;
    progress = '';
    plisteners = [];
    olisteners = [];
    objectListeners = [];

    constructor(listener) {
        this.listenerFunction = listener;
    }
    setRawOutput(line) {
        for (let r of this.olisteners) {
            r(line);
        }
    }
    addRawOutputListener(l) {
        this.olisteners.push(l);
    }

    update(obj) {
        if (this.objectListeners != null && this.objectListeners.length > 0) {
            for (let obl of this.objectListeners) {
                obl(obj);
            }
        }
    }

    setMSG(msg) {
        if (this.listenerFunction) {
            this.listenerFunction(msg)
        }
    }

    addObjectListener(objectListner) {
        this.objectListeners.push(objectListner)
    }

    addProgressListener(progressListner) {
        this.plisteners.push(progressListner);
    }
    setProgress(progress) {
        this.progress = progress;
        if (this.plisteners.length > 0) {
            for (let p of this.plisteners) {
                p(this.progress)
            }
        }
    }

    getProgress() {
        return this.progress;
    }
}
function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function getRandomColor() {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `rgb(${r}, ${g}, ${b})`;
}
function isYouTubeVideo(url) {
    if (!url) return false;
    try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.toLowerCase();

        const isYouTubeDomain = hostname === "youtube.com" ||
            hostname === "www.youtube.com" ||
            hostname === "m.youtube.com" ||
            hostname === "youtu.be";

        if (!isYouTubeDomain) return false;

        if (hostname === "youtu.be") {

            return parsedUrl.pathname.length > 1;
        }

        return parsedUrl.pathname === "/watch" && parsedUrl.searchParams.has("v");

    } catch (e) {
        return false;
    }
}

async function getBase64Image(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            let dataURL;
            canvas.height = img.naturalHeight;
            canvas.width = img.naturalWidth;
            ctx.drawImage(img, 0, 0);
            dataURL = canvas.toDataURL();

            resolve(dataURL);
        };

        img.src = src;
        if (img.complete || img.complete === undefined) {
            img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
            img.src = src;
        }
    });
}

function loadImage(src, canvas, scx, scy) {
    var img = new Image();
    if (!scx)
        scx = 0;
    if (!scy)
        scy = 0;
    img.onload = function (e) {
        canvas.drawImage(img, scx, scy);
    };
    img.src = src;
    return img;
}

function isDictionary(obj) {
    return obj !== null &&
        typeof obj === 'object' &&
        obj.constructor === Object &&
        Object.getPrototypeOf(obj) === Object.prototype;
}

function checkAndCastToNumber(str) {
    if (str != null && typeof str === 'number') {
        return str;
    }
    else if (str != null && typeof str === 'string') {
        str = str.trim();
    }
    else if (str === null || str === undefined) {
        str = '';
    }
    const numberPattern = /^-?\d+(\.\d+)?$/;
    if (numberPattern.test(str)) {
        let number = Number(str)
        if (Number.isInteger(number)) {
            return parseInt(number)
        }
        return Number(str);
    } else {
        return str;
    }
}

function compressbinaryData(binaryData) {
    const chunkSize = 0x8000;
    let stringData = '';
    for (let i = 0; i < binaryData.length; i += chunkSize) {
        const chunk = binaryData.subarray(i, i + chunkSize);
        stringData += String.fromCharCode.apply(null, chunk);
    }
    return stringData;
}
function __compress(jsonString) {

    const compressedData = compressJson(jsonString);

    let compressedString = '';
    for (let i = 0; i < compressedData.length; i++) {
        compressedString += String.fromCharCode(compressedData[i]);
    }
    return compressedString;
}

function __decompress(compressedString) {
    const chunkSize = 0x8000;
    let binaryData = [];
    for (let i = 0; i < compressedString.length; i += chunkSize) {
        const chunk = compressedString.substring(i, i + chunkSize);
        const chunkArray = Array.from(chunk, char => char.charCodeAt(0));
        binaryData.push(...chunkArray);
    }
    let jsonString = decompressJson(Uint8Array.from(binaryData));
    return jsonString;
}
function compress(compressedString) {
    const chunkSize = 0x8000;
    let binaryData = [];
    for (let i = 0; i < compressedString.length; i += chunkSize) {
        const chunk = compressedString.substring(i, i + chunkSize);
        const chunkArray = Array.from(chunk, char => char.charCodeAt(0));
        binaryData.push(...chunkArray);
    }
    let jsonString = decompressJson(Uint8Array.from(binaryData));
    return jsonString;
}

function __decompress_with_uid(content) {
    const uid = content.substring(0, content.indexOf(':'))
    content = content.substring(content.indexOf(':') + 1)
    return { uid: uid, content: __decompress(content) }
}

function functionToBase64(func) {
    const funcStr = func.toString();
    const base64Encoded = btoa(funcStr);
    return base64Encoded;
}
function base64ToFunction(base64Str) {
    const decodedStr = atob(base64Str);
    return new Function(`return (${decodedStr})`)();
}

function compressJson(jsonString) {
    return lion_engine.compress(jsonString)
}
function decompressString(str) {
    return lion_engine.decompressStr(str)
}
function compressString(str) {
    return lion_engine.compress(str)
}
function decompressBase64(compressed) {
    const binaryStr = atob(compressed);
    return lion_engine.decompress(binaryStr);
}
function decompressJson(compressed) {
    return lion_engine.decompress(compressed);
}

const iconCache = {

}

const getIonIcon__ = async (name) => {

    return new Promise(async (resolve, reject) => {
        if (iconCache[name]) {
            resolve(iconCache[name])
        }
        try {
            let icon = await exec('icons/svg/' + name)
            if (icon) {
                iconCache[name] = icon;
                resolve(icon);

            }
        } catch (exception) {
            return null;

        }
        resolve()
    })

}

const getLJIcon = async (description) => {

    return new Promise(async (resolve, reject) => {
        if (!description || typeof description !== 'string') return null;
        const lower = description.toLowerCase();

        if (description.startsWith("email")) {
            resolve(await getIonIcon__('mail'))
        }

        const keywordMap = {
            checklist: [
                'swim', 'swimming', 'pool', 'diving', 'lap swim', 'aquatics', 'splash', 'water aerobics',
                'surfing', 'snorkeling', 'freediving', 'paddling', 'kayaking', 'canoeing', 'windsurfing',
                'kitesurfing', 'wakeboarding', 'waterskiing', 'jetskiing', 'rafting', 'bodyboarding', 'sailing',
                'training', 'exercise', 'workout', 'cardio', 'fitness', 'endurance', 'aerobics', 'stretching',
                'conditioning', 'recovery', 'mobility', 'calisthenics', 'drills'
            ]
            ,
            surfing: [
                'surf', 'surfing', 'beach', 'waves', 'surfboard', 'wave riding', 'shore break', 'paddle out'
            ],
            exclamation: [
                'alert', 'warning', 'caution', 'important', '!', 'critical', 'urgent', 'error', 'emergency'
            ],
            meeting: [
                'meeting', 'call', 'conference', 'zoom', 'teams', 'hangout', 'google meet', 'sync', 'standup', 'calendar',
                'schedule', '1:1', 'review', 'check-in', 'webinar', 'presentation', 'video call',
                'invite', 'session', 'huddle', 'briefing', 'touchpoint', 'catchup', 'kickoff', 'checkin',
                'offsite', 'onsite', 'planning', 'retrospective', 'workshop', 'discussion',
                '<>', '()', '[]', '{}', '@', '📅', '📆', '📞', '🎥', '🗓️'
            ],
            mars: [
                'flight', 'airplane', 'plane', 'departure', 'arrival', 'travel', 'layover', 'terminal', 'boarding',
                'airline', 'air travel', 'fly', 'jet', 'takeoff', 'landing', 'gate',
                'delta', 'united', 'american', 'southwest', 'alaska', 'jetblue', 'spirit', 'frontier',
                'allegiant', 'hawaiian', 'sunwing', 'aircanada', 'westjet', 'lufthansa', 'britishairways',
                'airfrance', 'ryanair', 'easyjet', 'aeromexico', 'latam', 'avianca', 'emirates', 'qatar',
                'etihad', 'turkish', 'singapore', 'cathay', 'ana', 'jal', 'airasia', 'vueling', 'klm', 'virgin'
            ]
            ,
        };

        for (const [iconName, keywords] of Object.entries(keywordMap)) {
            if (keywords.some(word => lower.includes(word))) {
                resolve(await getIonIcon__(iconName))
            }
        }
        return resolve(null)
    })

};

const TJ = (textList) => {
    if (typeof textList !== 'string' || !textList.trim()) {
        return {};
    }

    let lines = textList.split('\n');
    if (lines.length === 1) {
        const fallbackDelims = [',', ';', '|'];
        for (const delim of fallbackDelims) {
            const testSplit = textList.split(delim);
            if (testSplit.length > 1) {
                lines = testSplit;
                break;
            }
        }
    }

    const obj = {};

    for (let line of lines) {
        if (!line || !line.trim()) continue;

        let separator = ':';
        if (!line.includes(':')) {
            if (line.includes('=')) separator = '=';
            else if (line.includes('-')) separator = '-';
            else if (line.includes('\t')) separator = '\t';
            else continue;
        }

        const [rawKey, ...rest] = line.split(separator);
        if (!rawKey || rest.length === 0) continue;

        const key = rawKey.trim();
        const value = rest.join(separator).trim();

        if (key && !(key in obj)) {
            obj[key] = value;
        } else if (key) {

            obj[key] += `, ${value}`;
        }
    }

    return obj;
};

const JT = (jsonObj) => {
    if (typeof jsonObj !== 'object' || jsonObj === null) {
        throw new Error("Input must be a non-null object");
    }

    return Object.entries(jsonObj)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
}

const pushHistory = (jb) => {
    lion_engine.pushHistory(jb)
}

const getLastHistoryPushTime = () => {
    return lion_engine.getLastHistoryPushTime();
}

const __deserializeObject = (jsonString) => {
    return JSON.parse(jsonString, (key, value) => {
        if (typeof value === 'string' && value.startsWith('async') || value.startsWith('function') || value.includes('=>')) {
            try {
                return eval('(' + value + ')');
            } catch (e) {
                console.error('Failed to eval function:', e);
                return value;
            }
        }
        return value;
    })
}

const __serializeObject = (obj) => {
    function replacer(key, value) {
        if (typeof value === 'function') {
            return value.toString();
        }
        return value;
    }
    return JSON.stringify(obj, replacer, 2);
}

const shareObject = (jb) => {
    const pt = CurrentLayout.getStashed('plate-track').plateTrack
    if (Object.keys(pt.users).length <= 1)
        return;

    if (!jb) {
        jb = pt;

    }

    lion_engine.shareObject(jb, pt.uid)

}

const connectToSharedFolder = (folderid, user) => {
    lion_engine.connectToSharedFolder(folderid, user)
}

const listenForObjectUpdate = (id, user, __dt) => {
    lion_engine.listenForObjectUpdate(id, __dt, user);
}

const popHistory = () => {
    let jb = lion_engine.popHistory()
    return (jb)
}
