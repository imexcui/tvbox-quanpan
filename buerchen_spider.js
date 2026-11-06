// =============================================================
// 不二资源搜索站 · TVBox / CatVod 纯 JS 蜘蛛
// 站点：http://buerchen.top
// 数据来源（均为公开 HTTP 接口，无需登录 / 指纹 / WebAssembly）：
//   1) GET  /s/<关键词>.html          服务端渲染，内嵌 listItems（明文网盘链接）
//   2) GET  /api2/content            全量资源库 JSON（约 7300 条，字段 quarkLink/baiduLink/xunleiLink 为密文）
//   3) POST /api2/decrypt            {"encryptUrl":"<hex:hex>"} -> {"data":{"url":"https://pan.quark.cn/s/..."}}
// 说明：/api/other/web_search 的 SSE 结果需要设备指纹 + 人机挑战（save_url），
//       不适合无浏览器环境，故不采用。
// ext 支持：字符串自定义域名，或 JSON 字符串 {"url":"http://buerchen.top","max":24}
// =============================================================

var SITE = "http://buerchen.top";
var MAX_RESULT = 24;          // 单次搜索最多返回条数
var MAX_DECRYPT = 20;         // 单次最多解密条数（控制请求数）
var CACHE_TTL = 30 * 60 * 1000;

var __db = { items: null, ts: 0 };
var __dec = {};               // encryptUrl -> 明文链接

function init(ext) {
    if (!ext) return "";
    var s = ext.toString().trim();
    if (!s) return "";
    try {
        var o = JSON.parse(s);
        if (o && o.url) SITE = String(o.url).replace(/\/+$/, "");
        if (o && o.max) MAX_RESULT = parseInt(o.max, 10) || MAX_RESULT;
        return "";
    } catch (e) {}
    SITE = s.replace(/\/+$/, "");
    return "";
}

function __now() { try { return Date.now ? Date.now() : 0; } catch (e) { return 0; } }

// ---------- HTTP 兼容层（同步，适配 TVBox / CatVod 各种 JS 运行时） ----------
function __raw(method, url, data, headers) {
    var h = headers || {};
    try {
        if (typeof requestWith === "function") {
            var opts = { url: url, method: method, headers: h, timeout: 15000 };
            if (method === "POST") { opts.data = data; opts.body = data; }
            var r = requestWith(opts);
            if (r && typeof r === "object") return r.content || r.body || r.data || "";
            return r == null ? "" : String(r);
        }
        if (method === "POST") {
            if (typeof post === "function") return post(url, data, h) || "";
            return "";
        }
        if (typeof request === "function") {
            try { return request(url, h) || ""; } catch (e2) { return request(url) || ""; }
        }
    } catch (e) {}
    return "";
}

function __get(url) { return __raw("GET", url, "", { "User-Agent": "Mozilla/5.0", "Accept": "*/*" }); }
function __postJson(url, obj) {
    var body = JSON.stringify(obj);
    var h = { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0", "Accept": "*/*" };
    return __raw("POST", url, body, h);
}

function __json(s) { try { return JSON.parse(s); } catch (e) { return null; } }

// ---------- 数据源 1：SSR 页面内嵌结果 ----------
function __ssrItems(kw) {
    var out = [];
    try {
        var url = SITE + "/s/" + encodeURIComponent(kw) + ".html";
        var html = __get(url);
        if (!html) return out;
        var m = html.match(/listItems\s*=\s*JSON\.parse\('([\s\S]*?)'\)/);
        if (!m) return out;
        var raw = m[1].replace(/\\'/g, "'");
        var arr = JSON.parse(raw);
        if (!arr || !arr.length) return out;
        for (var i = 0; i < arr.length; i++) {
            var it = arr[i] || {};
            if (!it.url) continue;
            out.push({ title: it.title || it.name || "未命名资源", url: it.url, type: it.is_type, from: "站内" });
        }
    } catch (e) {}
    return out;
}

// ---------- 数据源 2：全量资源库（带进程内缓存） ----------
function __dbItems() {
    var t = __now();
    if (__db.items && t - __db.ts < CACHE_TTL) return __db.items;
    var j = __json(__get(SITE + "/api2/content"));
    var arr = (j && j.success && j.data && j.data.data) ? j.data.data : [];
    if (arr && arr.length) { __db.items = arr; __db.ts = t; return arr; }
    return __db.items || [];
}

function __dbMatch(kw) {
    var out = [], all = __dbItems();
    var k = String(kw || "").toLowerCase();
    if (!k) return out;
    for (var i = 0; i < all.length; i++) {
        var it = all[i] || {};
        var title = it.title || "";
        if (title.toLowerCase().indexOf(k) < 0) continue;
        var enc = (it.quarkLink && it.quarkLink.trim()) ||
                  (it.baiduLink && it.baiduLink.trim()) ||
                  (it.xunleiLink && it.xunleiLink.trim()) || "";
        if (!enc) continue;
        var kind = it.quarkLink ? "夸克" : (it.baiduLink ? "百度" : "迅雷");
        out.push({ title: title, enc: enc, kind: kind, type: it.type || "" });
        if (out.length >= MAX_DECRYPT) break;
    }
    return out;
}

// ---------- 数据源 3：密文链接解密 ----------
function __decrypt(enc) {
    if (!enc) return "";
    if (__dec[enc]) return __dec[enc];
    var j = __json(__postJson(SITE + "/api2/decrypt", { encryptUrl: enc }));
    var u = (j && j.success && j.data && j.data.url) ? String(j.data.url) : "";
    if (u) __dec[enc] = u;
    return u;
}

// ---------- 工具 ----------
function __cleanTitle(s) {
    return String(s || "").replace(/[🔥🌟⭐💥💓🎬📺]/g, "").replace(/[（(【\[].*?[)）】\]]/g, "").trim();
}
function __vodId(url) { return "brc_" + encodeURIComponent(url); }
function __isHttp(s) { return /^https?:\/\//i.test(s || ""); }

function home() {
    return JSON.stringify({ "class": [], "content": 1, "list": [] });
}

function homeVod() { return home(); }
function category(tid, pg, filter, extend) {
    return JSON.stringify({ "list": [], "page": Number(pg || 1), "pagecount": 1, "limit": 20, "total": 0 });
}

function search(kw, quick) {
    var list = [], seen = {}, n = 0;
    var push = function (title, url, remarks, pic) {
        if (!url || seen[url]) return;
        seen[url] = 1;
        list.push({
            vod_id: __vodId(url),
            vod_name: title || "未命名资源",
            vod_remarks: remarks || "不二资源",
            vod_pic: pic || ""
        });
        n++;
    };

    try {
        // 1) SSR 明文结果
        var ssr = __ssrItems(kw);
        for (var i = 0; i < ssr.length && n < MAX_RESULT; i++) {
            var a = ssr[i];
            var lab = a.type === 2 ? "百度" : (a.type === 4 ? "迅雷" : "夸克");
            push(a.title, a.url, lab + " · 站内");
        }

        // 2) 全量库本地匹配 + 解密
        var mt = __dbMatch(kw);
        for (var j = 0; j < mt.length && n < MAX_RESULT; j++) {
            var b = mt[j];
            var u = __decrypt(b.enc);
            if (!__isHttp(u)) continue;
            push(b.title, u, b.kind + " · 每日更新");
        }
    } catch (e) {}

    return JSON.stringify({ list: list, total: list.length });
}

function detail(id) {
    try {
        var raw = String(id || "").replace(/^brc_/, "");
        var url = decodeURIComponent(raw);
        if (!__isHttp(url)) {
            // 允许直接传密文（home 占位场景）
            url = __decrypt(raw);
        }
        var name = "不二资源";
        return JSON.stringify({
            list: [{
                vod_id: id,
                vod_name: name,
                vod_pic: "",
                vod_play_from: "不二资源",
                vod_play_url: name + "$" + url
            }]
        });
    } catch (e) { return JSON.stringify({ list: [] }); }
}

function play(flag, id, flags) {
    try {
        var raw = String(id || "").replace(/^brc_/, "");
        var url = decodeURIComponent(raw);
        if (!__isHttp(url)) url = __decrypt(raw);
        return JSON.stringify({ url: url, parse: 0, header: {} });
    } catch (e) { return JSON.stringify({ url: id, parse: 0 }); }
}
