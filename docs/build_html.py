# -*- coding: utf-8 -*-
"""将策划书 Markdown 转换为带侧边目录的单页 HTML。"""
import re
import markdown

SRC = "团队任务报单系统-开发策划书.md"
DST = "团队任务报单系统-开发策划书.html"

with open(SRC, encoding="utf-8") as f:
    md_text = f.read()

# 移除原文顶部的手写目录（用侧边栏目录代替）
md_text = re.sub(r"\n## 目录\n.*?\n---\n", "\n", md_text, count=1, flags=re.S)

md = markdown.Markdown(
    extensions=["tables", "fenced_code", "toc", "attr_list", "sane_lists", "nl2br"],
    extension_configs={"toc": {"toc_depth": "2-3", "permalink": False}},
)
body = md.convert(md_text)
toc = md.toc

CSS = """
:root{
  --bg:#f6f7f9; --panel:#ffffff; --ink:#1f2329; --ink-2:#4e5969; --ink-3:#86909c;
  --line:#e5e6eb; --line-2:#f0f1f3; --brand:#2f5cff; --brand-soft:#eef2ff;
  --code-bg:#f7f8fa; --warn:#ff7d00; --danger:#f53f3f; --ok:#00b42a;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0; background:var(--bg); color:var(--ink);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  font-size:15px; line-height:1.75; -webkit-font-smoothing:antialiased;
}
.layout{display:flex; max-width:1440px; margin:0 auto; gap:28px; padding:28px 24px 80px}
/* 侧边目录 */
.sidebar{
  width:280px; flex:0 0 280px; position:sticky; top:28px; align-self:flex-start;
  max-height:calc(100vh - 56px); overflow-y:auto; background:var(--panel);
  border:1px solid var(--line); border-radius:12px; padding:18px 8px 18px 16px;
}
.sidebar::-webkit-scrollbar{width:6px}
.sidebar::-webkit-scrollbar-thumb{background:#d8dbe0; border-radius:3px}
.sidebar h3{margin:0 0 12px; font-size:13px; letter-spacing:.08em; color:var(--ink-3); font-weight:600}
.sidebar ul{list-style:none; margin:0; padding:0}
.sidebar li{margin:0}
.sidebar a{
  display:block; padding:5px 10px; border-radius:6px; color:var(--ink-2);
  text-decoration:none; font-size:13px; line-height:1.5;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.sidebar a:hover{background:var(--brand-soft); color:var(--brand)}
.sidebar a.active{background:var(--brand-soft); color:var(--brand); font-weight:600}
.sidebar > .toc > ul > li > ul{margin-left:10px; border-left:1px solid var(--line-2); padding-left:4px}
.sidebar > .toc > ul > li > ul a{font-size:12.5px; color:var(--ink-3)}
/* 正文 */
.content{
  flex:1; min-width:0; background:var(--panel); border:1px solid var(--line);
  border-radius:12px; padding:44px 52px 64px;
}
.content h1{
  font-size:30px; line-height:1.35; margin:0 0 28px; padding-bottom:20px;
  border-bottom:3px solid var(--brand); font-weight:700; letter-spacing:-.01em;
}
.content h2{
  font-size:22px; margin:52px 0 18px; padding-left:14px; font-weight:700;
  border-left:5px solid var(--brand); line-height:1.4; scroll-margin-top:20px;
}
.content h3{font-size:17px; margin:34px 0 12px; font-weight:650; color:#252a31; scroll-margin-top:20px}
.content h4{font-size:15px; margin:24px 0 10px; font-weight:650; color:var(--ink-2)}
.content p{margin:12px 0}
.content ul,.content ol{padding-left:26px; margin:12px 0}
.content li{margin:5px 0}
.content strong{font-weight:650; color:#111}
.content hr{border:0; border-top:1px dashed var(--line); margin:44px 0}
.content a{color:var(--brand); text-decoration:none}
.content a:hover{text-decoration:underline}
/* 表格 */
.tablewrap{overflow-x:auto; margin:18px 0; border:1px solid var(--line); border-radius:10px}
table{border-collapse:collapse; width:100%; font-size:13.5px; background:#fff}
th,td{border-bottom:1px solid var(--line-2); padding:10px 14px; text-align:left; vertical-align:top}
th{background:#fafbfc; font-weight:650; color:var(--ink-2); white-space:nowrap; position:sticky; top:0}
tr:last-child td{border-bottom:0}
tbody tr:hover{background:#fafbff}
td:first-child{white-space:nowrap}
/* 代码 */
pre{
  background:var(--code-bg); border:1px solid var(--line); border-radius:10px;
  padding:16px 18px; overflow-x:auto; margin:16px 0; line-height:1.6;
}
pre code{
  font-family:"JetBrains Mono","SF Mono",Consolas,"Courier New",monospace;
  font-size:12.5px; color:#2d3748; white-space:pre; background:none; padding:0; border:0;
}
:not(pre) > code{
  background:#f2f3f5; border:1px solid var(--line); border-radius:4px;
  padding:1px 6px; font-size:12.5px; color:#c7254e;
  font-family:"JetBrains Mono","SF Mono",Consolas,monospace;
}
/* 引用 */
blockquote{
  margin:18px 0; padding:12px 18px; background:#fffbf0;
  border-left:4px solid var(--warn); border-radius:0 8px 8px 0; color:#6b5720;
}
blockquote p{margin:4px 0}
/* 顶部工具条 */
.topbar{
  position:fixed; right:24px; bottom:24px; display:flex; flex-direction:column; gap:10px; z-index:99;
}
.topbar button{
  width:44px; height:44px; border-radius:50%; border:1px solid var(--line);
  background:#fff; color:var(--ink-2); cursor:pointer; font-size:15px;
  box-shadow:0 4px 14px rgba(0,0,0,.08); transition:.18s;
}
.topbar button:hover{color:var(--brand); border-color:var(--brand); transform:translateY(-2px)}
@media print{
  body{background:#fff}
  .sidebar,.topbar{display:none}
  .layout{padding:0; max-width:none}
  .content{border:0; border-radius:0; padding:0}
  .content h2{page-break-after:avoid}
  table,pre{page-break-inside:avoid}
}
@media (max-width:1080px){
  .layout{flex-direction:column; padding:16px}
  .sidebar{width:100%; flex:none; position:static; max-height:300px}
  .content{padding:28px 20px}
}
"""

JS = """
// 表格包裹容器，支持横向滚动
document.querySelectorAll('.content table').forEach(function(t){
  if(t.parentElement.classList.contains('tablewrap')) return;
  var w=document.createElement('div'); w.className='tablewrap';
  t.parentNode.insertBefore(w,t); w.appendChild(t);
});
// 目录高亮
var links = Array.prototype.slice.call(document.querySelectorAll('.sidebar a'));
var map = {};
links.forEach(function(a){
  var id = decodeURIComponent(a.getAttribute('href')||'').slice(1);
  var el = document.getElementById(id);
  if(el) map[id] = a;
});
var obs = new IntersectionObserver(function(entries){
  entries.forEach(function(e){
    if(e.isIntersecting){
      links.forEach(function(l){ l.classList.remove('active'); });
      var a = map[e.target.id];
      if(a){ a.classList.add('active'); }
    }
  });
}, { rootMargin: '0px 0px -75% 0px', threshold: 0 });
Object.keys(map).forEach(function(id){ obs.observe(document.getElementById(id)); });
// 按钮
function toTop(){ window.scrollTo({top:0,behavior:'smooth'}); }
function doPrint(){ window.print(); }
"""

html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>团队任务报单系统 · 开发策划书</title>
<style>{CSS}</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <h3>目录导航</h3>
    {toc}
  </aside>
  <main class="content">
    {body}
  </main>
</div>
<div class="topbar">
  <button onclick="doPrint()" title="打印 / 导出 PDF">🖨</button>
  <button onclick="toTop()" title="回到顶部">↑</button>
</div>
<script>{JS}</script>
</body>
</html>
"""

with open(DST, "w", encoding="utf-8") as f:
    f.write(html)

print("生成成功:", DST, len(html), "字符")
