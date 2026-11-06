// =============================================================
// 盘搜 · TVBox / CatVod 纯 JS 蜘蛛（原 csp_SoAiHaiYinGuard 盘搜功能的等价重写）
// 后端：https://so.252035.xyz/api/search
//   POST {"kw":"关键词","res":"merge","src":"all","refresh":false}  -> 结果更全（实测 147 条）
//   GET  ?kw=关键词                                                -> 代理/镜像常用（实测 65 条）
// 两者均实测 200 / code=0；POST 优先，失败自动回退 GET。
// 裤佬盘搜 pan.dhsv.eu.org 的前端即通过 seep.eu.org 代理访问本接口。
// 不依赖 Java jar / Guard / WebAssembly。
// ext：字符串自定义后端，或 JSON 字符串 {"url":"https://so.252035.xyz"}
// =============================================================

var SITE = "https://so.252035.xyz";
var MAX_RESULT = 100;

function init(ext) {
    if (ext && ext.toString().trim().length > 0) {
        var s = ext.toString().trim();
        try {
            var o = JSON.parse(s);
            if (o && o.url) { SITE = o.url.replace(/\/+$/, ""); return ""; }
        } catch (e) {}
        SITE = s.replace(/\/+$/, "");
    }
    return "";
}

var CLOUD_LABELS = {
    "baidu": "百度", "aliyun": "阿里", "quark": "夸克", "guangya": "光亚",
    "tianyi": "天翼", "uc": "UC", "mobile": "移动", "115": "115",
    "pikpak": "PikPak", "xunlei": "迅雷", "123": "123", "magnet": "磁力",
    "ed2k": "电驴", "others": "其它", "other": "其它", "quark_clone": "夸克"
};

function label(t) { return CLOUD_LABELS[t] || t || "未知"; }

function __post(url, body, hdr) {
    try { return (typeof post === "function") ? (post(url, body, hdr) || "") : ""; } catch (e) { return ""; }
}
function __get(url, hdr) {
    try {
        if (typeof request === "function") {
            try { return request(url, hdr) || ""; } catch (e) { return request(url) || ""; }
        }
        if (typeof requestWith === "function") {
            var r = requestWith({ url: url, method: "GET", headers: hdr || {}, timeout: 15000 });
            if (r && typeof r === "object") return r.content || r.body || r.data || "";
            return r == null ? "" : String(r);
        }
    } catch (e2) {}
    return "";
}

function home() { return "{\"list\":[]}"; }
function homeVod() { return home(); }
function category() { return "{}"; }

function search(keyword) {
    try {
        var hdr = { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0", "Accept": "*/*" };
        var body = JSON.stringify({ "kw": keyword, "res": "merge", "src": "all", "refresh": false });
        var json = null;
        try { json = JSON.parse(__post(SITE + "/api/search", body, hdr)); } catch (e) {}
        if (!json || json.code !== 0 || !json.data) {
            var g = __get(SITE + "/api/search?kw=" + encodeURIComponent(keyword), hdr);
            try { json = JSON.parse(g); } catch (e2) {}
        }
        if (!json || json.code !== 0 || !json.data) return "{\"list\":[]}";

        var mbt = json.data.merged_by_type || {};
        var list = [];
        for (var type in mbt) {
            if (!mbt.hasOwnProperty(type)) continue;
            var items = mbt[type] || [];
            for (var i = 0; i < items.length; i++) {
                var it = items[i] || {};
                var title = it.note || it.title || "未命名资源";
                var url = it.url || "";
                if (!url) continue;
                var pwd = it.password || "";
                var dt = it.datetime || "";
                var src = it.source || "";
                var name = title + (pwd ? " [码:" + pwd + "]" : "");
                var remarks = label(type) + (src ? " · " + src : "") + (dt ? " · " + (dt + "").slice(0, 10) : "");
                list.push({
                    "vod_id": "pansou_" + encodeURIComponent(url),
                    "vod_name": name,
                    "vod_remarks": remarks,
                    "vod_pic": (it.images && it.images[0]) ? it.images[0] : ""
                });
                if (list.length >= MAX_RESULT) break;
            }
            if (list.length >= MAX_RESULT) break;
        }
        return JSON.stringify({ "list": list, "total": list.length });
    } catch (e) {
        return "{\"list\":[]}";
    }
}

function detail(id) {
    try {
        var url = decodeURIComponent((id + "").replace(/^pansou_/, ""));
        var vod = {
            "vod_id": id,
            "vod_name": "盘搜结果",
            "vod_play_from": "PanSou",
            "vod_play_url": url
        };
        return JSON.stringify({ "list": [vod] });
    } catch (e) {
        return "{\"list\":[]}";
    }
}

function play(flag, id) {
    // id 即资源直链（网盘分享 / 磁力 / 电驴），播放器直接打开或复制
    return JSON.stringify({ "url": id, "parse": 0 });
}
