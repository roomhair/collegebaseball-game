# 1ファイル版（play.html）を作る。CSS・JS・フォントを全部埋め込み、ネット接続なしで開ける。
import re, base64
src = open('index.html', encoding='utf-8').read()
font = base64.b64encode(open('fonts/archivo-var.woff2', 'rb').read()).decode()
def css(m):
    t = open(m.group(1), encoding='utf-8').read()
    t = t.replace("url('../fonts/archivo-var.woff2')", "url(data:font/woff2;base64," + font + ")")
    return '<style>\n' + t + '\n</style>'
src = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, src)
def js(m):
    t = open(m.group(1), encoding='utf-8').read()
    return '<script>\n' + t.replace('</script', '<\\/script') + '\n</script>'
src = re.sub(r'<script src="([^"]+)"></script>', js, src)
open('play.html', 'w', encoding='utf-8').write(src)
print('play.html', len(src.encode()) // 1024, 'KB')
