"""StarPath Word inspection, comments and text revisions. MIT."""
import argparse
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'local-tools' / 'scripts'))
from starpath_document_io import parse_xml, rewrite_package, save_new, xml_bytes
from docx import Document
from lxml import etree

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS = {'w': W}


def inspect(source):
    document = Document(source)
    with zipfile.ZipFile(source) as package:
        body = parse_xml(package.read('word/document.xml'))
    return {
        'paragraphs': [paragraph.text for paragraph in document.paragraphs],
        'tables': [[[cell.text for cell in row.cells] for row in table.rows] for table in document.tables],
        'comments': [{'id': item.comment_id, 'author': item.author, 'text': item.text} for item in document.comments],
        'insertions': len(body.findall('.//w:ins', NS)),
        'deletions': len(body.findall('.//w:del', NS)),
    }


def edit(source, output, paragraph_index, text, author, revision):
    document = Document(source)
    if paragraph_index < 0 or paragraph_index >= len(document.paragraphs):
        raise ValueError('Paragraph index is outside the document')
    paragraph = document.paragraphs[paragraph_index]
    if not revision:
        if not paragraph.runs:
            raise ValueError('Comment anchor requires an existing text run')
        document.add_comment(paragraph.runs, text=text, author=author, initials=author[:2])
        save_new(output, document.save)
        return
    # Restrict the helper to plain paragraphs; existing rich structure is never flattened.
    with zipfile.ZipFile(source) as package:
        body = parse_xml(package.read('word/document.xml'))
    target = body.find('w:body', NS).findall('w:p', NS)[paragraph_index]
    for child in target:
        if child.tag == f'{{{W}}}pPr':
            continue
        if child.tag != f'{{{W}}}r' or any(node.tag not in (f'{{{W}}}rPr', f'{{{W}}}t') for node in child):
            raise ValueError('Rich paragraphs require a targeted OOXML edit')
    ids = [int(value) for value in body.xpath('//@w:id', namespaces=NS) if value.isdigit()]
    next_id = max(ids, default=-1) + 1
    runs = list(target.findall('w:r', NS))
    removed = etree.Element(f'{{{W}}}del')
    added = etree.Element(f'{{{W}}}ins')
    for offset, element in enumerate((removed, added)):
        element.set(f'{{{W}}}id', str(next_id + offset))
        element.set(f'{{{W}}}author', author)
        element.set(f'{{{W}}}date', datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'))
    for run in runs:
        target.remove(run)
        for node in run.findall('w:t', NS):
            node.tag = f'{{{W}}}delText'
        removed.append(run)
    run = etree.SubElement(added, f'{{{W}}}r')
    if runs and runs[0].find('w:rPr', NS) is not None:
        run.append(deepcopy(runs[0].find('w:rPr', NS)))
    node = etree.SubElement(run, f'{{{W}}}t')
    node.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    node.text = text
    target.extend((removed, added))
    rewrite_package(source, output, {'word/document.xml': xml_bytes(body)})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('inspect').add_argument('input')
    for name in ('comment', 'revise'):
        command = commands.add_parser(name)
        command.add_argument('input')
        command.add_argument('output')
        command.add_argument('--paragraph', type=int, required=True)
        command.add_argument('--text', required=True)
        command.add_argument('--author', default='StarPath')
    args = parser.parse_args()
    if args.command == 'inspect':
        print(json.dumps(inspect(args.input), ensure_ascii=False, indent=2))
    else:
        edit(args.input, args.output, args.paragraph, args.text, args.author, args.command == 'revise')


if __name__ == '__main__':
    main()
