"""StarPath document output helpers. Copyright 2026 StarPath contributors. MIT."""
import os
from pathlib import Path
import zipfile

from lxml import etree


def save_new(output, write):
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation preserves an existing result, including symlink targets.
    with path.open('xb') as stream:
        try:
            write(stream)
            stream.flush()
            os.fsync(stream.fileno())
        except BaseException:
            stream.close()
            path.unlink(missing_ok=True)
            raise


def parse_xml(data):
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False)
    element = etree.fromstring(data, parser)
    if element.getroottree().docinfo.doctype:
        raise ValueError('Document XML must not contain a DTD')
    return element


def xml_bytes(element):
    return etree.tostring(element, xml_declaration=True, encoding='UTF-8', standalone=True)


def rewrite_package(source, output, changes):
    def write(stream):
        with zipfile.ZipFile(source) as original, zipfile.ZipFile(stream, 'w') as result:
            for item in original.infolist():
                result.writestr(item, changes.get(item.filename, original.read(item)))
    save_new(output, write)
