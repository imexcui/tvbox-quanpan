# -*- coding: utf-8 -*-
"""Post-build patch: filter dead quark/uc shares at search time.

Applied to the generated quanpan_spider.js so it survives daily rebuilds
(workflow runs this after build.py, before publishing to the gist).
"""
import io, os, re, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
SPIDER = os.path.join(HERE, 'quanpan_spider.js')

HELPERS = '''
// ---------- 死链过滤（搜索时预校验，带缓存） ----------
var QP_ALIVE_CHECK_BUDGET = 40;
var QP_ALIVE_KEEP = 20;
var QP_ALIVE_TTL = 6 * 3600 * 1000;

function shareAliveCheck(ref, context) {
  try {
    if (ref.provider === "quark") {
      quarkToken(ref.shareId, ref.passcode, quarkCookie(context));
      return true;
    }
    if (ref.provider === "uc") {
      ucApi("share/sharepage/token?pr=UCBrowser&fr=pc", { pwd_id: ref.shareId, passcode: ref.passcode || "" });
      return true;
    }
    return true;
  } catch (_) { return false; }
}

function filterDeadShares(items, context) {
  var out = [], kept = 0, budget = QP_ALIVE_CHECK_BUDGET;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var ref = (it && it.ref) || {};
    var prov = String(ref.provider || "");
    if (prov !== "quark" && prov !== "uc") { out.push(it); kept++; continue; }
    if (kept >= QP_ALIVE_KEEP || budget <= 0) { out.push(it); kept++; continue; }
    var key = prov + "-" + ref.shareId;
    var c = __CACHE["alive-" + key];
    var alive;
    if (c && Number(c.expires || 0) > Date.now()) {
      alive = !!c.alive;
    } else {
      budget--;
      alive = shareAliveCheck(ref, context);
      __CACHE["alive-" + key] = { alive: alive, expires: Date.now() + QP_ALIVE_TTL };
    }
    if (!alive) continue;
    out.push(it);
    kept++;
  }
  return out;
}
'''

OLD = ('  var shaped = shapeSearchItems(kw, r.items);\n'
       '  return { items: shaped, page: page };')
NEW = ('  var shaped = shapeSearchItems(kw, r.items);\n'
       '  try { shaped = filterDeadShares(shaped, context); } catch (_) {}\n'
       '  return { items: shaped, page: page };')
ANCHOR = 'function __hawk_home(params, context) {'

src = open(SPIDER, encoding='utf-8').read()
if 'filterDeadShares' in src:
    print('already patched')
    sys.exit(0)
assert src.count(OLD) == 1, 'hook point not found: %d' % src.count(OLD)
assert src.count(ANCHOR) == 1, 'anchor not found'
src = src.replace(OLD, NEW).replace(ANCHOR, HELPERS + '\n' + ANCHOR)
open(SPIDER, 'w', encoding='utf-8', newline='').write(src)
print('patched: search-time dead-link filter (quark/uc, budget=40, keep>=20, ttl=6h)')
