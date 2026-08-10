# -*- coding: utf-8 -*-
"""把小白操作手册 Markdown 转成排版精美的 HTML（带目录 + 打印）。"""
import markdown
import re

SRC = "边开发边搭建-小白操作手册.md"
OUT = "边开发边搭建-小白操作手册.html"

with open(SRC, encoding="utf-8") as f:
    md = f.read()

# 注入目录标记
body = "[TOC]\n\n" + md

html = markdown.markdown(
    body,
    extensions=[
        "tables",
        "fenced_code",
        "toc",
        "attr_list",
        "sane_lists",
    ],
    extension_configs={
        "toc": {"permalink": False, "baselevel": 1},
    },
)

CSS = """
:root{
  --brand:#1a73e8; --brand-soft:#e8f0fe; --ink:#222; --muted:#666;
  --line:#e3e7ee; --ok:#1e7e34; --warn:#b06000; --code-bg:#f6f8fa;
}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
  color:var(--ink);background:#f5f7fa;line-height:1.75;font-size:17px}
.topbar{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid var(--line);
  padding:12px 22px;display:flex;align-items:center;gap:14px;box-shadow:0 1px 6px rgba(0,0,0,.04)}
.topbar h1{font-size:18px;margin:0;color:var(--brand)}
.topbar .sp{flex:1}
.btn{border:1px solid var(--brand);background:var(--brand);color:#fff;border-radius:8px;
  padding:8px 16px;font-size:14px;cursor:pointer}
.btn:hover{opacity:.9}
.wrap{max-width:920px;margin:22px auto 80px;background:#fff;border:1px solid var(--line);
  border-radius:14px;padding:36px 44px;box-shadow:0 4px 20px rgba(0,0,0,.05)}
.toc{background:var(--brand-soft);border:1px solid #cfe0fb;border-radius:12px;
  padding:16px 22px;margin:0 0 30px}
.toc .toctitle{font-weight:700;color:var(--brand);margin-bottom:8px}
.toc ul{margin:0;padding-left:22px}
.toc a{color:#1558b0;text-decoration:none}
.toc a:hover{text-decoration:underline}
h1{font-size:27px;margin:0 0 6px;color:var(--brand)}
h2{font-size:22px;margin:38px 0 14px;padding-bottom:8px;border-bottom:2px solid var(--brand-soft);color:#0b3d91}
h3{font-size:19px;margin:26px 0 10px;color:#14418f}
p{margin:12px 0}
blockquote{background:#fff8e6;border-left:4px solid #f9ab00;margin:16px 0;padding:12px 18px;
  border-radius:0 8px 8px 0;color:#5b4700}
code{background:var(--code-bg);border:1px solid #e6e9ef;border-radius:5px;padding:2px 6px;
  font-family:"SFMono-Regular",Consolas,Menlo,monospace;font-size:14px}
pre{background:#0d1117;border-radius:10px;padding:16px 18px;overflow:auto}
pre code{background:none;border:none;color:#e6edf3;padding:0;font-size:14px}
table{border-collapse:collapse;width:100%;margin:16px 0;font-size:15px}
th,td{border:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top}
th{background:var(--brand-soft);color:#0b3d91;font-weight:700}
tr:nth-child(even) td{background:#fafbfc}
ul,ol{padding-left:24px}
li{margin:6px 0}
input[type=checkbox]{width:16px;height:16px;margin-right:8px;vertical-align:middle}
strong{color:#0b3d91}
svg{max-width:100%;height:auto;display:block;margin:18px auto}
@media print{
  body{background:#fff;font-size:13px}
  .topbar{display:none}
  .wrap{box-shadow:none;border:none;margin:0;max-width:100%;padding:0}
  .toc{break-after:page}
  h2{hbreak-after:avoid}
  pre,table,svg{break-inside:avoid}
}
"""

page = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>边开发边搭建·小白操作手册</title>
<style>{CSS}</style>
</head>
<body>
<div class="topbar">
  <h1>📘 边开发边搭建 · 小白操作手册</h1>
  <span class="sp"></span>
  <button class="btn" onclick="window.print()">打印 / 存为 PDF</button>
</div>
<div class="wrap">
{html}
</div>
</body>
</html>
"""

with open(OUT, "w", encoding="utf-8") as f:
    f.write(page)

print("OK ->", OUT, "大小:", len(page), "字符")
