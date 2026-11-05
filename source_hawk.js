// 全盘搜4K · Hamo JS 版（纯搜索型网盘生产级规范版）
// 纯搜索型：PanSou 后端（quanpan.xyz）聚合搜索，支持夸克/百度/UC/115 四盘分享播放；
// 夸克/百度/115 取链需在环境变量 Cookies 分区填本人 Cookie，UC 免登。

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var UC_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) uc-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch";
var BAIDU_WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
var BAIDU_PLAY_UA = "netdisk;P2SP;2.2.91.136;android-android;";
var BAIDU_APP_VERSION = "12.0.0";
var BAIDU_DEVID = "73CED981D0F186D12BC18CAE1684FFD5|VSRCQTF6W";
var P115_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 115Browser/36.0.0 Chromium/125.0";

var QP_DEFAULT_SITE = "https://quanpan.xyz";
var BRAND_NAME = "全盘搜4K";
var QP_PROVIDERS = ["quark", "baidu", "uc", "115"];
var QP_SEARCH_LIMIT = 300;
var QP_SEARCH_RESULT_CAP = 3;

var PROVIDER_NAMES = {
  quark: "夸克网盘",
  uc: "UC网盘",
  baidu: "百度网盘",
  "115": "115网盘"
};

var SHARE_ROOTS = {
  quark: "https://pan.quark.cn/s/",
  baidu: "https://pan.baidu.com/s/",
  uc: "https://drive.uc.cn/s/",
  "115": "https://115.com/s/"
};

// ---------- 1. 基础工具与 JSCore 原子休眠 ----------

/**
 * 核心避坑 1：原子休眠（彻底杜绝 Can't find variable: setTimeout）
 */
async function sleep(ms) {
  if (typeof $sleep === "function") {
    return await $sleep(ms);
  }
  return new Promise(function(resolve) {
    if (typeof setTimeout !== "undefined") {
      setTimeout(resolve, ms);
    } else {
      var start = Date.now();
      while (Date.now() - start < ms) {}
      resolve();
    }
  });
}

function sha1(s) {
  return $crypto.sha1(String(s || ""));
}

function originOf(u) {
  var m = String(u || "").trim().match(/^(https?:\/\/[^\s\/?#@]+)\/?$/i);
  return m ? m[1] : "";
}

function absUrl(u, site) {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.indexOf("/") === 0) return site + u;
  return site + "/" + u;
}

function toQuery(obj) {
  var keys = Object.keys(obj || {});
  var parts = [];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    parts.push(k + "=" + encodeURIComponent(obj[k]));
  }
  return parts.join("&");
}

function isVideoName(name) {
  return /\.(mp4|mkv|avi|mov|flv|wmv|ts|m2ts|webm|m4v)$/i.test(String(name || ""));
}

function qualityOf(fileName) {
  var n = String(fileName || "");
  if (/(^|[^0-9])2160p?(?![0-9])|(^|[^a-z0-9])4k(?![a-z0-9])|(^|[^a-z0-9])uhd(?![a-z0-9])/i.test(n)) return { label: "4K", rank: 6 };
  if (/(^|[^0-9])1440p?(?![0-9])/.test(n)) return { label: "2K", rank: 5 };
  if (/(^|[^0-9])1080p?(?![0-9])/.test(n)) return { label: "1080p", rank: 4 };
  if (/(^|[^0-9])720p?(?![0-9])/.test(n)) return { label: "720p", rank: 3 };
  if (/(^|[^0-9])480p?(?![0-9])/.test(n)) return { label: "480p", rank: 2 };
  if (/(^|[^0-9])360p?(?![0-9])/.test(n)) return { label: "360p", rank: 1 };
  return { label: "", rank: 0 };
}

function fmtSize(size) {
  var b = Number(size || 0);
  if (!(b > 0)) return "";
  var gb = b / 1024 / 1024 / 1024;
  if (gb >= 1) return gb.toFixed(1) + "GB";
  return Math.max(1, Math.round(b / 1024 / 1024)) + "MB";
}

function partOf(fileName) {
  var m = String(fileName || "").match(/(?:cd|disc|disk|part)[ ._-]*(\d{1,2})(?!\d)/i);
  return m ? Number(m[1]) : 0;
}

function episodeIdentity(fileName) {
  var name = String(fileName || "").replace(/\.[a-z0-9]{2,5}$/i, "");
  var sm = name.match(/s(\d{1,2})[ ._-]*e(\d{1,3})(?!\d)/i);
  if (sm) return { key: "s" + Number(sm[1]) + "e" + Number(sm[2]), season: Number(sm[1]), episode: Number(sm[2]) };
  var season = name.match(/第\s*(\d+)\s*季/);
  var episode = name.match(/第\s*(\d{1,3})\s*[集话]/) || name.match(/(?:^|[^a-z])(?:ep?|episode)[ ._-]*(\d{1,3})(?!\d)/i) || name.match(/^\s*(\d{1,3})(?:$|[ ._\-])/);
  if (episode) return { key: "s" + (season ? Number(season[1]) : 1) + "e" + Number(episode[1]), season: season ? Number(season[1]) : 1, episode: Number(episode[1]) };
  return { key: "name:" + name.toLowerCase().replace(/[\s._\-]+/g, "") };
}

function formatVideoName(fileName, size) {
  if (!fileName) return "视频";
  var q = qualityOf(fileName);
  var s = fmtSize(size);
  if (!q.label && !s) return String(fileName).trim();
  var id = episodeIdentity(fileName);
  var parts = [];
  if (id.episode !== undefined) parts.push("第" + (id.episode < 10 ? "0" : "") + id.episode + "集");
  if (q.label) parts.push(q.label);
  if (s) parts.push(s);
  return parts.join(" · ");
}

function sortFiles(files) {
  var dec = [];
  for (var i = 0; i < files.length; i++) {
    var v = files[i];
    dec.push({ v: v, i: i, id: episodeIdentity(v.file_name), q: qualityOf(v.file_name), part: partOf(v.file_name) });
  }
  dec.sort(function(x, y) {
    var a = x.v, b = y.v, ia = x.id, ib = y.id;
    var aEp = ia.episode !== undefined, bEp = ib.episode !== undefined;
    if (aEp && bEp) {
      if (ia.season !== ib.season || ia.episode !== ib.episode) return ia.season - ib.season || ia.episode - ib.episode;
    } else if (aEp !== bEp) {
      return x.i - y.i;
    }
    if (x.q.rank !== y.q.rank) return y.q.rank - x.q.rank;
    if (x.part !== y.part) return x.part - y.part;
    var sa = Number(a.size || 0), sb = Number(b.size || 0);
    if (sa !== sb) return sb - sa;
    return String(a.file_name).localeCompare(String(b.file_name), "zh-CN", { numeric: true });
  });
  var res = [];
  for (var j = 0; j < dec.length; j++) {
    res.push(dec[j].v);
  }
  return res;
}

/**
 * 核心避坑 2：请求标头去 Ajax 规则（去除 X-Requested-With 避免被 WAF 误判）
 */
async function httpJson(method, url, data, headers, step) {
  var reqHeaders = headers ? Object.assign({}, headers) : {};
  if (reqHeaders["X-Requested-With"]) delete reqHeaders["X-Requested-With"];
  var opts = { headers: reqHeaders, timeout: 15000, responseType: "text" };
  var res;
  if (method === "POST") {
    var postBody = data === undefined ? undefined : (typeof data === "string" ? data : JSON.stringify(data));
    if (typeof data !== "string" && data !== undefined) {
      opts.headers["Content-Type"] = "application/json";
    }
    res = await $http.post(url, postBody, opts);
  } else {
    res = await $http.get(url, opts);
  }
  var status = Number(res.status || 0);
  var json = null;
  try {
    json = JSON.parse(typeof res.data === "string" ? res.data : JSON.stringify(res.data || ""));
  } catch (_) {}

  if (status >= 400) {
    var det = json && (json.code !== undefined || json.message || json.msg) ? " code=" + (json.code !== undefined ? json.code : "-") + " message=" + (json.message || json.msg || "") : "";
    var e = new Error("网盘接口 HTTP " + status + (step ? "（" + step + "）" : "") + det);
    e.status = status;
    if (json && json.code !== undefined) e.apiCode = json.code;
    throw e;
  }
  if (json === null) throw new Error("网盘接口返回异常" + (step ? "（" + step + "）" : ""));
  return { json: json, headers: res.headers || {}, status: status };
}

function setCookieValue(headers, name) {
  var key = Object.keys(headers || {}).find(function(k) { return k.toLowerCase() === "set-cookie"; });
  if (!key) return "";
  var lines = Array.isArray(headers[key]) ? headers[key].join(";") : String(headers[key] || "");
  var m = lines.match(new RegExp("(?:^|[,;]\\s*)" + name + "=([^;,\\s]+)"));
  return m ? m[1] : "";
}

// ---------- 2. 环境变量与主站表单配置契约 ----------

/**
 * 核心避坑 5：配置表单规范 key: "host" 并安全回退
 */
function getHost(context) {
  var custom = (context && context.config && context.config.host) ? String(context.config.host).trim() : "";
  if (custom && custom.indexOf("http") === 0) {
    return custom.replace(/\/+$/, "");
  }
  return QP_DEFAULT_SITE;
}

function envCookie(name) {
  var c = (typeof $env !== "undefined" && $env) ? $env.cookies : null;
  var v = c ? c[name] : null;
  return typeof v === "string" ? v.trim() : "";
}

/**
 * 核心避坑 5：夸克 Cookie 双重兼容
 */
async function quarkCookie(context) {
  var live = await $storage.get("quarkCookieLive", "");
  if (live) return live;
  return envCookie("quark_cookie") || envCookie("quark");
}

async function syncQuarkCookie(resHeaders, baseCookie) {
  var puus = setCookieValue(resHeaders, "__puus");
  if (!puus || !baseCookie) return;
  var cur = baseCookie.match(/(?:^|;)\s*__puus=([^;]+)/);
  if (cur && cur[1] === puus) return;
  var next = baseCookie.split(";").map(function(p) { return p.trim(); }).filter(function(p) { return p && !/^__puus\s*=/.test(p); }).concat("__puus=" + puus).join("; ");
  await $storage.set("quarkCookieLive", next);
}

// ---------- 3. 全盘搜索后端（PanSou）业务逻辑 ----------

async function qpFetchToken(context) {
  var site = getHost(context);
  var res = await $http.get(site + "/api/auth/token", {
    headers: { "User-Agent": UA, Referer: site + "/" },
    timeout: 15000,
    responseType: "text"
  });
  var status = Number(res.status || 0);
  var json = null;
  try {
    json = JSON.parse(typeof res.data === "string" ? res.data : JSON.stringify(res.data || ""));
  } catch (_) {}

  if (status >= 400 || !json || !json.data || !json.data.token) {
    throw new Error("全盘搜索令牌获取失败（HTTP " + status + "）");
  }
  var ttlMs = Number(json.data.ttl_ms || 0);
  var ttlSec = ttlMs > 0 ? Math.floor(ttlMs * 0.8 / 1000) : 600;
  if (ttlSec > 900) ttlSec = 900;
  if (ttlSec < 30) ttlSec = 30;
  var rec = { token: String(json.data.token), expires: Date.now() + ttlSec * 1000 };
  await $cache.set("qpTokenCache", rec, { ttl: ttlSec });
  return rec.token;
}

async function qpToken(context, force) {
  if (!force) {
    var c = await $cache.get("qpTokenCache", null);
    if (c && c.token && Number(c.expires || 0) > Date.now() + 5000) {
      return String(c.token);
    }
  }
  return await qpFetchToken(context);
}

async function qpApi(context, method, path, body) {
  var site = getHost(context);
  var token = await qpToken(context, false);
  for (var attempt = 0; attempt < 2; attempt++) {
    var headers = { "User-Agent": UA, Referer: site + "/", "X-QP-K": token };
    var res;
    if (method === "POST") {
      res = await $http.post(site + path, JSON.stringify(body || {}), {
        headers: Object.assign(headers, { "Content-Type": "application/json" }),
        timeout: 25000,
        responseType: "text"
      });
    } else {
      res = await $http.get(site + path, { headers: headers, timeout: 20000, responseType: "text" });
    }
    var status = Number(res.status || 0);
    if (status === 403 && attempt === 0) {
      token = await qpToken(context, true);
      continue;
    }
    var json = null;
    try {
      json = JSON.parse(typeof res.data === "string" ? res.data : JSON.stringify(res.data || ""));
    } catch (_) {}
    if (status >= 400) throw new Error("全盘搜索接口 HTTP " + status + "（" + path + "）");
    if (!json || (json.code !== undefined && Number(json.code) !== 0)) {
      throw new Error("全盘搜索接口返回异常（" + path + "）" + (json && json.message ? "：" + json.message : ""));
    }
    return json.data;
  }
  throw new Error("全盘搜索接口鉴权失败（" + path + "）");
}

function qpCleanNote(note) {
  return String(note || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function qpShareId(provider, url) {
  var u = String(url || "");
  var m = u.match(/\/s\/([^/?&#]+)/);
  if (m) return m[1];
  var m2 = u.match(/[?&]surl=([^&#]+)/);
  if (m2) return m2[1];
  return "";
}

function qpPasscode(entry) {
  var p = String(entry.password || entry.passcode || entry.pwd || "").trim();
  if (p) return p;
  var m = String(entry.url || "").match(/[?&](?:pwd|password|passcode)=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

function qpDateText(dt) {
  var s = String(dt || "").trim();
  if (!s) return "";
  var m = s.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : s.slice(0, 16);
}

async function qpSearch(context, kw) {
  var data = await qpApi(context, "POST", "/api/search", { kw: kw, res: "merge", src: "all" });
  var merged = (data && data.merged_by_type) || {};
  var seen = {};
  var perProvider = {};
  var rawSupported = 0, rawTotal = 0, unsupported = 0;

  var keys = Object.keys(merged);
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var arr = Array.isArray(merged[key]) ? merged[key] : [];
    rawTotal += arr.length;
    if (QP_PROVIDERS.indexOf(key) === -1) {
      unsupported += arr.length;
      continue;
    }
    rawSupported += arr.length;
    var list = [];
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      var shareId = qpShareId(key, e && e.url);
      if (!shareId) continue;
      var dedup = key + ":" + shareId;
      if (seen[dedup]) continue;
      seen[dedup] = true;

      var note = qpCleanNote(e.note);
      var passcode = qpPasscode(e);
      var dt = qpDateText(e.datetime);
      var statusText = (PROVIDER_NAMES[key] || key) + (dt ? (" · " + dt) : "");

      var item = {
        id: key + "-" + shareId,
        title: note || ((PROVIDER_NAMES[key] || key) + "分享"),
        summary: "",
        status: statusText,
        ref: {
          provider: key,
          shareId: shareId,
          passcode: passcode,
          note: note,
          source: String(e.source || ""),
          url: String(e.url || "")
        }
      };
      list.push(item);
    }
    perProvider[key] = list;
  }

  // 四盘轮转合并：避免单一大盘将其他盘挤出上限之外
  var items = [];
  var queues = [];
  for (var p = 0; p < QP_PROVIDERS.length; p++) {
    queues.push(perProvider[QP_PROVIDERS[p]] || []);
  }

  var progressed = true;
  while (items.length < QP_SEARCH_LIMIT && progressed) {
    progressed = false;
    for (var q = 0; q < queues.length; q++) {
      if (items.length >= QP_SEARCH_LIMIT) break;
      if (queues[q].length) {
        items.push(queues[q].shift());
        progressed = true;
      }
    }
  }

  var restCount = 0;
  for (var r = 0; r < QP_PROVIDERS.length; r++) {
    restCount += (perProvider[QP_PROVIDERS[r]] || []).length;
  }
  var totalSupported = restCount + items.length;

  return {
    items: items,
    truncated: totalSupported > items.length,
    rawSupported: rawSupported,
    rawTotal: rawTotal,
    unsupported: unsupported,
    backendTotal: (data && data.total != null) ? Number(data.total) : rawTotal
  };
}

// ---------- 4. 搜索结果整形（相关性过滤＋去重＋封顶） ----------

var CN_DIGITS = { "一": "1", "二": "2", "两": "2", "三": "3", "四": "4", "五": "5", "六": "6", "七": "7", "八": "8", "九": "9" };

function coreNorm(s) {
  return String(s || "").replace(/[一二两三四五六七八九]/g, function(ch) {
    return CN_DIGITS[ch] || ch;
  }).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function stripBracketGroups(s) {
  return String(s || "").replace(/【[^】]*】/g, " ").replace(/\[[^\]]*\]/g, " ").replace(/（[^）]*）/g, " ").replace(/\([^)]*\)/g, " ");
}

function matchCoreOf(text) {
  return coreNorm(stripBracketGroups(text)) || coreNorm(text);
}

function matchTierOf(queryCore, titleCore) {
  if (!queryCore || !titleCore) return -1;
  if (titleCore === queryCore) return 0;
  if (titleCore.indexOf(queryCore) === 0) return 1;
  if (titleCore.indexOf(queryCore) !== -1) return 2;
  if (titleCore.length >= 2 && queryCore.indexOf(titleCore) !== -1) return 3;
  return -1;
}

function titleTierOf(queryCore, note) {
  var t1 = matchTierOf(queryCore, coreNorm(stripBracketGroups(note)));
  var t2 = matchTierOf(queryCore, coreNorm(note));
  var validTiers = [];
  if (t1 >= 0) validTiers.push(t1);
  if (t2 >= 0) validTiers.push(t2);
  return validTiers.length ? Math.min.apply(null, validTiers) : -1;
}

function shapeSearchItems(keyword, items) {
  var q = matchCoreOf(keyword);
  var seen = {};
  var kept = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var key = it.ref.provider + "-" + it.ref.shareId;
    if (seen[key]) continue;
    seen[key] = true;

    var tier = titleTierOf(q, it.ref.note || it.title);
    if (tier < 0) continue;
    kept.push({ it: it, tier: tier, ord: i });
  }

  kept.sort(function(a, b) {
    return (a.tier - b.tier) || (a.ord - b.ord);
  });

  var sliced = kept.slice(0, QP_SEARCH_RESULT_CAP);
  var res = [];
  for (var j = 0; j < sliced.length; j++) {
    res.push(sliced[j].it);
  }
  return res;
}

// ---------- 5. 核心入口：home / search ----------

async function home(params, context) {
  try {
    var data = await qpApi(context, "GET", "/api/hot-realtime");
    var list = (data && Array.isArray(data.list)) ? data.list : [];
    var items = [];
    var seen = {};

    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var kw = typeof e === "string" ? e.trim() : String((e && (e.keyword || e.word || e.title || e.name || e.kw)) || "").trim();
      if (!kw || seen[kw]) continue;
      seen[kw] = true;

      var heat = (e && typeof e === "object") ? (e.heat || e.hot || e.count || e.score) : null;
      var statusText = heat != null && heat !== "" ? ("热度 " + heat) : (BRAND_NAME + " · 实时热搜");

      items.push({
        id: "hot-" + sha1(kw).slice(0, 16),
        title: kw,
        summary: "",
        status: statusText,
        ref: { keyword: kw }
      });
    }

    if (items.length) {
      return { categories: [], items: items };
    }
  } catch (_) {}

  return {
    categories: [],
    items: [{
      id: "guide",
      title: "全盘搜索：输入片名开始全网 4K 搜索",
      summary: "",
      status: BRAND_NAME,
      ref: {}
    }]
  };
}

async function search(params, context) {
  var kw = String((params && params.keyword) || "").trim();
  var page = Math.max(1, Number((params && params.page) || 1));
  if (!kw || page > 1) return { items: [], page: page };

  var r = await qpSearch(context, kw);
  var shaped = shapeSearchItems(kw, r.items);
  return { items: shaped, page: page };
}

// ---------- 6. 分享目录（四盘） ----------

function quarkHeaders(cookie) {
  return { "User-Agent": UA, "Cookie": cookie || "", Referer: "https://pan.quark.cn/" };
}

function quarkStoken(v) {
  return typeof v === "string" && /^[A-Za-z0-9+\/_-]+={0,2}$/.test(v) ? v.replace(/\+/g, "-").replace(/\//g, "_") : v;
}

async function quarkToken(shareId, passcode, cookie) {
  var res = await httpJson("POST", "https://drive-h.quark.cn/1/clouddrive/share/sharepage/token?pr=ucpro&fr=pc&uc_param_str=", { pwd_id: shareId, passcode: passcode || "" }, quarkHeaders(cookie));
  await syncQuarkCookie(res.headers, cookie);
  if (res.json && res.json.status === 200 && res.json.data && res.json.data.stoken) {
    return res.json.data.stoken;
  }
  throw new Error("夸克分享令牌获取失败");
}

async function quarkCatalog(share, cookie) {
  var stoken = await quarkToken(share.shareId, share.passcode, cookie);
  var list = [], seen = {};
  var queue = ["0"];
  var guard = 0;
  while (queue.length && guard++ < 60) {
    var pdir = queue.shift();
    for (var page = 1; page <= 20; page++) {
      var q = toQuery({ pr: "ucpro", fr: "pc", uc_param_str: "", ver: "2", pwd_id: share.shareId, stoken: quarkStoken(stoken), pdir_fid: pdir, force: "0", _page: page, _size: 200, _fetch_total: 1, _sort: "file_type:asc,file_name:asc" });
      var res = await httpJson("GET", "https://drive-h.quark.cn/1/clouddrive/share/sharepage/detail?" + q, null, quarkHeaders(cookie));
      await syncQuarkCookie(res.headers, cookie);
      if (!res.json || !res.json.data || !Array.isArray(res.json.data.list)) throw new Error("夸克目录读取失败");
      var items = res.json.data.list;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.dir) { queue.push(it.fid); continue; }
        if (seen[String(it.fid)]) continue;
        if (!(it.obj_category === "video" || String(it.category) === "1" || isVideoName(it.file_name))) continue;
        seen[String(it.fid)] = true;
        list.push({ fid: it.fid, file_name: it.file_name, size: it.size, share_fid_token: it.share_fid_token || "", pdir_fid: it.pdir_fid == null ? pdir : it.pdir_fid, shareId: share.shareId, passcode: share.passcode || "", stoken: stoken });
      }
      var total = res.json.data.total != null ? Number(res.json.data.total) : (res.json.metadata && res.json.metadata._total != null ? Number(res.json.metadata._total) : null);
      if (items.length < 200 || (total !== null && page * 200 >= total)) break;
    }
  }
  return list;
}

function ucHeaders() {
  return { "User-Agent": UC_UA, Referer: "https://drive.uc.cn" };
}

async function ucApi(path, data) {
  var res = await httpJson(data ? "POST" : "GET", "https://pc-api.uc.cn/1/clouddrive/" + path, data, ucHeaders());
  if (!res.json || (res.json.status && res.json.status !== 200) || (res.json.code && res.json.code !== 0)) throw new Error("UC 分享请求失败");
  return res.json.data;
}

async function ucCatalog(share) {
  var data = await ucApi("share/sharepage/token?pr=UCBrowser&fr=pc", { pwd_id: share.shareId, passcode: share.passcode || "" });
  if (!data || !data.stoken) throw new Error("UC 分享失效或提取码错误");
  var stoken = data.stoken;
  var list = [], seen = {};
  var queue = ["0"];
  var guard = 0;
  while (queue.length && guard++ < 60) {
    var pdir = queue.shift();
    for (var page = 1; page <= 30; page++) {
      var d = await ucApi("share/sharepage/detail?" + toQuery({ pr: "UCBrowser", fr: "pc", pwd_id: share.shareId, stoken: stoken, pdir_fid: pdir, force: 0, _page: page, _size: 100, _fetch_total: 1, _sort: "file_type:asc,file_name:asc" }), null);
      if (!d || !Array.isArray(d.list)) throw new Error("UC 目录读取失败");
      for (var i = 0; i < d.list.length; i++) {
        var it = d.list[i];
        if (it.dir) { queue.push(it.fid); continue; }
        if (seen[String(it.fid)]) continue;
        if (!(it.obj_category === "video" || String(it.category) === "1" || isVideoName(it.file_name))) continue;
        seen[String(it.fid)] = true;
        list.push({ fid: it.fid, file_name: it.file_name, size: it.size, share_fid_token: it.share_fid_token || "", pdir_fid: it.pdir_fid == null ? pdir : it.pdir_fid, shareId: share.shareId, passcode: share.passcode || "", stoken: stoken });
      }
      var total = d.total != null ? Number(d.total) : (d.metadata && d.metadata._total != null ? Number(d.metadata._total) : null);
      if (d.list.length < 100 || (total !== null && page * 100 >= total)) break;
    }
  }
  return list;
}

function baiduShortId(shareId) {
  return shareId.charAt(0) === "1" ? shareId.slice(1) : shareId;
}

function baiduBaseCookie(cookie) {
  return String(cookie || "").split(";").map(function(p) { return p.trim(); }).filter(function(p) { return p && !/^BDCLND\s*=/i.test(p); }).join("; ");
}

function baiduHeaders(cookie, randsk, shareUrl) {
  var ck = baiduBaseCookie(cookie);
  if (randsk) ck += "; BDCLND=" + randsk;
  return { "User-Agent": BAIDU_WEB_UA, Cookie: ck, Referer: shareUrl || "https://pan.baidu.com/" };
}

async function baiduVerify(share, cookie) {
  var res = await httpJson("POST", "https://pan.baidu.com/share/verify?" + toQuery({ surl: baiduShortId(share.shareId), pwd: share.passcode || "" }), toQuery({ pwd: share.passcode || "", vcode: "", vcode_str: "" }), Object.assign(baiduHeaders(cookie, "", share.url), { "Content-Type": "application/x-www-form-urlencoded" }));
  if (!res.json || Number(res.json.errno) !== 0 || !res.json.randsk) throw new Error("百度提取码验证失败或需要验证码");
  return res.json.randsk;
}

async function baiduListPage(share, cookie, randsk, extra) {
  var res = await httpJson("GET", "https://pan.baidu.com/share/list?" + toQuery(extra), null, baiduHeaders(cookie, randsk, share.url));
  return res.json;
}

async function baiduCatalog(share, cookie) {
  var randsk = await baiduVerify(share, cookie);
  var list = [], seen = {};
  var uk = "", shareid = "";
  var queue = [null];
  var guard = 0;
  while (queue.length && guard++ < 60) {
    var dir = queue.shift();
    for (var page = 1; page <= 30; page++) {
      var params = { app_id: 250528, web: 1, channel: "chunlei", view_mode: 1, showempty: 0, page: page, num: dir === null ? 20 : 100, order: dir === null ? "time" : "name", desc: dir === null ? 1 : 0 };
      if (dir === null) {
        Object.assign(params, { root: 1, clienttype: 0, shorturl: baiduShortId(share.shareId) });
      } else {
        Object.assign(params, { dir: dir, uk: uk, shareid: shareid, is_from_web: true });
      }
      var json = await baiduListPage(share, cookie, randsk, params);
      if (json && Number(json.errno) === -9) {
        randsk = await baiduVerify(share, cookie);
        json = await baiduListPage(share, cookie, randsk, params);
      }
      if (!json || Number(json.errno) !== 0 || !Array.isArray(json.list)) throw new Error("百度目录读取失败，请检查 Cookie、分享或验证码");
      if (dir === null) {
        uk = json.uk || uk;
        shareid = json.share_id || json.shareid || shareid;
      }
      for (var i = 0; i < json.list.length; i++) {
        var it = json.list[i];
        if (Number(it.isdir) === 1 || String(it.category) === "6") {
          if (it.path) queue.push(it.path);
          continue;
        }
        var fid = String(it.fs_id || it.fsid || it.path);
        if (seen[fid]) continue;
        if (!isVideoName(it.server_filename)) continue;
        seen[fid] = true;
        list.push({ fid: fid, file_name: it.server_filename, size: it.size, path: it.path, uk: uk, shareid: shareid, shareId: share.shareId, passcode: share.passcode || "" });
      }
      if (json.list.length < (dir === null ? 20 : 100)) break;
    }
  }
  return list;
}

function headers115(cookie) {
  var h = { "User-Agent": P115_UA, Referer: "https://115.com/" };
  if (cookie) h.Cookie = cookie;
  return h;
}

async function p115Catalog(share, cookie) {
  var list = [], seen = {};
  var queue = [""];
  var guard = 0;
  while (queue.length && guard++ < 60) {
    var cid = queue.shift();
    for (var offset = 0; offset < 10000;) {
      var res = await httpJson("GET", "https://webapi.115.com/share/snap?" + toQuery({ share_code: share.shareId, receive_code: share.passcode || "", cid, limit: 200, offset }), null, headers115(cookie));
      if (!res.json || !res.json.state || !res.json.data || !Array.isArray(res.json.data.list)) throw new Error("115 分享读取失败，检查提取码或登录状态");
      var items = res.json.data.list;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (Number(it.fc) === 0) { queue.push(it.cid); continue; }
        var key = String(it.fc) + ":" + String(it.fid || it.cid);
        if (seen[key]) continue;
        if (!(Number(it.fc) === 1 && isVideoName(it.n))) continue;
        seen[key] = true;
        list.push({ fid: String(it.fid), file_name: it.n, size: Number(it.s || 0), cid: cid, shareId: share.shareId, passcode: share.passcode || "" });
      }
      offset += items.length;
      var total = res.json.data.count == null ? null : Number(res.json.data.count);
      if (!items.length || (total !== null && offset >= total)) break;
    }
  }
  return list;
}

async function getCatalog(context, share) {
  var cookie = share.provider === "quark" ? await quarkCookie(context) : share.provider === "baidu" ? envCookie("baidu_cookie") : share.provider === "115" ? envCookie("pan115_cookie") : "";
  var key = "cat:" + share.provider + ":" + share.shareId + ":" + (share.passcode || "") + ":" + sha1(cookie || "").slice(0, 8);
  var hit = await $cache.get(key, null);
  if (hit) return hit;

  var list = [];
  if (share.provider === "quark") list = await quarkCatalog(share, cookie);
  else if (share.provider === "uc") list = await ucCatalog(share);
  else if (share.provider === "baidu") list = await baiduCatalog(share, cookie);
  else list = await p115Catalog(share, cookie);

  if (list && list.length) await $cache.set(key, list, { ttl: 600 });
  return list;
}

// ---------- 7. 详情解析 (detail) ----------

function qpEpisodes(provider, files) {
  var sorted = sortFiles(files);
  var eps = [];
  for (var i = 0; i < sorted.length; i++) {
    var v = sorted[i];
    eps.push({
      id: provider + "-" + v.fid,
      name: formatVideoName(v.file_name, v.size),
      ref: Object.assign({ provider: provider }, v)
    });
  }
  return eps;
}

async function detail(params, context) {
  var ref = (params && params.ref) ? params.ref : {};
  var itemId = String((params && params.itemId) || "");

  // (b) 热搜条目：内部搜索后每盘前 3 个分享并行装配
  if (ref.keyword) {
    var kw = String(ref.keyword);
    var r = await qpSearch(context, kw);
    var byProvider = {};
    for (var i = 0; i < r.items.length; i++) {
      var it = r.items[i];
      var p = it.ref.provider;
      if (!byProvider[p]) byProvider[p] = [];
      if (byProvider[p].length < 3) byProvider[p].push(it);
    }

    var picks = [];
    for (var j = 0; j < QP_PROVIDERS.length; j++) {
      var list = byProvider[QP_PROVIDERS[j]] || [];
      for (var l = 0; l < list.length; l++) {
        picks.push(list[l]);
      }
    }

    var notes = [];
    var sourcesData = [];
    await Promise.all(picks.map(function(itemObj) {
      return (async function() {
        var share = {
          provider: itemObj.ref.provider,
          shareId: itemObj.ref.shareId,
          passcode: itemObj.ref.passcode || "",
          url: itemObj.ref.url || (SHARE_ROOTS[itemObj.ref.provider] + itemObj.ref.shareId)
        };
        try {
          var files = await getCatalog(context, share);
          if (!files.length) {
            notes.push((PROVIDER_NAMES[itemObj.ref.provider] || itemObj.ref.provider) + " 分享「" + itemObj.title.slice(0, 20) + "」内未发现视频文件");
            return;
          }
          sourcesData.push({ it: itemObj, files: files });
        } catch (e) {
          notes.push((PROVIDER_NAMES[itemObj.ref.provider] || itemObj.ref.provider) + " 分享「" + itemObj.title.slice(0, 20) + "」目录读取失败：" + (e.message || e));
        }
      })();
    }));

    if (!sourcesData.length) {
      throw new Error("热搜「" + kw + "」的分享目录全部读取失败" + (notes.length ? ("：" + notes.join("；")) : ""));
    }

    sourcesData.sort(function(a, b) {
      return QP_PROVIDERS.indexOf(a.it.ref.provider) - QP_PROVIDERS.indexOf(b.it.ref.provider);
    });

    var outSources = [];
    for (var sIdx = 0; sIdx < sourcesData.length; sIdx++) {
      var s = sourcesData[sIdx];
      outSources.push({
        id: s.it.ref.provider + "-" + s.it.ref.shareId,
        name: "🌸 " + (PROVIDER_NAMES[s.it.ref.provider] || s.it.ref.provider) + " · " + (s.it.title.length > 24 ? (s.it.title.slice(0, 24) + "…") : s.it.title),
        episodes: qpEpisodes(s.it.ref.provider, s.files)
      });
    }

    var summaryParts = [
      "🌸 全盘搜4K · 实时热搜聚合专线",
      "当前后端: " + getHost(context),
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "共找到 " + r.rawSupported + " 个受支持分享（夸克/百度/UC/115），已展示每盘前 3 个"
    ];
    if (r.unsupported) summaryParts.push("另有 " + r.unsupported + " 条不支持的网盘结果已过滤");
    for (var n = 0; n < notes.length; n++) {
      summaryParts.push(notes[n]);
    }

    return {
      id: itemId || ("hot-" + sha1(kw).slice(0, 16)),
      title: kw,
      summary: summaryParts.join("\n"),
      status: BRAND_NAME,
      actors: [BRAND_NAME],
      genres: ["网盘搜索", "4K原盘"],
      sources: outSources,
      mediaType: "tv"
    };
  }

  // (a) 搜索结果条目：单个分享目录
  if (ref.shareId && ref.provider) {
    var provider = String(ref.provider);
    var share = {
      provider: provider,
      shareId: String(ref.shareId),
      passcode: ref.passcode || "",
      url: ref.url || (SHARE_ROOTS[provider] + ref.shareId)
    };
    var listFiles = await getCatalog(context, share);
    var title = qpCleanNote(ref.note) || String(params.itemTitle || "").trim() || ((PROVIDER_NAMES[provider] || provider) + "分享");

    var summaryParts2 = [
      "🌸 全盘搜4K · 单条网盘分享详情",
      "当前后端: " + getHost(context),
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    ];
    if (ref.note) summaryParts2.push(qpCleanNote(ref.note));
    if (ref.source) summaryParts2.push("来源: " + ref.source);
    summaryParts2.push(listFiles.length ? ("共 " + listFiles.length + " 个视频文件") : "该分享内未发现视频文件");

    var singleSources = listFiles.length ? [{
      id: provider,
      name: "🌸 " + (PROVIDER_NAMES[provider] || provider),
      episodes: qpEpisodes(provider, listFiles)
    }] : [];

    return {
      id: itemId || (provider + "-" + ref.shareId),
      title: title,
      summary: summaryParts2.join("\n"),
      status: BRAND_NAME,
      actors: [BRAND_NAME],
      genres: ["网盘搜索", "4K原盘"],
      sources: singleSources,
      mediaType: "tv"
    };
  }

  return {
    id: itemId || "guide",
    title: "全盘搜索：输入片名开始全网 4K 搜索",
    summary: "🌸 全盘搜4K 输入片名开始搜索：\n在首页热搜点一部，或用搜索找片名，再从分享里选集播放。\n夸克/百度/115 播放需先在模块首页环境变量的 Cookies 分区填写对应 Cookie，UC 免登。",
    status: BRAND_NAME,
    actors: [BRAND_NAME],
    genres: ["网盘搜索", "4K原盘"],
    sources: [],
    mediaType: "tv"
  };
}

// ---------- 8. 网盘直链解析 (resolve) ----------

async function resolveUc(ref) {
  var v = ref;
  var download = async function(video) {
    var data = await ucApi("file/download?pr=UCBrowser&fr=pc", { fids: [video.fid], fids_token: [video.share_fid_token], pwd_id: video.shareId, stoken: video.stoken, speedup_session: "" });
    var arr = Array.isArray(data) ? data : [data];
    return arr.find(function(x) { return x && String(x.fid) === String(video.fid); }) || (arr.length === 1 && arr[0] && !arr[0].fid ? arr[0] : null);
  };

  var item = null;
  if (v.stoken && v.share_fid_token) {
    try { item = await download(v); } catch (_) {}
  }
  if (!item || !item.download_url) {
    var list = await ucCatalog({ provider: "uc", shareId: v.shareId, passcode: v.passcode || "", url: SHARE_ROOTS.uc + v.shareId });
    var fresh = list.find(function(x) { return String(x.fid) === String(v.fid); });
    if (!fresh) throw new Error("UC 分享文件已失效，请重新打开详情");
    item = await download(fresh);
  }
  if (!item || !/^https?:\/\//i.test(item.download_url || "")) throw new Error("UC 免登下载地址获取失败");
  var url = item.download_url;
  return {
    url: url,
    headers: { "User-Agent": UC_UA, Referer: url + "\\", "Accept-Encoding": "identity" },
    type: "direct",
    format: /\.m3u8(\?|$)/i.test(url) ? "hls" : "file"
  };
}

async function quarkFolderFid(cookie) {
  var q = "pr=ucpro&fr=pc&uc_param_str=";
  var res = await httpJson("GET", "https://drive-pc.quark.cn/1/clouddrive/file/sort?" + q + "&pdir_fid=0&_page=1&_size=50&_fetch_total=1&_fetch_sub_dirs=0&_sort=file_type:asc,updated_at:desc&fetch_all_file=1&fetch_risk_file_name=1", null, quarkHeaders(cookie));
  await syncQuarkCookie(res.headers, cookie);
  var list = (res.json && res.json.data && res.json.data.list) || [];
  var folder = list.find(function(x) { return x.dir && x.file_name === "ftv-cache"; });
  if (folder) return folder.fid;
  var created = await httpJson("POST", "https://drive-pc.quark.cn/1/clouddrive/file?" + q, { pdir_fid: "0", file_name: "ftv-cache", dir_path: "", dir_init_lock: false }, quarkHeaders(cookie));
  await syncQuarkCookie(created.headers, cookie);
  if (created.json && created.json.status === 200 && created.json.code === 0 && created.json.data) return created.json.data.fid;
  return "0";
}

async function quarkSave(ref, cookie) {
  var toFid = await quarkFolderFid(cookie);
  if (!toFid || toFid === "0") throw new Error("夸克缓存文件夹创建失败");
  var base = "https://drive-h.quark.cn/1/clouddrive/";
  var q = "pr=ucpro&fr=pc&uc_param_str=";
  var stoken = ref.stoken || "";
  if (!stoken) stoken = await quarkToken(ref.shareId, ref.passcode, cookie);
  var body = { fid_list: [ref.fid], fid_token_list: [ref.share_fid_token], pdir_fid: ref.pdir_fid || "0", pwd_id: ref.shareId, scene: "link", stoken: quarkStoken(stoken), to_pdir_fid: toFid };

  var okRes = function(j) { return !!j && (j.code == null || Number(j.code) === 0) && (j.status == null || Number(j.status) === 200); };
  var savedFid = function(j) {
    var data = j && j.data;
    var list = [data, data && data.task_resp && data.task_resp.data];
    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      var saved = entry && entry.save_as;
      var fids = saved && (saved.save_as_top_fids || saved.save_as_select_top_fids);
      if (Array.isArray(fids) && fids.length) return String(fids[0]);
    }
    return "";
  };

  var res = await httpJson("POST", base + "share/sharepage/save?" + q, body, quarkHeaders(cookie));
  await syncQuarkCookie(res.headers, cookie);
  if (!okRes(res.json)) throw new Error("夸克转存失败，请检查 Cookie 或分享状态");
  var immediate = savedFid(res.json);
  if (immediate) return immediate;

  var taskId = res.json.data && res.json.data.task_id;
  if (!taskId) throw new Error("夸克转存任务异常");

  for (var i = 0; i < 6; i++) {
    var t = await httpJson("GET", base + "task?" + q + "&task_id=" + encodeURIComponent(String(taskId)) + "&retry_index=" + i, null, quarkHeaders(cookie));
    await syncQuarkCookie(t.headers, cookie);
    if (!okRes(t.json)) break;
    var fid = savedFid(t.json);
    if (fid) return fid;
    if (i < 5) await sleep(1000); // 核心避坑 1：原子休眠
  }
  throw new Error("夸克转存超时，请重试");
}

async function quarkOrigin(myFid, cookie) {
  var base = "https://drive-pc.quark.cn/1/clouddrive/";
  var flush = await httpJson("GET", base + "auth/pc/flush?pr=ucpro&fr=pc&sys=win32&ve=3.1.8", null, quarkHeaders(cookie), "夸克原画鉴权");
  var fj = flush.json;
  await syncQuarkCookie(flush.headers, cookie);
  if (!fj || (fj.code != null && Number(fj.code) !== 0) || (fj.status != null && Number(fj.status) !== 200)) {
    var e = new Error("夸克原画鉴权失败");
    e.code = "QUALITY_UNAVAILABLE";
    throw e;
  }
  var dl;
  try {
    dl = await httpJson("POST", base + "file/download?pr=ucpro&fr=pc&uc_param_str=", { fids: [String(myFid)] }, quarkHeaders(cookie), "夸克原画下载");
  } catch (err) {
    if (err.status === 403) err.code = "ORIGIN_ACCESS_DENIED";
    else if (err.status === 400) err.code = "QUALITY_UNAVAILABLE";
    throw err;
  }
  var json = dl.json;
  if (Number(json && json.code) === 23018) {
    var e2 = new Error("夸克原画被拒绝 code=23018");
    e2.code = "ORIGIN_ACCESS_DENIED";
    throw e2;
  }
  if (!json || (json.code != null && Number(json.code) !== 0) || (json.status != null && Number(json.status) !== 200)) {
    var e3 = new Error("夸克原画下载失败");
    e3.code = "QUALITY_UNAVAILABLE";
    throw e3;
  }
  var list = Array.isArray(json.data) ? json.data : [];
  var item = list.find(function(v) { return v && (!v.fid || String(v.fid) === String(myFid)); });
  if (!item || !/^https?:\/\//i.test(item.download_url || "")) {
    var e4 = new Error("夸克原画地址为空");
    e4.code = "QUALITY_UNAVAILABLE";
    throw e4;
  }
  await syncQuarkCookie(dl.headers, cookie);
  return item.download_url;
}

async function resolveQuark(context, ref) {
  var cookie = await quarkCookie(context);
  if (!cookie) throw new Error("请先在模块首页的环境变量（Cookies 分区 quark_cookie 或 quark）中填写夸克 Cookie 后再播放");
  var cacheKey = "qsave:" + ref.shareId + ":" + ref.fid;
  var myFid = await $cache.get(cacheKey, "");
  if (!myFid) {
    myFid = await quarkSave(ref, cookie);
    await $cache.set(cacheKey, myFid, { ttl: 2592000 });
  }

  var originErr = null;
  try {
    var ourl = await quarkOrigin(myFid, cookie);
    var oh = { "User-Agent": UA, Cookie: cookie, Referer: "https://pan.quark.cn/" };
    return { url: ourl, headers: oh, type: "direct", format: "auto", variants: [{ id: "origin", label: "原画", url: ourl, headers: oh }] };
  } catch (e) {
    if (e.code !== "ORIGIN_ACCESS_DENIED" && e.code !== "QUALITY_UNAVAILABLE") throw e;
    originErr = e;
  }

  var play = async function(fid) {
    var res = await httpJson("POST", "https://drive-pc.quark.cn/1/clouddrive/file/v2/play?pr=ucpro&fr=pc&uc_param_str=", { fid: fid, resolutions: "normal,low,high,super,2k,4k" }, quarkHeaders(cookie));
    await syncQuarkCookie(res.headers, cookie);
    return res.json && res.json.status === 200 && res.json.code === 0 && res.json.data ? (res.json.data.video_list || []) : [];
  };

  var arr = [];
  try {
    arr = await play(myFid);
  } catch (e) {
    if (originErr) throw new Error(originErr.message + "；转码play：" + e.message);
    throw e;
  }

  if (!arr.length) {
    await $cache.delete(cacheKey);
    myFid = await quarkSave(ref, cookie);
    await $cache.set(cacheKey, myFid, { ttl: 2592000 });
    try {
      arr = await play(myFid);
    } catch (e2) {
      if (originErr) throw new Error(originErr.message + "；转码play：" + e2.message);
      throw e2;
    }
  }

  var variants = arr.map(function(v) {
    return {
      id: String(v.resolution || "auto"),
      label: String(v.resolution || "自动"),
      url: v.video_info && v.video_info.url,
      headers: { "User-Agent": UA, Cookie: cookie, Referer: "https://pan.quark.cn/" }
    };
  }).filter(function(v) { return !!v.url; });

  if (!variants.length) throw new Error(originErr ? originErr.message + "；转码play：夸克播放地址获取失败" : "夸克播放地址获取失败");
  var best = variants.find(function(v) { return v.id === "4k"; }) || variants.find(function(v) { return v.id === "2k"; }) || variants[0];
  return { url: best.url, headers: { "User-Agent": UA, Cookie: cookie, Referer: "https://pan.quark.cn/" }, type: "direct", format: "hls", variants: variants };
}

async function resolveBaidu(context, ref) {
  var cookie = envCookie("baidu_cookie");
  if (!cookie) throw new Error("请先在模块首页的环境变量（Cookies 分区 baidu_cookie）中填写百度 Cookie 后再播放");
  var bdussM = baiduBaseCookie(cookie).match(/(?:^|;)\s*BDUSS=([^;]+)/);
  if (!bdussM) throw new Error("百度 Cookie 缺少 BDUSS");
  if (!ref.shareid || !ref.uk || !ref.fid) throw new Error("百度分享文件信息不完整，请重新打开详情");

  var share = { shareId: ref.shareId, passcode: ref.passcode || "", url: SHARE_ROOTS.baidu + ref.shareId };
  var randsk = await baiduVerify(share, cookie);
  var uid = await $cache.get("bauid:" + sha1(bdussM[1]).slice(0, 12), "");
  if (!uid) {
    try {
      var infoRes = await httpJson("GET", "https://mbd.baidu.com/userx/v1/info/get?" + toQuery({ appname: "baiduboxapp", fields: '["bg_image","member","uid","avatar","avatar_member"]', client: "", clientfrom: "", lang: "zh-cn", tpl: "", ttt: "" }), null, baiduHeaders(cookie, randsk, share.url));
      uid = (infoRes.json && infoRes.json.data && infoRes.json.data.fields && infoRes.json.data.fields.uid) || "";
    } catch (_) {}
    if (!uid) uid = "default_uid";
    await $cache.set("bauid:" + sha1(bdussM[1]).slice(0, 12), uid, { ttl: 86400 });
  }

  var requestDlink = async function() {
    var sekey = randsk;
    try { sekey = decodeURIComponent(randsk); } catch (_) {}
    var time = String(Date.now());
    var rand = sha1(sha1(bdussM[1]) + uid + "ebrcUYiuxaZv2XGu7KIYKxUrqfnOfpDF" + time + BAIDU_DEVID + BAIDU_APP_VERSION + "ae5821440fab5e1a61a025f014bd8972");
    var res = await httpJson("GET", "https://pan.baidu.com/share/list?" + toQuery({ shareid: ref.shareid, uk: ref.uk, fid: ref.fid, sekey, origin: "dlna", devuid: BAIDU_DEVID, clienttype: 1, channel: "android_12_zhao_bd-netdisk_1024266h", version: BAIDU_APP_VERSION, time, rand }), null, Object.assign(baiduHeaders(cookie, randsk, share.url), { "User-Agent": BAIDU_PLAY_UA, Referer: "https://pan.baidu.com/" }));
    return res.json;
  };

  var json = await requestDlink();
  if (json && Number(json.errno) === -9) {
    randsk = await baiduVerify(share, cookie);
    json = await requestDlink();
  }
  var items = (json && (Array.isArray(json.list) ? json.list : Array.isArray(json.info) ? json.info : [])) || [];
  var fileId = function(f) { return f && (f.fs_id || f.fsid || f.fid); };
  var item = items.find(function(f) { return String(fileId(f)) === String(ref.fid); }) || (items.length === 1 && !fileId(items[0]) ? items[0] : null);

  if (!json || Number(json.errno) !== 0 || !item || !/^https?:\/\//i.test(item.dlink || "")) {
    throw new Error("百度直链获取失败" + (json && json.errno != null ? "（errno " + json.errno + "）" : ""));
  }
  return {
    url: item.dlink.replace(/\|/g, "%7C"),
    headers: { "User-Agent": BAIDU_PLAY_UA, Referer: "https://pan.baidu.com/" },
    type: "direct",
    format: "file"
  };
}

async function resolve115(context, ref) {
  var cookie = envCookie("pan115_cookie");
  if (!cookie) throw new Error("请先在模块首页的环境变量（Cookies 分区 pan115_cookie）中填写 115 Cookie 后再播放");
  if (!ref.shareId || !ref.fid) throw new Error("115 分享文件信息缺失，请重新打开详情");

  var encoded = p115Encrypt(JSON.stringify({ share_code: ref.shareId, receive_code: ref.passcode || "", file_id: String(ref.fid) }));
  var res = await $http.post("https://proapi.115.com/app/share/downurl", toQuery({ data: encoded }), { headers: Object.assign(headers115(cookie), { "Content-Type": "application/x-www-form-urlencoded" }), timeout: 15000, responseType: "text" });

  var json = null;
  try { json = JSON.parse(typeof res.data === "string" ? res.data : JSON.stringify(res.data || "")); } catch (_) {}
  if (!json || !json.state || typeof json.data !== "string") throw new Error("115 下载接口拒绝请求");

  var data = JSON.parse(p115Decrypt(json.data));
  var url = typeof data.url === "string" ? data.url : (data.url && data.url.url);
  if (!/^https?:\/\//i.test(url || "")) throw new Error("115 原画地址为空");

  var headers = { "User-Agent": P115_UA, Referer: "https://115.com/" };
  var auth = (data.url && data.url.auth_cookie) || data.auth_cookie;
  if (auth && auth.name && auth.value) headers.Cookie = auth.name + "=" + auth.value;

  return { url: url, headers: headers, type: "direct", format: "file" };
}

async function resolve(params, context) {
  var ref = (params && params.ref) ? params.ref : {};
  if (ref.provider === "uc") return await resolveUc(ref);
  if (ref.provider === "quark") return await resolveQuark(context, ref);
  if (ref.provider === "baidu") return await resolveBaidu(context, ref);
  if (ref.provider === "115") return await resolve115(context, ref);
  throw new Error("未知的播放来源");
}

// ---------- 9. 115 加解密（彻底剔除 Generator / yield 语法） ----------

function p115Utf8Encode(text) {
  var encoded = encodeURIComponent(text), bytes = [];
  for (var i = 0; i < encoded.length; i++) {
    if (encoded[i] === "%") {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(encoded.charCodeAt(i));
    }
  }
  return new Uint8Array(bytes);
}

function p115Utf8Decode(bytes) {
  return decodeURIComponent(Array.from(bytes, function(b) { return "%" + b.toString(16).padStart(2, "0"); }).join(""));
}

var P115_BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function p115Base64Encode(bytes) {
  var text = "";
  for (var i = 0; i < bytes.length; i += 3) {
    var n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    text += P115_BASE64[(n >>> 18) & 63] + P115_BASE64[(n >>> 12) & 63] + (i + 1 < bytes.length ? P115_BASE64[(n >>> 6) & 63] : "=") + (i + 2 < bytes.length ? P115_BASE64[n & 63] : "=");
  }
  return text;
}

function p115Base64Decode(text) {
  var clean = String(text).replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4) throw new Error("115 加密响应 Base64 无效");
  var bytes = [];
  for (var i = 0; i < clean.length; i += 4) {
    var n = (P115_BASE64.indexOf(clean[i]) << 18) | (P115_BASE64.indexOf(clean[i + 1]) << 12) | ((P115_BASE64.indexOf(clean[i + 2]) & 63) << 6) | (P115_BASE64.indexOf(clean[i + 3]) & 63);
    bytes.push((n >>> 16) & 255);
    if (clean[i + 2] !== "=") bytes.push((n >>> 8) & 255);
    if (clean[i + 3] !== "=") bytes.push(n & 255);
  }
  return new Uint8Array(bytes);
}

var p115G_kts = new Uint8Array([
  0xf0, 0xe5, 0x69, 0xae, 0xbf, 0xdc, 0xbf, 0x8a,
  0x1a, 0x45, 0xe8, 0xbe, 0x7d, 0xa6, 0x73, 0xb8,
  0xde, 0x8f, 0xe7, 0xc4, 0x45, 0xda, 0x86, 0xc4,
  0x9b, 0x64, 0x8b, 0x14, 0x6a, 0xb4, 0xf1, 0xaa,
  0x38, 0x01, 0x35, 0x9e, 0x26, 0x69, 0x2c, 0x86,
  0x00, 0x6b, 0x4f, 0xa5, 0x36, 0x34, 0x62, 0xa6,
  0x2a, 0x96, 0x68, 0x18, 0xf2, 0x4a, 0xfd, 0xbd,
  0x6b, 0x97, 0x8f, 0x4d, 0x8f, 0x89, 0x13, 0xb7,
  0x6c, 0x8e, 0x93, 0xed, 0x0e, 0x0d, 0x48, 0x3e,
  0xd7, 0x2f, 0x88, 0xd8, 0xfe, 0xfe, 0x7e, 0x86,
  0x50, 0x95, 0x4f, 0xd1, 0xeb, 0x83, 0x26, 0x34,
  0xdb, 0x66, 0x7b, 0x9c, 0x7e, 0x9d, 0x7a, 0x81,
  0x32, 0xea, 0xb6, 0x33, 0xde, 0x3a, 0xa9, 0x59,
  0x34, 0x66, 0x3b, 0xaa, 0xba, 0x81, 0x60, 0x48,
  0xb9, 0xd5, 0x81, 0x9c, 0xf8, 0x6c, 0x84, 0x77,
  0xff, 0x54, 0x78, 0x26, 0x5f, 0xbe, 0xe8, 0x1e,
  0x36, 0x9f, 0x34, 0x80, 0x5c, 0x45, 0x2c, 0x9b,
  0x76, 0xd5, 0x1b, 0x8f, 0xcc, 0xc3, 0xb8, 0xf5
]);

var p115RSA_e = 0x8686980c0f5a24c4b9d43020cd2c22703ff3f450756529058b1cf88f09b8602136477198a6e2683149659bd122c33592fdb5ad47944ad1ea4d36c6b172aad6338c3bb6ac6227502d010993ac967d1aef00f0c8e038de2e4d3bc2ec368af2e9f10a6f1eda4f7262f136420c07c331b871bf139f74f3010e3c4fe57df3afb71683n;
var p115RSA_n = 0x10001n;

function p115ToBytes(value, length) {
  if (length == undefined) length = Math.ceil(value.toString(16).length / 2);
  var buffer = new Uint8Array(length);
  for (var i = length - 1; i >= 0; i--) {
    buffer[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return buffer;
}

function p115FromBytes(bytes) {
  var intVal = 0n;
  for (var i = 0; i < bytes.length; i++) {
    intVal = (intVal << 8n) | BigInt(bytes[i]);
  }
  return intVal;
}

/**
 * 核心避坑 4：彻底剔除 Generator / yield，改写为平铺数组步长迭代器
 */
function p115AccSteps(start, stop, step) {
  if (!step) step = 1;
  var ranges = [];
  var cur = start;
  for (var i = start + step; i < stop; i += step) {
    ranges.push([cur, i, step]);
    cur = i;
  }
  if (cur !== stop) {
    ranges.push([cur, stop, stop - cur]);
  }
  return ranges;
}

function p115BytesXor(v1, v2) {
  var result = new Uint8Array(v1.length);
  for (var i = 0; i < v1.length; i++) {
    result[i] = v1[i] ^ v2[i];
  }
  return result;
}

function p115GenKey(randKey, skLen) {
  var xorKey = new Uint8Array(skLen);
  var length = skLen * (skLen - 1);
  var index = 0;
  for (var i = 0; i < skLen; i++) {
    var x = (randKey[i] + p115G_kts[index]) & 0xff;
    xorKey[i] = p115G_kts[length] ^ x;
    length -= skLen;
    index += skLen;
  }
  return xorKey;
}

function p115PadPkcs1V1_5(message) {
  var msg_len = message.length;
  var buffer = new Uint8Array(128);
  buffer.fill(0x02, 1, 127 - msg_len);
  buffer.set(message, 128 - msg_len);
  return p115FromBytes(buffer);
}

function p115Xor(src, key) {
  var buffer = new Uint8Array(src.length);
  var i = src.length & 0b11;
  if (i) {
    buffer.set(p115BytesXor(src.subarray(0, i), key.subarray(0, i)));
  }
  var steps = p115AccSteps(i, src.length, key.length);
  for (var idx = 0; idx < steps.length; idx++) {
    var j = steps[idx][0];
    var k = steps[idx][1];
    buffer.set(p115BytesXor(src.subarray(j, k), key), j);
  }
  return buffer;
}

function p115Pow(base, exponent, modulus) {
  if (modulus === 1n) return 0n;
  var result = 1n;
  base %= modulus;
  while (exponent) {
    if (exponent & 1n) result = (result * base) % modulus;
    exponent = exponent >> 1n;
    base = (base * base) % modulus;
  }
  return result;
}

function p115Encrypt(data) {
  if (typeof data === "string" || data instanceof String) data = p115Utf8Encode(data);
  var xorText = new Uint8Array(16 + data.length);
  xorText.set(p115Xor(
    p115Xor(data, new Uint8Array([0x8d, 0xa5, 0xa5, 0x8d])).reverse(),
    new Uint8Array([0x78, 0x06, 0xad, 0x4c, 0x33, 0x86, 0x5d, 0x18, 0x4c, 0x01, 0x3f, 0x46])
  ), 16);
  var cipherData = new Uint8Array(Math.ceil(xorText.length / 117) * 128);
  var start = 0;
  var steps = p115AccSteps(0, xorText.length, 117);
  for (var idx = 0; idx < steps.length; idx++) {
    var l = steps[idx][0];
    var r = steps[idx][1];
    cipherData.set(p115ToBytes(p115Pow(p115PadPkcs1V1_5(xorText.subarray(l, r)), p115RSA_n, p115RSA_e), 128), start, start += 128);
  }
  return p115Base64Encode(cipherData);
}

function p115Decrypt(cipherData) {
  var cipher_data = p115Base64Decode(cipherData);
  var data = [];
  var steps = p115AccSteps(0, cipher_data.length, 128);
  for (var idx = 0; idx < steps.length; idx++) {
    var l = steps[idx][0];
    var r = steps[idx][1];
    var p = p115Pow(p115FromBytes(cipher_data.subarray(l, r)), p115RSA_n, p115RSA_e);
    var b = p115ToBytes(p);
    var sub = b.subarray(b.indexOf(0) + 1);
    for (var i = 0; i < sub.length; i++) {
      data.push(sub[i]);
    }
  }
  data = new Uint8Array(data);
  var keyL = p115GenKey(data.subarray(0, 16), 12);
  var tmp = p115Xor(data.subarray(16), keyL).reverse();
  return p115Utf8Decode(p115Xor(tmp, new Uint8Array([0x8d, 0xa5, 0xa5, 0x8d])));
}

// ---------- 10. 模块导出规范 ----------

var hawk = {
  apiVersion: 3,
  type: "source",
  meta: {
    id: "com.butterfly.quanpansou4k",
    name: "全盘搜4K",
    category: "video",
    version: "1.0.3",
    icon: "https://py.5568999.cc.cd/icon/quanpan.png",
    author: "蝴蝶影视",
    description: "全盘搜4K 网盘聚合搜索，支持 4K 原盘分享直解（夸克/百度/UC/115）"
  },
  env: [
    "cookies.quark_cookie",
    "cookies.quark",
    "cookies.baidu_cookie",
    "cookies.pan115_cookie"
  ],
  configSchema: [
    {
      key: "host",
      title: "自定义主站域名",
      type: "url",
      placeholder: "留空将使用默认节点 (默认: " + QP_DEFAULT_SITE + ")"
    }
  ],
  capabilities: ["home", "search", "detail", "resolve"],
  home: home,
  search: search,
  detail: detail,
  resolve: resolve
};