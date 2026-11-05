# -*- coding: utf-8 -*-
"""
全盘搜(Hawk) -> CatVod/TVBox JS 蜘蛛 转换 + 合并 aiwex 配置
- 在线抓取最新 aiwex.json（默认 https://9280.kstore.vip/aiwex.json）
- 读取仓库内 source_hawk.js（原 全盘搜.js）
- 生成 quanpan_spider.js 与 aiwex_quanpan.json
- 支持环境变量 REPO=user/repo，自动把 spider api 写成 jsDelivr 干净链接
"""
import json, re, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_JS = os.path.join(HERE, "source_hawk.js")          # 原 全盘搜.js（已复制进仓库）
AIWEX_URL = "https://9280.kstore.vip/aiwex.json"
AIWEX_LOCAL = os.path.join(HERE, "aiwex.json")
OUT_SPIDER = os.path.join(HERE, "quanpan_spider.js")
OUT_CONFIG = os.path.join(HERE, "aiwex_quanpan.json")

REPO = os.environ.get("REPO", "").strip()              # 形如 user/repo
if REPO:
    SPIDER_API = "https://cdn.jsdelivr.net/gh/%s/quanpan_spider.js" % REPO
else:
    SPIDER_API = "https://cdn.jsdelivr.net/gh/<你的GitHub用户名>/<仓库名>/quanpan_spider.js"

# ---------- 0. 在线抓取最新 aiwex.json ----------
def fetch_aiwex():
    try:
        req = urllib.request.Request(AIWEX_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read().decode("utf-8")
        with open(AIWEX_LOCAL, "w", encoding="utf-8") as f:
            f.write(data)
        print("aiwex fetched online, bytes:", len(data))
        return True
    except Exception as e:
        print("fetch aiwex failed:", e)
        return False

if not fetch_aiwex():
    if not os.path.exists(AIWEX_LOCAL):
        sys.exit("无法抓取 aiwex 且无本地备份，终止")
    print("使用本地 aiwex.json 备份")

# ---------- 1. 读取原 hawk 模块 ----------
with open(SRC_JS, "r", encoding="utf-8") as f:
    src = f.read()

marker = "// ---------- 10."
idx = src.find(marker)
if idx == -1:
    idx = src.find("var hawk =")
if idx == -1:
    idx = len(src)
core = src[:idx]

# ---------- 2. 机械转换：async -> sync，避免与 TVBox 接口名冲突 ----------
core = core.replace("async function home(", "function __hawk_home(")
core = core.replace("async function search(", "function __hawk_search(")
core = core.replace("async function detail(", "function __hawk_detail(")
core = core.replace("async function resolve(", "function __hawk_resolve(")
core = re.sub(r"async function", "function", core)
core = re.sub(r"await ", "", core)

# ---------- 3. 适配器：把 Hawk 私有全局映射为 CatVod JS 引擎原生能力 ----------
ADAPTER = r'''
/* ============================================================
 * 全盘搜4K · CatVod/TVBox JS 蜘蛛版（由 Hawk 模块 全盘搜.js 适配）
 * 业务逻辑（夸克/百度/UC/115 网盘聚合搜索 + 直链解析）原样保留。
 * 仅需修改下方 USER_COOKIES / USER_HOST 即可使用。
 * 仅供学习研究，请播放自有或已授权内容。
 * ============================================================ */

// ====== 0. 用户配置（按需修改） ======
var USER_HOST = "";          // 留空用默认 quanpan.xyz；可填自定义主站域名(含 http)
var USER_COOKIES = {
  quark_cookie: "",          // 夸克网盘 Cookie（pan.quark.cn），仅播放夸克需填
  quark: "",                 // 夸克 Cookie 备选字段
  baidu_cookie: "",          // 百度网盘 Cookie（pan.baidu.com），仅播放百度需填
  pan115_cookie: ""          // 115 网盘 Cookie（115.com），仅播放 115需填；UC 免登
};

// ====== 1. 适配层 ======
var __CACHE = {};
var __STORAGE = {};
var __ENV = { cookies: USER_COOKIES };

function __now(){ return (typeof Date !== "undefined" && Date.now) ? Date.now() : 0; }

// ---- 纯 JS Base64（UTF-8 安全） ----
var __B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function __b64EncBytes(bytes){
  var t=""; for(var i=0;i<bytes.length;i+=3){
    var n=(bytes[i]<<16)|((bytes[i+1]||0)<<8)|(bytes[i+2]||0);
    t+=__B64[(n>>>18)&63]+__B64[(n>>>12)&63]+(i+1<bytes.length?__B64[(n>>>6)&63]:"=")+(i+2<bytes.length?__B64[n&63]:"=");
  } return t;
}
function __b64DecBytes(s){
  var c=String(s).replace(/\s/g,""); var out=[];
  for(var i=0;i<c.length;i+=4){
    var n=(__B64.indexOf(c[i])<<18)|(__B64.indexOf(c[i+1])<<12)|((__B64.indexOf(c[i+2])&63)<<6)|(__B64.indexOf(c[i+3])&63);
    out.push((n>>>16)&255); if(c[i+2]!=="=")out.push((n>>>8)&255); if(c[i+3]!=="=")out.push(n&255);
  } return out;
}
function __utf8Bytes(s){ var o=[]; s=String(s); for(var i=0;i<s.length;i++){ var c=s.charCodeAt(i);
  if(c<0x80)o.push(c); else if(c<0x800)o.push(0xc0|(c>>6),0x80|(c&0x3f));
  else if(c>=0xd800&&c<=0xdbff){ var c2=s.charCodeAt(++i); var cp=0x10000+((c&0x3ff)<<10)+(c2&0x3ff); o.push(0xf0|(cp>>18),0x80|((cp>>12)&0x3f),0x80|((cp>>6)&0x3f),0x80|(cp&0x3f)); }
  else o.push(0xe0|(c>>12),0x80|((c>>6)&0x3f),0x80|(c&0x3f)); } return o; }
function __utf8Str(bytes){ var a=[]; for(var i=0;i<bytes.length;i++) a.push("%"+("0"+bytes[i].toString(16)).slice(-2)); try{ return decodeURIComponent(a.join("")); }catch(e){ return ""; } }
function __b64e(s){ return __b64EncBytes(__utf8Bytes(s)); }
function __b64d(s){ return __utf8Str(__b64DecBytes(s)); }

// ---- 纯 JS SHA1 ----
function __sha1(msg){
  function rotl(x,n){ return (x<<n)|(x>>>(32-n)); }
  function tohex(n){ var s=""; for(var i=7;i>=0;i--) s+=((n>>>(i*4))&0xf).toString(16); return s; }
  var m=__utf8Bytes(msg); var l=m.length;
  m=m.concat([0x80]); while(m.length%64!==56) m.push(0);
  var bitLen=l*8; var h0=0x67452301,h1=0xEFCDAB89,h2=0x98BADCFE,h3=0x10325476,h4=0xC3D2E1F0;
  var w=new Array(80);
  for(var i=0;i<m.length;i+=64){
    for(var j=0;j<16;j++){ w[j]=(m[i+j*4]<<24)|(m[i+j*4+1]<<16)|(m[i+j*4+2]<<8)|(m[i+j*4+3]); }
    for(var j=16;j<80;j++){ w[j]=rotl(w[j-3]^w[j-8]^w[j-14]^w[j-16],1); }
    var a=h0,b=h1,c=h2,d=h3,e=h4;
    for(var t=0;t<80;t++){
      var f,k; if(t<20){f=(b&c)|((~b)&d);k=0x5A827999;} else if(t<40){f=b^c^d;k=0x6ED9EBA1;} else if(t<60){f=(b&c)|(b&d)|(c&d);k=0x8F1BBCDC;} else {f=b^c^d;k=0xCA62C1D6;}
      var tmp=(rotl(a,5)+f+e+k+(w[t]>>>0))>>>0; e=d; d=c; c=rotl(b,30); b=a; a=tmp;
    }
    h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0; h4=(h4+e)>>>0;
  }
  return tohex(h0)+tohex(h1)+tohex(h2)+tohex(h3)+tohex(h4);
}
var $crypto = { sha1: function(s){ return __sha1(String(s==null?"":s)); } };

// ---- HTTP 适配器（同步；优先 requestWith，回退 request/post） ----
function __doHttp(method, url, data, headers, timeout){
  var h = headers ? JSON.parse(JSON.stringify(headers)) : {};
  if (h["X-Requested-With"]) delete h["X-Requested-With"];
  var t = timeout || 15000;
  var status=200, bodyStr="", respHeaders={};
  try {
    var raw;
    if (typeof requestWith === "function"){
      var opts = { url:url, method:method, headers:h, timeout:t };
      if (method === "POST"){
        var body = (data===undefined||data===null)?"":(typeof data==="string"?data:JSON.stringify(data));
        if (typeof data!=="string" && data!==undefined && data!==null) h["Content-Type"]="application/json";
        opts.headers=h; opts.data=body; opts.body=body;
      }
      raw = requestWith(opts);
    } else if (typeof request === "function"){
      if (method === "POST"){
        var b2 = (data===undefined||data===null)?"":(typeof data==="string"?data:JSON.stringify(data));
        if (typeof data!=="string" && data!==undefined && data!==null) h["Content-Type"]="application/json";
        if (typeof post === "function") raw = post(url, b2, h);
        else raw = request(url, { method:"POST", body:b2, data:b2, headers:h });
      } else { raw = request(url, h); }
    } else if (typeof post === "function"){ raw = post(url, data||"", h); }
    if (typeof raw === "object" && raw !== null){
      status = Number(raw.code||raw.status||200);
      var _d = (raw.data!==undefined && raw.data!==null) ? raw.data
             : (raw.body!==undefined && raw.body!==null ? raw.body : undefined);
      bodyStr = (_d===undefined) ? "" : (typeof _d==="string" ? _d : JSON.stringify(_d));
      var normHeaders = {};
      if (raw.headers){
        try { var ks = Object.keys(raw.headers); for (var ki=0; ki<ks.length; ki++){ normHeaders[ks[ki]] = raw.headers[ks[ki]]; } } catch(e){}
      }
      respHeaders = normHeaders;
    } else { bodyStr = (raw===undefined||raw===null)?"":String(raw); }
  } catch(e){ status=0; bodyStr=""; respHeaders={}; }
  return { status:status, data:bodyStr, headers:respHeaders };
}
var $http = {
  get: function(u,o){ o=o||{}; return __doHttp("GET",u,undefined,o.headers||{},o.timeout||15000); },
  post: function(u,b,o){ o=o||{}; return __doHttp("POST",u,b,o.headers||{},o.timeout||15000); }
};

// ---- 缓存 / 存储 / 环境变量 ----
var $cache = {
  get: function(k,d){ var e=__CACHE[k]; if(!e) return d; if(e.exp && e.exp < __now()){ delete __CACHE[k]; return d; } return e.v; },
  set: function(k,v,o){ var ttl=(o&&o.ttl)?o.ttl:600; __CACHE[k]={v:v,exp:__now()+ttl*1000}; },
  delete: function(k){ delete __CACHE[k]; }
};
var $storage = {
  get: function(k,d){ return (__STORAGE[k]!==undefined)?__STORAGE[k]:d; },
  set: function(k,v){ __STORAGE[k]=v; }
};
var $env = {};
Object.defineProperty($env, "cookies", { get: function(){ return __ENV.cookies; } });

// ---- 休眠（同步） ----
function $sleep(ms){
  if (typeof sleep === "function") return sleep(ms);
  var end=__now()+(Number(ms)||0); while(__now() < end){}
  return;
}
'''

# ---------- 4. 边界函数：TVBox/CatVod Spider 接口 ----------
BOUNDARY = r'''
// ====== 2. CatVod Spider 接口（TVBox/影视仓 调用入口，函数名须为约定名） ======
function _ctx(){ return { config: { host: (USER_HOST && USER_HOST.indexOf("http")===0) ? USER_HOST : "" } }; }
function _enc(obj){ return __b64e(JSON.stringify(obj == null ? {} : obj)); }
function _dec(id){ try { return JSON.parse(__b64d(String(id))); } catch(e){ return {}; } }
function _firstId(ids){ if (Array.isArray(ids)) return ids[0]; if (typeof ids === "string") return ids.split(",")[0]; return ids; }

function init(ext){
  if (ext){
    try {
      var o = JSON.parse(ext);
      if (o && typeof o === "object"){
        if (o.host && String(o.host).indexOf("http")===0) USER_HOST = String(o.host);
        if (o.cookies && typeof o.cookies === "object"){
          for (var k in o.cookies){ if (Object.prototype.hasOwnProperty.call(o.cookies,k)) USER_COOKIES[k] = o.cookies[k]; }
        }
      }
    } catch(e){}
  }
  __ENV.cookies = USER_COOKIES;
  return "";
}

function home(filter){
  var r = __hawk_home({}, _ctx());
  var list = (r && r.items) || [];
  var out = [];
  for (var i=0;i<list.length;i++){
    var it = list[i];
    out.push({
      vod_id: _enc({ ref: it.ref || {}, itemId: it.id, itemTitle: it.title }),
      vod_name: it.title || "未知",
      vod_pic: "",
      vod_remarks: it.status || ""
    });
  }
  return JSON.stringify({ class: [], content: 1, list: out });
}

function homeVod(){ return home(); }

function category(tid, pg, filter, extend){
  return JSON.stringify({ list: [], page: Number(pg||1), pagecount: 1, limit: 20, total: 0 });
}

function search(key, quick){
  var kw = String(key||"").trim();
  var r = __hawk_search({ keyword: kw, page: 1 }, _ctx());
  var list = (r && r.items) || [];
  var out = [];
  for (var i=0;i<list.length;i++){
    var it = list[i];
    out.push({
      vod_id: _enc({ ref: it.ref || {}, itemId: it.id, itemTitle: it.title }),
      vod_name: it.title || "未知",
      vod_pic: "",
      vod_remarks: it.status || ""
    });
  }
  return JSON.stringify({ list: out });
}

function detail(ids){
  var id = _firstId(ids) || "";
  var dec = _dec(id);
  var r = __hawk_detail({ itemId: dec.itemId || "", ref: dec.ref || {}, itemTitle: dec.itemTitle || "" }, _ctx());
  var sources = r.sources || [];
  var froms = [], urls = [];
  for (var s=0;s<sources.length;s++){
    var src = sources[s];
    var eps = src.episodes || [];
    froms.push(String(src.name || ("源"+(s+1))));
    var parts = [];
    for (var e=0;e<eps.length;e++){
      var ep = eps[e] || {};
      parts.push((ep.name || ("第"+(e+1)+"集")) + "$" + _enc(ep.ref || {}));
    }
    urls.push(parts.join("$$"));
  }
  return JSON.stringify({
    list: [{
      vod_id: id,
      vod_name: r.title || dec.itemTitle || "未知",
      vod_pic: "",
      vod_remarks: r.status || "",
      vod_content: (r.summary || "").slice(0, 500),
      vod_play_from: froms.join("$$$"),
      vod_play_url: urls.join("$$$")
    }]
  });
}

function play(flag, id, vipFlags){
  var ref = _dec(id);
  var r = __hawk_resolve({ ref: ref }, _ctx());
  var header = r.headers || {};
  return JSON.stringify({ parse: 0, url: r.url || "", header: header });
}

function destroy(){ return ""; }
'''

spider = ADAPTER + "\n" + core + "\n" + BOUNDARY
with open(OUT_SPIDER, "w", encoding="utf-8") as f:
    f.write(spider)

# ---------- 5. 合并配置 ----------
with open(AIWEX_LOCAL, "r", encoding="utf-8") as f:
    cfg = json.load(f)

new_site = {
    "key": "QuanPan4K",
    "name": "🌸 全盘搜4K（夸克/百度/UC/115）",
    "type": 3,
    "api": SPIDER_API,
    "searchable": 1,
    "quickSearch": 1,
    "filterable": 0,
    "ext": ""
}
exists = any(s.get("key") == new_site["key"] for s in cfg.get("sites", []))
if not exists:
    cfg.setdefault("sites", []).append(new_site)

with open(OUT_CONFIG, "w", encoding="utf-8") as f:
    json.dump(cfg, f, ensure_ascii=False, indent=2)

print("spider bytes:", len(spider))
print("config sites:", len(cfg.get("sites", [])))
print("spider api:", SPIDER_API)
print("spider written:", OUT_SPIDER)
print("config written:", OUT_CONFIG)
