import sys
from pathlib import Path
from xml.etree import ElementTree as ET

sys.path.append(str(Path(__file__).resolve().parents[1]))

from autopost.pull_news import parse_item_date, today_iso


def test_parse_item_date_defaults_to_today_without_namespaced_dates():
    item = ET.fromstring(
        """
        <item>
            <title>Example</title>
            <description>No date information available.</description>
        </item>
        """
    )

    assert parse_item_date(item) == today_iso()


def test_parse_item_date_parses_namespaced_dates():
    item = ET.fromstring(
        """
        <item xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
            <title>Example</title>
            <atom:updated>2024-05-01T08:30:00Z</atom:updated>
            <dc:date>2024-05-02</dc:date>
        </item>
        """
    )

    assert parse_item_date(item) == "2024-05-01"
