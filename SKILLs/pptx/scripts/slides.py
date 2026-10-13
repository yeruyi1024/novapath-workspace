"""StarPath presentation inventory, text editing and slide ordering. MIT."""
import argparse
import json
from pathlib import Path
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'local-tools' / 'scripts'))
from starpath_document_io import parse_xml, rewrite_package, save_new, xml_bytes
from pptx import Presentation

P = 'http://schemas.openxmlformats.org/presentationml/2006/main'


def inspect(source):
    deck = Presentation(source)
    return {'slides': [{
        'index': index,
        'shapes': [{'index': shape_index, 'text': shape.text} for shape_index, shape in enumerate(slide.shapes) if shape.has_text_frame],
        'notes': slide.notes_slide.notes_text_frame.text if slide.has_notes_slide and slide.notes_slide.notes_text_frame else '',
    } for index, slide in enumerate(deck.slides)]}


def replace(source, output, slide_index, shape_index, text):
    deck = Presentation(source)
    if slide_index < 0 or slide_index >= len(deck.slides):
        raise ValueError('Slide index is outside the presentation')
    slide = deck.slides[slide_index]
    if shape_index < 0 or shape_index >= len(slide.shapes):
        raise ValueError('Shape index is outside the slide')
    shape = slide.shapes[shape_index]
    if not shape.has_text_frame:
        raise ValueError('The selected shape is not a text shape')
    paragraphs = shape.text_frame.paragraphs
    if len(paragraphs) != 1 or len(paragraphs[0].runs) > 1:
        raise ValueError('Rich text requires editing a specific run')
    if paragraphs[0].runs:
        if paragraphs[0].runs[0].hyperlink.address:
            raise ValueError('Hyperlinked text requires a targeted edit')
        paragraphs[0].runs[0].text = text
    else:
        paragraphs[0].add_run().text = text
    save_new(output, deck.save)


def reorder(source, output, order):
    with zipfile.ZipFile(source) as package:
        presentation = parse_xml(package.read('ppt/presentation.xml'))
    slide_list = presentation.find(f'{{{P}}}sldIdLst')
    slides = list(slide_list) if slide_list is not None else []
    if not order or len(set(order)) != len(order) or any(index < 0 or index >= len(slides) for index in order):
        raise ValueError('Use a nonempty list of unique valid slide indices')
    # Keep all related parts, including media/notes and unselected slides; only the
    # presentation order changes. No slide relationship needs to be regenerated.
    for slide in slides:
        slide_list.remove(slide)
    for index in order:
        slide_list.append(slides[index])
    rewrite_package(source, output, {'ppt/presentation.xml': xml_bytes(presentation)})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('inspect').add_argument('input')
    for name in ('replace', 'reorder'):
        command = commands.add_parser(name)
        command.add_argument('input')
        command.add_argument('output')
        if name == 'replace':
            command.add_argument('--slide', type=int, required=True)
            command.add_argument('--shape', type=int, required=True)
            command.add_argument('--text', required=True)
        else:
            command.add_argument('--order', required=True)
    args = parser.parse_args()
    if args.command == 'inspect':
        print(json.dumps(inspect(args.input), ensure_ascii=False, indent=2))
    elif args.command == 'replace':
        replace(args.input, args.output, args.slide, args.shape, args.text)
    else:
        reorder(args.input, args.output, [int(value) for value in args.order.split(',')])


if __name__ == '__main__':
    main()
