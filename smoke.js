const fs = require("fs");
let code = fs.readFileSync("quanpan_spider.js", "utf8");
const vm = require("vm");

// 正确的桩：模拟真实后端返回结构（body 即 HTTP 响应字符串/对象）
function makeReq() {
  return function(o) {
    const url = (o && o.url) || "";
    const method = (o && o.method) || "GET";
    // 令牌：真实返回 {code:0, data:{token, ttl_ms}}
    if (url.indexOf("/api/auth/token") >= 0)
      return { code: 0, data: { code: 0, data: { token: "FAKE_TOKEN", ttl_ms: 600000 } }, headers: {} };
    // 搜索：真实返回 {code:0, data:{code:0, merged_by_type:{...}}}
    if (method === "POST" && url.indexOf("/api/search") >= 0)
      return { code: 0, data: { code: 0, data: { code: 0, total: 1, merged_by_type: { quark: [{ url: "https://pan.quark.cn/s/SHARE1", note: "测试电影 4K", datetime: "2026-01-01" }] } } }, headers: {} };
    if (url.indexOf("/api/hot-realtime") >= 0)
      return { code: 0, data: { code: 0, data: { list: ["流浪地球", "满江红"] } }, headers: {} };
    // 夸克分享目录（须在 drive-h 之前匹配）
    if (url.indexOf("sharepage/detail") >= 0)
      return { code: 0, data: { data: { list: [{ fid: "F1", file_name: "测试电影.2160p.mkv", size: 5368709120, obj_category: "video", share_fid_token: "T1", pdir_fid: "0" }] } }, headers: {} };
    // 夸克分享令牌
    if (url.indexOf("drive-h.quark.cn") >= 0)
      return { code: 0, data: { status: 200, data: { stoken: "STK" } }, headers: {} };
    return { code: 0, data: { code: 0, data: { code: 0 } }, headers: {} };
  };
}
const ctx = {
  request: function(u, h) { return makeReq()({ url: u, headers: h }); },
  requestWith: makeReq(),
  post: function(u, b, h) { return "{}"; },
  console: console, JSON: JSON, Math: Math, Date: Date, Object: Object, Array: Array,
  String: String, Number: Number, RegExp: RegExp, Error: Error, parseInt: parseInt,
  parseFloat: parseFloat, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
  setTimeout: setTimeout, Uint8Array: Uint8Array, BigInt: BigInt, isNaN: isNaN, Infinity: Infinity, NaN: NaN
};
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: "spider.js" });

function show(label, fn) {
  try { const r = fn(); console.log("✅", label, "->", typeof r === "string" ? r.slice(0, 160) : r); }
  catch (e) { console.log("⚠️ ", label, "->", e.message.slice(0, 60)); }
}

show("init()", () => ctx.init(""));
show("home()", () => { const r = JSON.parse(ctx.home(0)); return "list=" + r.list.length + " vod_id=" + (r.list[0] ? r.list[0].vod_id.slice(0, 30) + "..." : "none"); });
show("search(测试电影)", () => { const r = JSON.parse(ctx.search("测试电影", false)); return "list=" + r.list.length + " name=" + (r.list[0] ? r.list[0].vod_name : ""); });
show("search->detail(quark,无cookie)", () => {
  const sid = JSON.parse(ctx.search("测试电影", false)).list[0].vod_id;
  const d = JSON.parse(ctx.detail(sid));
  return "play_from=" + d.list[0].vod_play_from + " urls=" + d.list[0].vod_play_url.split("$$").length;
});
show("detail(guide)", () => { const g = ctx.detail(JSON.stringify({ ref: {}, itemId: "guide", itemTitle: "引导" })); return "bytes=" + g.length; });
show("play(空ref)", () => ctx.play("x", JSON.stringify({ provider: "quark" }), ""));
