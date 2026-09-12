"""Validate this static site without third-party packages."""
import argparse
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
        'meta', 'param', 'source', 'track', 'wbr'}


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.ids = []
        self.refs = []
        self.text = []
        self.headings = 0

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag not in VOID:
            self.stack.append(tag)
        if 'id' in values:
            self.ids.append(values['id'])
        self.refs.extend(values[key] for key in ('src', 'href') if key in values)
        if 'srcset' in values:
            self.refs.extend(item.strip().split()[0] for item in values['srcset'].split(','))
        if tag == 'img':
            assert 'alt' in values, 'Image missing alt attribute'
            assert int(values.get('width', 0)) > 0 and int(values.get('height', 0)) > 0, 'Image missing dimensions'
        if tag == 'h1':
            self.headings += 1

    def handle_endtag(self, tag):
        assert self.stack and self.stack.pop() == tag, f'Unbalanced HTML: {tag}'

    def handle_data(self, data):
        if data.strip():
            self.text.append(data.strip())


def read_page(text):
    page = Page()
    page.feed(text)
    page.close()
    assert not page.stack, f'Unclosed HTML: {page.stack}'
    return page


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compare-copy', metavar='TAG')
    args = parser.parse_args()
    page = read_page((ROOT / 'index.html').read_text(encoding='utf-8-sig'))
    assert page.headings == 1, 'Expected exactly one h1'
    assert len(page.ids) == len(set(page.ids)), 'Duplicate HTML ids'
    css = (ROOT / 'styles.css').read_text(encoding='utf-8-sig')
    refs = page.refs + re.findall(r'url\([\s\'"]*([^\s\'"\)]+)', css)
    for ref in refs:
        url = urlsplit(ref)
        if url.scheme or url.netloc:
            continue
        if url.path:
            file = (ROOT / unquote(url.path).lstrip('/')).resolve()
            assert file.is_relative_to(ROOT) and file.is_file(), f'Missing local resource: {ref}'
        elif url.fragment:
            assert unquote(url.fragment) in page.ids, f'Broken anchor: {ref}'
    if args.compare_copy:
        assert re.fullmatch(r'v\d+\.\d+\.\d+', args.compare_copy), 'Expected a release tag, e.g. v1.0.0'
        old = subprocess.check_output(['git', 'show', f'{args.compare_copy}:index.html'], cwd=ROOT).decode('utf-8-sig')
        previous = read_page(old)
        assert Counter(page.text) == Counter(previous.text), 'Page text differs from the selected release'
    print(f'PASS: HTML structure, {len(page.ids)} ids, {len(refs)} resource/link references, image dimensions' +
          (f', exact text match with {args.compare_copy}' if args.compare_copy else ''))


if __name__ == '__main__':
    main()
