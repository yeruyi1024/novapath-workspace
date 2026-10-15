"""StarPath PDF inspection, merge, page selection and form filling. MIT."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'local-tools' / 'scripts'))
from starpath_document_io import save_new
from pypdf import PdfReader, PdfWriter


def inspect(source):
    reader = PdfReader(source)
    fields = reader.get_fields() or {}
    return {
        'pages': [{'number': index + 1, 'width': float(page.mediabox.width), 'height': float(page.mediabox.height),
                   'text': page.extract_text() or ''} for index, page in enumerate(reader.pages)],
        'fields': {name: {'type': str(field.get('/FT', '')), 'value': str(field.get('/V', ''))} for name, field in fields.items()},
    }


def select(source, output, pages):
    reader = PdfReader(source)
    indices = []
    for item in pages.split(','):
        endpoints = item.split('-')
        if len(endpoints) > 2:
            raise ValueError('Use page numbers or ascending page ranges')
        start, end = int(endpoints[0]), int(endpoints[-1])
        if start < 1 or end < start or end > len(reader.pages):
            raise ValueError('Page selection is outside the document')
        indices.extend(range(start - 1, end))
    writer = PdfWriter()
    for index in indices:
        writer.add_page(reader.pages[index])
    save_new(output, writer.write)


def merge(sources, output):
    writer = PdfWriter()
    for source in sources:
        writer.append(source)
    save_new(output, writer.write)


def fill(source, output, values):
    if not isinstance(values, dict):
        raise ValueError('Form values must be a JSON object')
    reader = PdfReader(source)
    fields = reader.get_fields() or {}
    if not fields or set(values) - set(fields):
        raise ValueError('Form fields are missing or unknown')
    if any(fields[name].get('/FT') == '/Sig' for name in values):
        raise ValueError('Signature fields require a signing workflow')
    writer = PdfWriter(clone_from=reader)
    writer.update_page_form_field_values(None, values, auto_regenerate=False)
    save_new(output, writer.write)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('inspect').add_argument('input')
    command = commands.add_parser('merge')
    command.add_argument('output')
    command.add_argument('inputs', nargs='+')
    for name in ('select', 'fill'):
        command = commands.add_parser(name)
        command.add_argument('input')
        command.add_argument('output')
        command.add_argument('--pages' if name == 'select' else '--values', required=True)
    args = parser.parse_args()
    if args.command == 'inspect':
        print(json.dumps(inspect(args.input), ensure_ascii=False, indent=2))
    elif args.command == 'merge':
        merge(args.inputs, args.output)
    elif args.command == 'select':
        select(args.input, args.output, args.pages)
    else:
        fill(args.input, args.output, json.loads(Path(args.values).read_text(encoding='utf-8')))


if __name__ == '__main__':
    main()
