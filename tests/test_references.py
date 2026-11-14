"""Keep reference translations aligned when source lists or station files change."""
import json
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from build import PAGES
from platform_build import LANGUAGES

ROOT = Path(__file__).resolve().parents[1]


class ReferenceIndex(HTMLParser):
    def __init__(self, filename):
        super().__init__()
        self.language = ""
        self.switches = {}
        self.dashboard_switches = {}
        self.language_links = {}
        self.language_options = []
        self.internal_links = set()
        self.alternates = {}
        self.sections = {}
        self.topics = []
        self.section = None
        self.feed((ROOT / filename).read_text(encoding="utf-8"))
        self.close()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html":
            self.language = a["lang"]
        elif tag == "link" and a.get("rel") == "alternate":
            self.alternates[a["hreflang"]] = a["href"]
        elif tag == "span" and a.get("aria-current") == "page" and "lang" in a:
            self.language_options.append((a["lang"], True))
        elif tag == "section":
            self.section = a.get("id")
            if self.section:
                self.sections[self.section] = []
        elif tag == "dt":
            self.topics.append(self.section)
        elif tag == "a":
            target = urlsplit(a["href"])
            if "hreflang" in a:
                self.language_links[a["hreflang"]] = a["href"]
                self.language_options.append((a["hreflang"], False))
            elif not target.netloc and not target.scheme and target.path.endswith(".html"):
                self.internal_links.add(target.path)
            if "data-reference-language" in a:
                self.switches[a["hreflang"]] = a["href"]
            if "data-language-case" in a:
                self.dashboard_switches[a["hreflang"]] = a["href"]
            if self.section:
                self.sections[self.section].append((a["href"], "download" in a))

    def handle_endtag(self, tag):
        if tag == "section":
            self.section = None


class ReferenceTranslationTests(unittest.TestCase):
    def test_dashboard_language_links_point_to_the_same_model(self):
        versions = {"en": "index.html", "zh-Hans": "regional-zh.html",
                    "ru": "regional-ru.html", "kk": "regional-kk.html"}
        def model(filename):
            html = (ROOT / filename).read_text(encoding="utf-8")
            return html.split('id="lab-data">', 1)[1].split("</script>", 1)[0]
        original = model(versions["en"])
        for language, filename in versions.items():
            with self.subTest(language=language):
                page = ReferenceIndex(filename)
                self.assertEqual(page.language, language)
                self.assertEqual(page.alternates, versions)
                self.assertEqual(page.dashboard_switches, {lang: url for lang, url in versions.items() if lang != language})
                self.assertEqual(model(filename), original)

    def test_language_links_and_sources_match_in_each_topic(self):
        versions = {"en": "references.html", "zh-Hans": "references-zh.html",
                    "ru": "references-ru.html", "kk": "references-kk.html"}
        english = ReferenceIndex(versions["en"])
        manifest = json.loads((ROOT / "data/regions/stations.json").read_text(encoding="utf-8"))
        for language, filename in versions.items():
            with self.subTest(language=language):
                page = ReferenceIndex(filename)
                self.assertEqual(page.language, language)
                self.assertEqual(page.alternates, versions)
                self.assertEqual(page.switches, {lang: url for lang, url in versions.items() if lang != language})
                self.assertEqual(list(page.sections), list(english.sections))
                page_targets = {filename: PAGES[key + LANGUAGES[language][0]]
                                for key, filename in PAGES.items() if "_" not in key}
                def localized_link(url):
                    parts = urlsplit(url)
                    return urlunsplit(parts._replace(path=page_targets.get(parts.path, parts.path)))
                expected = {
                    topic: [(localized_link(url), download) for url, download in links]
                    for topic, links in english.sections.items()
                }
                self.assertEqual(page.sections, expected)
                self.assertEqual(page.topics, english.topics)
                archives = [url for url, _ in page.sections["stations"] if url.endswith(".zip")]
                self.assertCountEqual(archives, [station["source_url"] for station in manifest])

    def test_language_menu_and_internal_navigation_stay_on_the_same_study(self):
        for key in (name for name in PAGES if "_" not in name):
            equivalents = {language: PAGES[key + suffix] for language, (suffix, _, _) in LANGUAGES.items()}
            for language, filename in equivalents.items():
                with self.subTest(study=key, language=language):
                    page = ReferenceIndex(filename)
                    self.assertEqual(page.language, language)
                    self.assertEqual(page.alternates, equivalents)
                    self.assertEqual(page.language_options,
                                     [(lang, lang == language) for lang in ("en", "kk", "ru", "zh-Hans")])
                    self.assertEqual(page.language_links, {lang: url for lang, url in equivalents.items() if lang != language})
                    allowed = {PAGES[study + LANGUAGES[language][0]] for study in PAGES if "_" not in study}
                    self.assertTrue(page.internal_links <= allowed, page.internal_links - allowed)
