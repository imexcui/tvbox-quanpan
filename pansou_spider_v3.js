// =============================================================
// 盘搜 · TVBox / CatVod 纯 JS 蜘蛛（v3 · TVBox 实机可用版）
//
// v3 相对 v2 的修复（全部来自直连实测）：
//   1) 主源 POST 优先（实测 200/67 条/4.6s），GET 回退且只给 3s（实测 GET 常超时）；
//      v2 是 GET 优先，每次先白等 6s，TVBox 搜索超时内根本跑不完。
//   2) 彻底弃用 2.7MB 全量库兜底（实测 40s，TVBox 必然超时）；兜底只用 SSR 页面
//      （实测 0.5~1.6s）。需要全量库时可用 ext {"full":true} 显式开启。
//   3) home()/category() 补齐 TVBox 规范字段 class/content/page，与线上已能用的
//      quanpan_spider.js 完全一致（缺 class 会让部分 jar 初始化站点失败）。
//   4) detail() 补全 vod_content / vod_remarks / type_name，把网盘链接与提取码
//      明文写进详情，方便在电视上查看、用手机扫码/复制后到网盘 App 打开。
//   5) play() 明确返回网盘链接 + content 提示（网盘分享页不是视频流，TVBox
//      播放器无法直接播放；要直接播放请用「全盘搜4K」站点，它会把夸克/百度/UC
//      分享转成视频直链）。
//
// ext：字符串自定义主源域名，或 JSON
//   {"url":"https://xxx","apis":[...],"fallback":false,"full":true,"max":80}
// =============================================================

var MAX_RESULT = 80;
var POST_TIMEOUT = 7000;      // 主源 POST：实测 4.6s
var GET_TIMEOUT = 2000;       // 主源 GET：实测常超时，快速放弃
var SSR_TIMEOUT = 4000;       // 兜底 SSR：实测 0.5~1.6s
var FULL_TIMEOUT = 9000;      // 全量库（默认不启用）
var CACHE_TTL = 30 * 60 * 1000;
var MAX_DECRYPT = 8;
var MAIN_COOLDOWN = 10 * 60 * 1000;

var APIS = ["https://so.252035.xyz/api/search"];
var FALLBACK = "https://buerchen.top";
var USE_FALLBACK = true;
var USE_FULL_DB = false;      // 2.7MB / 40s，默认关闭

var __db = { items: null, ts: 0 };
var __dec = {};
var __mainFail = { ts: 0, n: 0 };
var __lastFrom = "";

function __now() { try { return (typeof Date !== "undefined" && Date.now) ? Date.now() : 0; } catch (e) { return 0; } }

function init(ext) {
    if (ext && ext.toString().trim()) {
        var s = ext.toString().trim();
        try {
            var o = JSON.parse(s);
            if (o && o.url) APIS = [String(o.url).replace(/\/+$/, "") + "/api/search"];
            if (o && o.apis && o.apis.length) APIS = o.apis;
            if (o && o.fallback === false) USE_FALLBACK = false;
            if (o && o.full === true) USE_FULL_DB = true;
            if (o && o.max) MAX_RESULT = parseInt(o.max, 10) || MAX_RESULT;
            return "";
        } catch (e) {}
        APIS = [s.replace(/\/+$/, "") + "/api/search"];
    }
    return "";
}

// ---------- HTTP 适配器：与线上已可用的 quanpan_spider.js 同款 ----------
function __doHttp(method, url, data, headers, timeout) {
    var h = headers ? JSON.parse(JSON.stringify(headers)) : {};
    var t = timeout || POST_TIMEOUT;
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

function __get(url, timeout) {
    return __doHttp("GET", url, undefined, { "User-Agent": "Mozilla/5.0", "Accept": "*/*" }, timeout);
}
function __post(url, body, timeout) {
    return __doHttp("POST", url, body,
        { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0", "Accept": "*/*" }, timeout);
}
function __json(s) { try { return JSON.parse(s); } catch (e) { return null; } }

var CLOUD_LABELS = {
    "baidu": "百度", "aliyun": "阿里", "quark": "夸克", "guangya": "光亚",
    "tianyi": "天翼", "uc": "UC", "mobile": "移动", "115": "115",
    "pikpak": "PikPak", "xunlei": "迅雷", "123": "123", "magnet": "磁力",
    "ed2k": "电驴", "others": "其它", "other": "其它", "quark_clone": "夸克"
};
function label(t) { return CLOUD_LABELS[t] || t || "未知"; }

// ---------- 主源：POST 优先（实测稳），GET 快速回退 ----------
function __queryMain(kw) {
    var now = __now();
    if (__mainFail.n > 0 && now - __mainFail.ts < MAIN_COOLDOWN) return null;

    var body = JSON.stringify({ "kw": kw, "res": "merge", "src": "all", "refresh": false });
    for (var b = 0; b < APIS.length; b++) {
        var base = APIS[b];
        // 1) POST，最全
        var r = __post(base, body, POST_TIMEOUT);
        if (r.status === 200 && r.data) {
            var j = __json(r.data);
            if (j && j.code === 0 && j.data) { __mainFail.n = 0; return { data: j.data, from: b === 0 ? "盘搜" : "盘搜·镜像" }; }
        }
        // 2) GET，只给 3 秒，超时立刻放弃
        var g = __get(base + "?kw=" + encodeURIComponent(kw), GET_TIMEOUT);
        if (g.status === 200 && g.data) {
            var j2 = __json(g.data);
            if (j2 && j2.code === 0 && j2.data) { __mainFail.n = 0; return { data: j2.data, from: b === 0 ? "盘搜" : "盘搜·镜像" }; }
        }
    }
    __mainFail.ts = now;
    __mainFail.n++;
    return null;
}

// ---------- 兜底源：SSR 页面（快，明文链接） ----------
function __ssrItems(kw) {
    var out = [];
    try {
        var r = __get(FALLBACK + "/s/" + encodeURIComponent(kw) + ".html", SSR_TIMEOUT);
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

// ---------- 可选：全量库（默认关闭，2.7MB / 40s） ----------
function __dbItems() {
    var now = __now();
    if (__db.items && now - __db.ts < CACHE_TTL) return __db.items;
    var r = __get(FALLBACK + "/api2/content", FULL_TIMEOUT);
    var j = __json(r.data);
    var arr = (j && j.success && j.data && j.data.data) ? j.data.data : [];
    if (arr && arr.length) { __db.items = arr; __db.ts = now; return arr; }
    return __db.items || [];
}
function __decrypt(enc) {
    if (!enc) return "";
    if (__dec[enc]) return __dec[enc];
    var r = __post(FALLBACK + "/api2/decrypt", JSON.stringify({ encryptUrl: enc }), POST_TIMEOUT);
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
    if (!USE_FULL_DB || out.length >= limit) return out;
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
function cloudOf(url) {
    var u = String(url || "");
    if (u.indexOf("quark.cn") >= 0) return "夸克";
    if (u.indexOf("baidu.com") >= 0) return "百度";
    if (u.indexOf("aliyundrive") >= 0 || u.indexOf("alipan") >= 0) return "阿里";
    if (u.indexOf("drive.uc.cn") >= 0) return "UC";
    if (u.indexOf("115.com") >= 0 || u.indexOf("115cdn") >= 0) return "115";
    if (u.indexOf("xunlei") >= 0) return "迅雷";
    if (u.indexOf("123") >= 0) return "123";
    if (u.indexOf("magnet:") === 0) return "磁力";
    if (u.indexOf("ed2k:") === 0) return "电驴";
    return "网盘";
}

// ---------- TVBox 入口（字段与已可用的 quanpan_spider.js 对齐） ----------
function home() {
    return JSON.stringify({ "class": [], "content": 1, "list": [] });
}
function homeVod() { return home(); }
function category(tid, pg, filter, extend) {
    return JSON.stringify({ "list": [], "page": Number(pg || 1), "pagecount": 1, "limit": 20, "total": 0 });
}

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
        __lastFrom = main ? main.from : "兜底源";
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
                    var remarks = main.from + " · " + label(type) + (src ? " · " + src : "") + (dt ? " · " + dt.slice(0, 10) : "");
                    push(name, url, remarks, (it.images && it.images[0]) ? it.images[0] : "");
                }
                if (list.length >= MAX_RESULT) break;
            }
        }
        if (!list.length && USE_FALLBACK) {
            var fb = __fallbackItems(keyword, MAX_RESULT);
            for (var j = 0; j < fb.length; j++) push(fb[j].title, fb[j].url, fb[j].remarks, "");
        }
    } catch (e) {}

    return JSON.stringify({
        "list": list, "total": list.length,
        "page": 1, "pagecount": 1, "limit": MAX_RESULT
    });
}

function detail(id) {
    try {
        var url = __fromId(id);
        if (!url) return JSON.stringify({ list: [] });
        var cloud = cloudOf(url);
        var name = "盘搜结果 · " + cloud;
        var tip = "网盘分享链接：" + url + "\n来源：" + (__lastFrom || "盘搜") +
                  "\n说明：这是网盘分享页，不是视频文件。请在手机/电脑网盘 App 中打开或转存；" +
                  "TVBox 内置播放器无法直接播放。需要直接播放请使用「全盘搜4K」站点。";
        return JSON.stringify({
            list: [{
                "vod_id": id,
                "vod_name": name,
                "vod_pic": "",
                "type_name": cloud,
                "vod_remarks": "网盘分享 · 需在网盘 App 打开",
                "vod_content": tip,
                "vod_play_from": "PanSou",
                "vod_play_url": cloud + "链接$" + url
            }]
        });
    } catch (e) { return JSON.stringify({ list: [] }); }
}

function play(flag, id, flags) {
    try {
        var raw = String(id || "");
        if (raw.indexOf("$") >= 0) raw = raw.slice(raw.lastIndexOf("$") + 1);
        var url = __isHttp(raw) ? raw : __fromId(raw);
        return JSON.stringify({
            "parse": 0,
            "url": url,
            "content": "网盘分享链接（非视频流）：" + url,
            "header": {}
        });
    } catch (e) { return JSON.stringify({ "parse": 0, "url": id }); }
}

function destroy() { return ""; }
