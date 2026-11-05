// 盘搜 JS 蜘蛛（PanSou 公开接口版 / 重写自 csp_SoAiHaiYinGuard 的盘搜功能）
// 说明：
//   - 原 csp_SoAiHaiYinGuard 是加密 Guard 壳，无法静态提取后端，故改用公开盘搜引擎 PanSou
//     (https://so.252035.xyz) 的 /api/search 接口重写，功能等价（都是网盘资源聚合搜索）。
//   - 走 JS 蜘蛛，任何播放器（Hub/天神/影视仓）都能加载，不依赖 Java jar / Guard 内置类。
//   - 仅供学习研究，链接来自第三方公开索引，可能失效。
// ext 支持：
//   字符串      : 自定义后端地址，如 "https://so.252035.xyz"
//   JSON 字符串 : {"url":"https://so.252035.xyz"}
// 默认后端：https://so.252035.xyz

var SITE = "https://so.252035.xyz";

function init(ext) {
    if (ext && ext.toString().trim().length > 0) {
        try {
            var o = JSON.parse(ext);
            if (o && o.url) { SITE = o.url.replace(/\/+$/, ""); return ""; }
        } catch (e) {}
        SITE = ext.toString().trim().replace(/\/+$/, "");
    }
    return "";
}

var CLOUD_LABELS = {
    "baidu": "百度", "aliyun": "阿里", "quark": "夸克", "guangya": "光亚",
    "tianyi": "天翼", "uc": "UC", "mobile": "移动", "115": "115",
    "pikpak": "PikPak", "xunlei": "迅雷", "123": "123", "magnet": "磁力",
    "ed2k": "电驴"
};

function label(t) { return CLOUD_LABELS[t] || t || "未知"; }

// TVBox 会调用 home；盘搜无首页，返回空列表即可
function home() {
    return "{\"list\":[]}";
}

function search(keyword) {
    try {
        var body = JSON.stringify({ "kw": keyword, "res": "merge", "src": "all", "refresh": false });
        var hdr = { "Content-Type": "application/json" };
        var res = post(SITE + "/api/search", body, hdr);
        var json = JSON.parse(res);
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
                if (list.length >= 60) break;
            }
        }
        return JSON.stringify({ "list": list });
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
    // id 即资源直链（网盘分享/磁力），播放器直接打开/复制
    return JSON.stringify({ "url": id, "parse": 0 });
}
