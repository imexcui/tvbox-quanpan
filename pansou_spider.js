// =============================================================
// 盘搜 · TVBox / CatVod 纯 JS 蜘蛛（多后端 + 兜底源版）
//
// 主源：https://so.252035.xyz/api/search
//   POST {"kw":"关键词","res":"merge","src":"all","refresh":false}  结果最全
//   GET  ?kw=关键词                                                代理/镜像常用
// 备用源：seep.eu.org 代理（可能不可用，自动跳过）
// 兜底源：buerchen.top（国内直连稳定）——SSR 明文结果 + 全量库本地匹配 + decrypt
//
// 修复要点：
//   1) 统一使用 quanpan_spider.js 同款 $http 适配器（requestWith / request / post 全兼容）
//   2) 每个后端 8 秒超时、POST 失败自动回退 GET、主源失败自动切兜底
//   3) detail() 输出标准 "集名$链接" 播放列表（旧版给裸 URL，TVBox 点开无反应）
//   4) play() 同时兼容 vod_id 与播放链接两种入参
// ext：字符串自定义主源域名，或 JSON {"url":"...","apis":[...],"fallback":false}
// =============================================================

var MAX_RESULT = 100;
var REQ_TIMEOUT = 6000;
var CACHE_TTL = 30 * 60 * 1000;
var MAX_DECRYPT = 12;
var MAIN_COOLDOWN = 10 * 60 * 1000;   // 主源连续失败后冷却，避免每次搜索都干等超时

// seep.eu.org 代理实测长期超时，默认不启用；需要时可用 ext 的 apis 自行加入
var APIS = [
    "https://so.252035.xyz/api/search"
];
var FALLBACK = "https://buerchen.top";
var USE_FALLBACK = true;

var __db = { items: null, ts: 0 };
var __dec = {};
var __mainFail = { ts: 0, n: 0 };

function __now() { try { return (typeof Date !== "undefined" && Date.now) ? Date.now() : 0; } catch (e) { return 0; } }

function init(ext) {
    if (ext && ext.toString().trim()) {
        var s = ext.toString().trim();
        try {
            var o = JSON.parse(s);
            if (o && o.url) APIS = [String(o.url).replace(/\/+$/, "") + "/api/search"];
            if (o && o.apis && o.apis.length) APIS = o.apis;
            if (o && o.fallback === false) USE_FALLBACK = false;
            if (o && o.max) MAX_RESULT = parseInt(o.max, 10) || MAX_RESULT;
            return "";
        } catch (e) {}
        APIS = [s.replace(/\/+$/, "") + "/api/search"];
    }
    return "";
}

// ---------- HTTP 适配器：与线上 quanpan_spider.js 保持一致 ----------
function __doHttp(method, url, data, headers, timeout) {
    var h = headers ? JSON.parse(JSON.stringify(headers)) : {};
    var t = timeout || REQ_TIMEOUT;
    var status = 200, bodyStr = "";
    try {
        var raw;
        if (typeof requestWith === "function") {
            var opts = { url: url, method: method, headers: h, timeout: t };
            if (method === "POST") {
                var body = (data === undefined || data === null) ? "" : (typeof data === "string" ? data : JSON.stringify(data));
                opts.data = body; opts.body = body;
            }
            raw = requestWith(opts);
        } else if (typeof request === "function") {
            if (method === "POST") {
                var b2 = (data === undefined || data === null) ? "" : (typeof data === "string" ? data : JSON.stringify(data));
                if (typeof post === "function") raw = post(url, b2, h);
                else raw = request(url, { method: "POST", body: b2, data: b2, headers: h });
            } else raw = request(url, h);
        } else if (typeof post === "function") {
            raw = post(url, data || "", h);
        }
        if (raw && typeof raw === "object") {
            status = Number(raw.code || raw.status || 200);
            var d = (raw.data !== undefined && raw.data !== null) ? raw.data
                  : (raw.body !== undefined && raw.body !== null ? raw.body
                  : (raw.content !== undefined && raw.content !== null ? raw.content : undefined));
            bodyStr = (d === undefined) ? "" : (typeof d === "string" ? d : JSON.stringify(d));
        } else {
            bodyStr = (raw === undefined || raw === null) ? "" : String(raw);
        }
    } catch (e) { status = 0; bodyStr = ""; }
    return { status: status, data: bodyStr };
}

function __get(url, timeout) { return __doHttp("GET", url, undefined, { "User-Agent": "Mozilla/5.0", "Accept": "*/*" }, timeout); }
function __post(url, body, timeout) {
    return __doHttp("POST", url, body, { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0", "Accept": "*/*" }, timeout);
}
function __json(s) { try { return JSON.parse(s); } catch (e) { return null; } }

var CLOUD_LABELS = {
    "baidu": "百度", "aliyun": "阿里", "quark": "夸克", "guangya": "光亚",
    "tianyi": "天翼", "uc": "UC", "mobile": "移动", "115": "115",
    "pikpak": "PikPak", "xunlei": "迅雷", "123": "123", "magnet": "磁力",
    "ed2k": "电驴", "others": "其它", "other": "其它", "quark_clone": "夸克"
};
function label(t) { return CLOUD_LABELS[t] || t || "未知"; }

// ---------- 主源：so.252035.xyz ----------
function __queryMain(kw) {
    var now = __now();
    // 主源刚失败过 → 冷却期内直接走兜底，不再空等超时
    if (__mainFail.n > 0 && now - __mainFail.ts < MAIN_COOLDOWN) return null;

    var body = JSON.stringify({ "kw": kw, "res": "merge", "src": "all", "refresh": false });
    // GET 实测比 POST 更快更稳，优先
    var tries = [
        { method: "GET", body: null },
        { method: "POST", body: body }
    ];
    for (var b = 0; b < APIS.length; b++) {
        var base = APIS[b];
        for (var k = 0; k < tries.length; k++) {
            var t = tries[k];
            var url = t.method === "GET" ? (base + "?kw=" + encodeURIComponent(kw)) : base;
            var r = t.method === "GET" ? __get(url) : __post(url, t.body);
            if (r.status !== 200 || !r.data) continue;
            var j = __json(r.data);
            if (j && j.code === 0 && j.data) {
                __mainFail.n = 0;
                return { data: j.data, from: b === 0 ? "盘搜" : "盘搜·镜像" };
            }
        }
    }
    __mainFail.ts = now;
    __mainFail.n++;
    return null;
}

// ---------- 兜底源：buerchen.top ----------
function __ssrItems(kw) {
    var out = [];
    try {
        var r = __get(FALLBACK + "/s/" + encodeURIComponent(kw) + ".html");
        if (r.status !== 200 || !r.data) return out;
        var m = r.data.match(/listItems\s*=\s*JSON\.parse\('([\s\S]*?)'\)/);
        if (!m) return out;
        var arr = __json(m[1].replace(/\\'/g, "'"));
        if (!arr || !arr.length) return out;
        for (var i = 0; i < arr.length; i++) {
            var it = arr[i] || {};
            if (it.url) out.push({ title: it.title || it.name || "未命名资源", url: it.url });
        }
    } catch (e) {}
    return out;
}

function __dbItems() {
    var now = __now();
    if (__db.items && now - __db.ts < CACHE_TTL) return __db.items;
    var r = __get(FALLBACK + "/api2/content", 15000);
    var j = __json(r.data);
    var arr = (j && j.success && j.data && j.data.data) ? j.data.data : [];
    if (arr && arr.length) { __db.items = arr; __db.ts = now; return arr; }
    return __db.items || [];
}

function __decrypt(enc) {
    if (!enc) return "";
    if (__dec[enc]) return __dec[enc];
    var r = __post(FALLBACK + "/api2/decrypt", JSON.stringify({ encryptUrl: enc }));
    var j = __json(r.data);
    var u = (j && j.success && j.data && j.data.url) ? String(j.data.url) : "";
    if (u) __dec[enc] = u;
    return u;
}

function __fallbackItems(kw, limit) {
    var out = [], ssr = __ssrItems(kw);
    for (var i = 0; i < ssr.length && out.length < limit; i++) {
        out.push({ title: ssr[i].title, url: ssr[i].url, remarks: "夸克 · 兜底源" });
    }
    if (out.length >= limit) return out;
    var all = __dbItems(), k = String(kw || "").toLowerCase(), n = 0;
    for (var j = 0; j < all.length && out.length < limit && n < MAX_DECRYPT; j++) {
        var it = all[j] || {};
        if (String(it.title || "").toLowerCase().indexOf(k) < 0) continue;
        var enc = (it.quarkLink && it.quarkLink.trim()) || (it.baiduLink && it.baiduLink.trim()) || (it.xunleiLink && it.xunleiLink.trim()) || "";
        if (!enc) continue;
        n++;
        var u = __decrypt(enc);
        if (!/^https?:\/\//i.test(u)) continue;
        var kind = it.quarkLink ? "夸克" : (it.baiduLink ? "百度" : "迅雷");
        out.push({ title: it.title || "未命名资源", url: u, remarks: kind + " · 兜底源" });
    }
    return out;
}

function __isHttp(s) { return /^https?:\/\//i.test(s || ""); }
function __vodId(url) { return "pansou_" + encodeURIComponent(url); }
function __fromId(id) {
    var raw = String(id || "").replace(/^pansou_/, "");
    if (__isHttp(raw)) return raw;
    try { return decodeURIComponent(raw); } catch (e) { return raw; }
}

function home() { return JSON.stringify({ list: [] }); }
function homeVod() { return home(); }
function category() { return JSON.stringify({}); }

function search(keyword, quick) {
    var list = [], seen = {};
    var push = function (title, url, remarks, pic) {
        if (!url || seen[url] || list.length >= MAX_RESULT) return;
        seen[url] = 1;
        list.push({
            "vod_id": __vodId(url),
            "vod_name": title || "未命名资源",
            "vod_remarks": remarks || "盘搜",
            "vod_pic": pic || ""
        });
    };

    try {
        var main = __queryMain(keyword);
        if (main) {
            var mbt = main.data.merged_by_type || {};
            for (var type in mbt) {
                if (!mbt.hasOwnProperty(type)) continue;
                var items = mbt[type] || [];
                for (var i = 0; i < items.length; i++) {
                    var it = items[i] || {};
                    var url = it.url || "";
                    if (!url) continue;
                    var pwd = it.password || "";
                    var dt = String(it.datetime || "");
                    if (dt.indexOf("0001-") === 0) dt = "";
                    var src = it.source || "";
                    var name = (it.note || it.title || "未命名资源") + (pwd ? " [码:" + pwd + "]" : "");
                    var remarks = main.from + " · " + label(type) + (src ? " · " + src : "") + (dt ? " · " + (dt + "").slice(0, 10) : "");
                    push(name, url, remarks, (it.images && it.images[0]) ? it.images[0] : "");
                }
                if (list.length >= MAX_RESULT) break;
            }
        }
        // 主源无结果 / 超时 → 兜底源
        if (!list.length && USE_FALLBACK) {
            var fb = __fallbackItems(keyword, MAX_RESULT);
            for (var j = 0; j < fb.length; j++) push(fb[j].title, fb[j].url, fb[j].remarks, "");
        }
    } catch (e) {}

    return JSON.stringify({ "list": list, "total": list.length });
}

function detail(id) {
    try {
        var url = __fromId(id);
        if (!url) return JSON.stringify({ list: [] });
        var name = "盘搜结果";
        return JSON.stringify({
            list: [{
                "vod_id": id,
                "vod_name": name,
                "vod_pic": "",
                "vod_play_from": "PanSou",
                "vod_play_url": name + "$" + url
            }]
        });
    } catch (e) { return JSON.stringify({ list: [] }); }
}

function play(flag, id, flags) {
    try {
        var raw = String(id || "");
        if (raw.indexOf("$") >= 0) raw = raw.slice(raw.lastIndexOf("$") + 1);
        var url = __isHttp(raw) ? raw : __fromId(raw);
        return JSON.stringify({ "url": url, "parse": 0, "header": {} });
    } catch (e) { return JSON.stringify({ "url": id, "parse": 0 }); }
}
